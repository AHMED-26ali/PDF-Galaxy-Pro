import {
    AlignmentType, Document, HorizontalPositionRelativeFrom, Packer, Paragraph, TextRun,
    TextWrappingType, VerticalPositionRelativeFrom, type ISectionOptions,
} from 'docx';
import { ShapeRun } from 'docx/shapes';
import type { Bbox, Line, LoggerMessage, RecognizeResult, Word } from 'tesseract.js';
import { createOcrWorker } from './ocrRuntime';
import { wordImageSection } from './pdfToWordLayout';
import { canvasToBlob, clearCanvas, renderPdfPage, withPdf } from './pdfRuntime';
import { scanGrid } from './wordScanGrid';

type PositionedText = { box: Bbox; text: string; manual?: boolean; confidence?: number; color?: string };
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

function lineParts(line: Line) {
    const words = line.words.filter(word => word.text.trim()).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const heights = words.map(word => word.bbox.y1 - word.bbox.y0).sort((a, b) => a - b);
    const separator = Math.max(10, (heights[Math.floor(heights.length / 2)] ?? 0) * 1.65);
    const groups: Word[][] = [];
    for (const word of words) {
        const group = groups.at(-1);
        if (!group || word.bbox.x0 - group.at(-1)!.bbox.x1 > separator) groups.push([word]);
        else group.push(word);
    }
    if (groups.length <= 1) return [{ text: line.text, confidence: line.confidence, box: line.bbox }];
    return groups.map(group => {
        const rtl = group.filter(word => arabic.test(word.text)).length > group.length / 2;
        return {
            text: (rtl ? [...group].reverse() : group).map(word => word.text).join(' '),
            confidence: group.reduce((total, word) => total + word.confidence, 0) / group.length,
            box: {
                x0: group[0].bbox.x0, x1: Math.max(...group.map(word => word.bbox.x1)),
                y0: Math.min(...group.map(word => word.bbox.y0)), y1: Math.max(...group.map(word => word.bbox.y1)),
            },
        };
    });
}

function recognizedText({ data }: RecognizeResult, offset: Offset) {
    const result: PositionedText[] = [];
    for (const block of data.blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
        for (const part of lineParts(line)) {
            const value = part.text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
            const letters = value.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
            if (part.confidence < 38 || letters < 1 || (letters === 1 && part.confidence < 76)) continue;
            result.push({ text: value, confidence: part.confidence, box: {
                x0: part.box.x0 + offset.x, x1: part.box.x1 + offset.x,
                y0: part.box.y0 + offset.y, y1: part.box.y1 + offset.y,
            } });
        }
    }
    return result;
}

function mergeRecognizedLines(preferred: PositionedText[], other: PositionedText[]) {
    const result = [...preferred];
    for (const next of other) {
        const a = next.box;
        const hits = result.flatMap(({ box: b }, index) => {
            const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
            const h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
            return w > 0.58 * Math.min(a.x1 - a.x0, b.x1 - b.x0) &&
                h > 0.62 * Math.min(a.y1 - a.y0, b.y1 - b.y0) ? [index] : [];
        });
        if (hits.length === 0) result.push(next);
        if (hits.length === 1) {
            const current = result[hits[0]];
            const coversLine = a.x1 - a.x0 >= (current.box.x1 - current.box.x0) * 0.82;
            if (coversLine && (next.confidence ?? 0) > (current.confidence ?? 0) + 7) result[hits[0]] = next;
        }
    }
    return result.sort((a, b) => a.box.y0 - b.box.y0 || b.box.x1 - a.box.x1);
}

function makePageOcrImage(source: HTMLCanvasElement, target: HTMLCanvasElement) {
    const ctx = source.getContext('2d');
    if (!ctx) return source;
    const { width, height } = source;
    const pixels = ctx.getImageData(0, 0, width, height);
    let colored = 0;
    for (let i = 0; i < pixels.data.length; i += 40) {
        const [r, g, b] = [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]];
        const max = Math.max(r, g, b);
        if (max >= 172 && max - Math.min(r, g, b) > 14) colored++;
    }
    if (colored < pixels.data.length / 40 * 0.18) return source;
    target.width = width;
    target.height = height;
    for (let i = 0; i < pixels.data.length; i += 4) {
        const max = Math.max(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]);
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = max <= 150 ? 0 : 255;
    }
    target.getContext('2d')?.putImageData(pixels, 0, 0);
    return target;
}

function neutralInk(pixels: Uint8ClampedArray, index: number) {
    const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
    const lightness = Math.max(r, g, b);
    return lightness < 206 && lightness - Math.min(r, g, b) < 38;
}

function coloredInk(pixels: Uint8ClampedArray, index: number) {
    const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
    return Math.max(r, g, b) - Math.min(r, g, b) >= 46 && r * 0.21 + g * 0.72 + b * 0.07 < 158;
}

