import { PDFDocument, degrees, rgb, type PDFRef } from 'pdf-lib';
import { getVisiblePage } from '../pdf-pages/pdfOperations';
import { canvasToBlob, clearCanvas } from '../pdfRuntime';
import { createEditorFontLoader, rewriteNativeText, type TextChange, type TextStyle } from './nativeText';
import { removeObsoleteStreams } from './contentStream';

export type EditorImage = {
    id: string;
    page: number;
    blob: Blob;
    ratio: number;
    x: number;
    y: number;
    width: number;
    angle: number;
};

export type AddedText = { id: string; page: number; text: string; x: number; y: number; style: TextStyle };
export type EditorChanges = { text: Record<number, TextChange[]>; images: EditorImage[]; addedText: AddedText[] };

export async function loadImage(file: File) {
    const url = URL.createObjectURL(file);
    const canvas = document.createElement('canvas');
    try {
        const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        const png = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e;
        const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
        const webp = String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
        if (!png && !jpeg && !webp) throw new Error('Unsupported image');
        const image = new Image();
        image.src = url;
        await image.decode();
        const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return { blob: await canvasToBlob(canvas), ratio: canvas.width / canvas.height };
    } finally {
        URL.revokeObjectURL(url);
        clearCanvas(canvas);
    }
}

export async function saveEditorPdf(bytes: Uint8Array, changes: EditorChanges) {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const obsolete = new Set<PDFRef>();
    const loadFont = createEditorFontLoader(pdf);
    for (const [number, edits] of Object.entries(changes.text)) {
        const page = pdf.getPage(Number(number));
        await rewriteNativeText(pdf, page, edits, loadFont, obsolete);
    }
    removeObsoleteStreams(pdf, obsolete);

    for (const addition of changes.addedText) {
        const page = pdf.getPage(addition.page);
        const view = getVisiblePage(page);
        const text = addition.text.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const { font } = await loadFont(text, addition.style);
        const size = addition.style.size;
        const x = addition.x * view.width / 100;
        const y = addition.y * view.height / 100;
        const width = font.widthOfTextAtSize(text, size);
        const adjustedSize = width > view.width - x ? size * (view.width - x) / width : size;
        if (adjustedSize <= 0) continue;
        const channels = (addition.style.color ?? '#0f172a').match(/[a-f0-9]{2}/gi)!.map(channel => parseInt(channel, 16) / 255);
        page.drawText(text, {
            ...view.toPdfPoint(x, y),
            size: adjustedSize, font, color: rgb(channels[0], channels[1], channels[2]), rotate: degrees(view.rotation),
        });
    }

    const embedded = new Map<Blob, Awaited<ReturnType<typeof pdf.embedPng>>>();
    for (const item of changes.images) {
        const page = pdf.getPage(item.page);
        const view = getVisiblePage(page);
        let image = embedded.get(item.blob);
        if (!image) {
            image = await pdf.embedPng(await item.blob.arrayBuffer());
            embedded.set(item.blob, image);
        }
        const width = view.width * item.width / 100;
        const height = width / item.ratio;
        const angle = item.angle * Math.PI / 180;
        const x = view.width * item.x / 100 - width / 2 * Math.cos(angle) - height / 2 * Math.sin(angle);
        const y = view.height * item.y / 100 - width / 2 * Math.sin(angle) + height / 2 * Math.cos(angle);
        page.drawImage(image, { ...view.toPdfPoint(x, y), width, height, rotate: degrees(view.rotation - item.angle) });
    }

    return pdf.save();
}
