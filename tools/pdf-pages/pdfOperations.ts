import type { PDFPage } from 'pdf-lib';

export type PageOperation = 'delete' | 'extract' | 'reorder';

export async function editPageOrder(bytes: Uint8Array, operation: PageOperation, indices: number[]) {
    const { PDFDocument, PDFName } = await import('pdf-lib');
    const source = await PDFDocument.load(bytes, { updateMetadata: false });
    const count = source.getPageCount();
    if (!indices.length || new Set(indices).size !== indices.length
        || indices.some(index => !Number.isInteger(index) || index < 0 || index >= count)
        || (operation === 'reorder' && indices.length !== count)) {
        throw new Error('Invalid PDF page selection');
    }

    if (operation === 'reorder') {
        const originalPages = source.getPages();
        // Moving pages to the root can change their inherited settings.
        const inheritedKeys = ['Resources', 'MediaBox', 'CropBox', 'Rotate'].map(PDFName.of);
        for (const page of originalPages) {
            for (const key of inheritedKeys) {
                const value = page.node.getInheritableAttribute(key);
                if (value !== undefined) page.node.set(key, value);
            }
        }
        for (let index = originalPages.length - 1; index >= 0; index--) {
            source.removePage(index);
        }
        for (const index of indices) {
            source.addPage(originalPages[index]);
        }
        return source.save();
    }

    const result = await PDFDocument.create();
    const pages = await result.copyPages(source, indices);
    for (const page of pages) {
        result.addPage(page);
    }
    return result.save();
}

export type Edges = { top: number; right: number; bottom: number; left: number };

export function getVisiblePage(page: PDFPage) {
    const media = page.getMediaBox();
    const crop = page.getCropBox();
    const left = Math.max(media.x, crop.x);
    const bottom = Math.max(media.y, crop.y);
    const right = Math.min(media.x + media.width, crop.x + crop.width);
    const top = Math.min(media.y + media.height, crop.y + crop.height);
    const box = right > left && top > bottom
        ? { x: left, y: bottom, width: right - left, height: top - bottom }
        : media;

    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const sideways = rotation === 90 || rotation === 270;
    const width = sideways ? box.height : box.width;
    const height = sideways ? box.width : box.height;

    function toPdfPoint(x: number, y: number) {
        switch (rotation) {
            case 90: return { x: box.x + y, y: box.y + x };
            case 180: return { x: box.x + box.width - x, y: box.y + y };
            case 270: return { x: box.x + box.width - y, y: box.y + box.height - x };
            default: return { x: box.x + x, y: box.y + box.height - y };
        }
    }

    return { width, height, rotation, toPdfPoint };
}

export function cropPage(page: PDFPage, edges: Edges) {
    const { width, height, toPdfPoint } = getVisiblePage(page);
    const start = toPdfPoint(width * edges.left / 100, height * edges.top / 100);
    const end = toPdfPoint(width * (1 - edges.right / 100), height * (1 - edges.bottom / 100));
    page.setCropBox(
        Math.min(start.x, end.x),
        Math.min(start.y, end.y),
        Math.abs(end.x - start.x),
        Math.abs(end.y - start.y),
    );
}

export function getSignatureRectangle(
    page: { width: number; height: number },
    aspectRatio: number,
    scale: number,
    horizontal: number,
    vertical: number,
) {
    const width = Math.min(page.width * scale / 100, page.height * aspectRatio);
    const height = width / aspectRatio;
    return {
        width,
        height,
        x: (page.width - width) * horizontal / 100,
        y: (page.height - height) * vertical / 100,
    };
}