function colorFamily(pixels: Uint8ClampedArray, index: number) {
    const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
    return r >= g && r >= b ? 0 : g >= b ? 1 : 2;
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
        let lightEdges = 0, edges = 0;
        const colors = [
            { n: 0, rgb: [0, 0, 0] },
            { n: 0, rgb: [0, 0, 0] },
            { n: 0, rgb: [0, 0, 0] },
        ];
        for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) {
            const index = (y * area.width + x) * 4;
            if (neutralInk(source, index)) printed++;
            if (coloredInk(source, index)) {
                const color = colors[colorFamily(source, index)];
                color.n++;
                for (let channel = 0; channel < 3; channel++) color.rgb[channel] += source[index + channel];
            }
            if (y < 3 || y >= area.height - 3 || x < 3 || x >= area.width - 3) {
                edges++;
                if (Math.min(source[index], source[index + 1], source[index + 2]) >= 205) lightEdges++;
            }
        }
        const colored = colors.reduce((sum, entry) => sum + entry.n, 0);
        const family = colors.indexOf(colors.reduce((best, color) => color.n > best.n ? color : best));
        const accent = colored > printed * 1.8 && colors[family].n >= 12 &&
            colors[family].n >= colored * 0.82 && lightEdges >= edges * 0.84;
        const ink = (index: number) => accent
            ? coloredInk(source, index) && colorFamily(source, index) === family
            : neutralInk(source, index);
        const detected = accent ? colors[family].n : printed;
        if (!item.manual && (detected < area.width * area.height * 0.014 || (!accent && colored > printed * 0.55))) continue;
        const dividers = new Uint8Array(area.width);
        for (let x = 0; x < area.width; x++) {
            let dark = 0;
            for (let y = 0; y < area.height; y++) {
                if (ink((y * area.width + x) * 4)) dark++;
            }
            if (dark > area.height * 0.82) dividers[x] = 1;
        }
        for (let y = 2; y < area.height - 2; y++) {
            const row = y * area.width;
            let dark = 0;
            for (let x = 0; x < area.width; x++) if (ink((row + x) * 4)) dark++;
            if (dark > area.width * 0.83) continue;
            for (let x = 2; x < area.width - 2; x++) {
                const point = (y * area.width + x) * 4;
                if (dividers[x] || !ink(point)) continue;
                // Interpolate through the print strokes while leaving colored artwork intact.
                let left = x - 1, right = x + 1;
                while (left > 0 && ink((row + left) * 4)) left--;
                while (right + 1 < area.width && ink((row + right) * 4)) right++;
                const a = (row + left) * 4, b = (row + right) * 4;
                if (ink(a) || ink(b)) continue;
                const fraction = (x - left) / (right - left);
                for (let channel = 0; channel < 3; channel++) {
                    area.data[point + channel] = source[a + channel] * (1 - fraction) + source[b + channel] * fraction;
                }
            }
        }
        ctx.putImageData(area, box.x0 - 4, box.y0 - 4);
        const color = accent ? colors[family].rgb.map(sum =>
            Math.round(sum / colors[family].n).toString(16).padStart(2, '0')).join('').toUpperCase() : undefined;
        editable.push({ ...item, color });
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
            children: [new TextRun({ text, font: 'Arial', size: fontSize, sizeComplexScript: fontSize, color: item.color ?? '161616', rightToLeft: rtl })],
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
                return text ? [{ box: field.box, text, manual: field.manual || text !== field.text }] : [];
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
                const contrast = document.createElement('canvas');
                try {
                    const grid = scanGrid(canvas);
                    const pageImage = makePageOcrImage(canvas, contrast);
                    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
                    const result = await worker.recognize(pageImage, {}, { text: true, blocks: true });
                    let lines = recognizedText(result, { x: 0, y: 0 });
                    if (lines.length < 8 || result.data.confidence < 67) {
                        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
                        const sparse = await worker.recognize(pageImage, {}, { text: true, blocks: true });
                        lines = mergeRecognizedLines(lines, recognizedText(sparse, { x: 0, y: 0 }));
                    }
                    if (grid) {
                        const gridLines: PositionedText[] = [];
                        const total = grid.cells.flat().length;
                        let count = 0;
                        for (const row of grid.cells) {
                            await worker.setParameters({ tessedit_pageseg_mode: row.length === 1 ? PSM.AUTO : PSM.SINGLE_BLOCK });
                            for (const cell of row) {
                                const origin = grid.crop(cell, crop);
                                onStatus(`صفحة ${number} من ${pdf.numPages} · قراءة الخانة ${++count} من ${total}…`);
                                if (origin) gridLines.push(...recognizedText(await worker.recognize(crop, {}, { text: true, blocks: true }), origin));
                            }
                        }
                        lines = mergeRecognizedLines(gridLines, lines);
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
                    clearCanvas(contrast);
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
