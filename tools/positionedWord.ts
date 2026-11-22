import {
    AlignmentType, Document, HorizontalPositionRelativeFrom, Packer, Paragraph, TextRun,
    TextWrappingType, VerticalPositionRelativeFrom, type ISectionOptions,
} from 'docx';
import { ShapeRun } from 'docx/shapes';
import type { Bbox, LoggerMessage, RecognizeResult } from 'tesseract.js';
import { createOcrWorker } from './ocrRuntime';
import { wordImageSection } from './pdfToWordLayout';
import { canvasToBlob, clearCanvas, renderPdfPage, withPdf } from './pdfRuntime';
import { scanGrid } from './wordScanGrid';

type PositionedText = { box: Bbox; text: string; manual?: boolean };
type Offset = { x: number; y: number };
const arabic = /[\u0600-\u08ff]/;
export type PositionedWordDraft = {
    pages: {
        viewport: { width: number; height: number };
        number: number;
        image: Blob;
        width: number;
        height: number;
        fields: (PositionedText & { id: number; preview: string })[];
    }[];
};

function trustedText({ data }: RecognizeResult, offset: Offset) {
    const result: PositionedText[] = [];
    for (const block of data.blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
        const value = line.text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
        const meaningful = line.words.filter(word => /[\p{L}\p{N}]/u.test(word.text));
        const isArabic = arabic.test(value);
        if (line.confidence < 83 || !/[\p{L}\p{N}]{2}/u.test(value) ||
            meaningful.some(word => word.confidence < 67) || /[|©=<>"@#]/.test(value) ||
            (isArabic && (/[A-Za-z]/.test(value) || (value.match(/\p{Nd}+/gu)?.length ?? 0) > 1)) ||
            (!isArabic && /[\p{Nd}]/u.test(value) && !/[A-Za-z]/.test(value) && meaningful.length !== 1)) continue;
        result.push({ text: value, box: {
            x0: line.bbox.x0 + offset.x, x1: line.bbox.x1 + offset.x,
            y0: line.bbox.y0 + offset.y, y1: line.bbox.y1 + offset.y,
        } });
    }
    return result;
}

function neutralInk(pixels: Uint8ClampedArray, index: number) {
    const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
    const lightness = Math.max(r, g, b);
    return lightness < 206 && lightness - Math.min(r, g, b) < 38;
}

function removePrintedText(canvas: HTMLCanvasElement, lines: PositionedText[]) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('تعذّر تجهيز صفحة Word.');
    const { width, height } = canvas;
    const editable: PositionedText[] = [];
    for (const item of lines) {
        const { box } = item;
        const area = ctx.getImageData(box.x0 - 4, box.y0 - 4, box.x1 - box.x0 + 8, box.y1 - box.y0 + 8);
        const source = area.data.slice();
        let printed = 0;
        let colored = 0;
        for (let index = 0; index < source.length; index += 4) {
            if (neutralInk(source, index)) printed++;
            else if (Math.max(source[index], source[index + 1], source[index + 2]) < 187) colored++;
        }
        if (!item.manual && (printed < area.width * area.height * 0.02 || colored > printed * 0.35)) continue;
        const dividers = new Uint8Array(area.width);
        for (let x = 0; x < area.width; x++) {
            let dark = 0;
            for (let y = 0; y < area.height; y++) {
                if (neutralInk(source, (y * area.width + x) * 4)) dark++;
            }
            if (dark > area.height * 0.82) dividers[x] = 1;
        }
        for (let y = 2; y < area.height - 2; y++) for (let x = 2; x < area.width - 2; x++) {
            const point = (y * area.width + x) * 4;
            if (dividers[x] || !neutralInk(source, point)) continue;
            // Interpolate through the print strokes while leaving colored artwork intact.
            let left = x - 1, right = x + 1;
            const row = y * area.width;
            while (left > 0 && neutralInk(source, (row + left) * 4)) left--;
            while (right + 1 < area.width && neutralInk(source, (row + right) * 4)) right++;
            const a = (row + left) * 4, b = (row + right) * 4;
            if (neutralInk(source, a) || neutralInk(source, b)) continue;
            const fraction = (x - left) / (right - left);
            for (let channel = 0; channel < 3; channel++) {
                area.data[point + channel] = source[a + channel] * (1 - fraction) + source[b + channel] * fraction;
            }
        }
        ctx.putImageData(area, box.x0 - 4, box.y0 - 4);
        editable.push(item);
    }
    return { ctx, width, height, editable };
}

function editableShape(item: PositionedText, bounds: { width: number; height: number }, page: Offset, measurement: CanvasRenderingContext2D) {
    const { box, text } = item;
    const rtl = arabic.test(text);
    const horizontalScale = page.x / bounds.width;
    const verticalScale = page.y / bounds.height;
    const inkWidth = (box.x1 - box.x0) * horizontalScale;
    const inkHeight = (box.y1 - box.y0) * verticalScale;
    measurement.font = '100px Arial';
    const measured = measurement.measureText(text);
    const measuredHeight = measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent;
    const measuredSize = 150 * Math.min(inkWidth / Math.max(1, measured.width), inkHeight / Math.max(1, measuredHeight));
    // Arabic glyph widths can grow in Word when its installed font differs from the browser font.
    const fontSize = Math.max(9, Math.min(84, Math.round(Math.min(inkHeight * 1.85, measuredSize) * (rtl ? 0.63 : 0.97))));
    const extra = Math.max(2, Math.min(inkWidth * 0.20, 14));
    const x = Math.max(0, box.x0 * horizontalScale - (rtl ? extra : 0));
    const shapeWidth = Math.min(inkWidth + extra, page.x - x);
    const y = Math.max(0, box.y0 * verticalScale - inkHeight * 0.19);
    return new ShapeRun({
        type: 'rectangle',
        fill: 'none',
        line: 'none',
        transformation: { width: shapeWidth, height: Math.max(13, inkHeight * 1.9) },
        floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: Math.round(x * 9525) },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round(y * 9525) },
            allowOverlap: true,
            wrap: { type: TextWrappingType.NONE },
        },
        textOptions: { verticalAlignment: 'top', margins: { top: 0, bottom: 0, left: 0, right: 0 }, wrap: false },
        children: [new Paragraph({
            bidirectional: rtl,
            alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text, font: 'Arial', size: fontSize, sizeComplexScript: fontSize, color: '161616', rightToLeft: rtl })],
        })],
    });
}

export async function positionedWordPage(canvas: HTMLCanvasElement, viewport: { width: number; height: number }, pageNumber: number, lines: PositionedText[]) {
    const trusted = lines.filter(({ box }) => box.x0 >= 4 && box.y0 >= 4 && box.x1 + 4 < canvas.width &&
        box.y1 + 4 < canvas.height && box.x1 - box.x0 >= 8 && box.y1 - box.y0 >= 7);
    const fit = Math.min(1, 1584 / Math.max(viewport.width, viewport.height));
    const renderedSize = { x: Math.round(viewport.width * fit * 20) / 15, y: Math.round(viewport.height * fit * 20) / 15 };
    const { ctx, width, height, editable } = removePrintedText(canvas, trusted);
    const shapes = editable.map(item => editableShape(item, { width, height }, renderedSize, ctx));
    const image = await canvasToBlob(canvas);
    return {
        section: wordImageSection(viewport, pageNumber, new Uint8Array(await image.arrayBuffer()), 'png', shapes),
        values: editable.map(item => item.text),
    };
}

export async function exportPositionedWord(draft: PositionedWordDraft, reviewed: Record<number, string>) {
    const sections: ISectionOptions[] = [];
    const values: string[] = [];
    for (const page of draft.pages) {
        const bitmap = await createImageBitmap(page.image);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        try {
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('تعذّر تجهيز صفحة Word.');
            ctx.drawImage(bitmap, 0, 0);
            const fields = page.fields.flatMap(field => {
                const text = (reviewed[field.id] ?? field.text).trim();
                return text ? [{ box: field.box, text, manual: field.manual }] : [];
            });
            const result = await positionedWordPage(canvas, page.viewport, page.number, fields);
            sections.push(result.section);
            values.push(...result.values);
        } finally {
            bitmap.close();
            clearCanvas(canvas);
        }
    }
    return { blob: await Packer.toBlob(new Document({ sections })), values };
}

export function preparePositionedWord(
    file: File,
    onStatus: (status: string) => void,
    onProgress: (message: LoggerMessage) => void,
) {
    return withPdf(file, async pdf => {
        onStatus('جاري تهيئة التعرّف على النص في مكانه…');
        const worker = await createOcrWorker('ara+eng', onProgress);
        const draft: PositionedWordDraft = { pages: [] };
        let id = 0;
        try {
            const { PSM } = await import('tesseract.js');
            for (let number = 1; number <= pdf.numPages; number++) {
                onStatus(`جاري قراءة أماكن النص في الصفحة ${number} من ${pdf.numPages}…`);
                const page = await pdf.getPage(number);
                const canvas = await renderPdfPage(page, 4, 3600);
                const crop = document.createElement('canvas');
                try {
                    const grid = scanGrid(canvas);
                    const lines: PositionedText[] = [];
                    if (grid) {
                        const total = grid.cells.flat().length;
                        let count = 0;
                        for (const row of grid.cells) {
                            await worker.setParameters({ tessedit_pageseg_mode: row.length === 1 ? PSM.AUTO : PSM.SINGLE_BLOCK });
                            for (const cell of row) {
                                const origin = grid.crop(cell, crop);
                                onStatus(`صفحة ${number} من ${pdf.numPages} · قراءة الخانة ${++count} من ${total}…`);
                                if (origin) lines.push(...trustedText(await worker.recognize(crop, {}, { text: true, blocks: true }), origin));
                            }
                        }
                    } else {
                        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
                        lines.push(...trustedText(await worker.recognize(canvas, {}, { text: true, blocks: true }), { x: 0, y: 0 }));
                    }
                    const fields = lines.filter(({ box }) => box.x0 >= 4 && box.y0 >= 4 &&
                        box.x1 + 4 < canvas.width && box.y1 + 4 < canvas.height).map(line => {
                        const { x0, x1, y0, y1 } = line.box;
                        const width = x1 - x0 + 8;
                        const height = y1 - y0 + 8;
                        const scale = Math.min(1, 640 / width);
                        crop.width = Math.max(1, Math.round(width * scale));
                        crop.height = Math.max(1, Math.round(height * scale));
                        crop.getContext('2d')?.drawImage(canvas, x0 - 4, y0 - 4, width, height, 0, 0, crop.width, crop.height);
                        return { ...line, id: id++, preview: crop.toDataURL('image/jpeg', 0.82) };
                    });
                    draft.pages.push({
                        viewport: page.getViewport({ scale: 1 }), number, image: await canvasToBlob(canvas),
                        width: canvas.width, height: canvas.height, fields,
                    });
                } finally {
                    clearCanvas(crop);
                    clearCanvas(canvas);
                    page.cleanup();
                }
            }
            return draft;
        } finally {
            await worker.terminate();
        }
    });
}
