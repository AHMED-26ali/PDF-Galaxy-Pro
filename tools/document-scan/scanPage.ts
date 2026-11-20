import { canvasToBlob, clearCanvas } from '../pdfRuntime';

export type PageSize = { width: number; height: number };

function inkEdges(projection: Uint32Array, support: number) {
    let start = 0;
    let end = projection.length - 1;
    while (start < projection.length && projection[start] < support) start++;
    while (end > start && projection[end] < support) end--;
    return [start, end];
}

function contentBounds({ width, height, data }: ImageData) {
    const rows = new Uint32Array(height);
    const columns = new Uint32Array(width);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixel = (y * width + x) * 4;
            if (Math.min(data[pixel], data[pixel + 1], data[pixel + 2]) < 252) {
                rows[y]++;
                columns[x]++;
            }
        }
    }

    const rowSupport = Math.max(2, Math.round(width * 0.001));
    const columnSupport = Math.max(2, Math.round(height * 0.001));
    const [top, bottom] = inkEdges(rows, rowSupport);
    const [left, right] = inkEdges(columns, columnSupport);
    if (top >= bottom || left >= right) return { x: 0, y: 0, width, height };

    // Leave a small guard area around the detected ink for faint marks near the margins.
    const guard = Math.ceil(Math.max(width, height) * 0.012);
    const x = Math.max(0, left - guard);
    const y = Math.max(0, top - guard);
    return {
        x, y,
        width: Math.min(width, right + guard + 1) - x,
        height: Math.min(height, bottom + guard + 1) - y,
    };
}

function sharpenText(context: CanvasRenderingContext2D, width: number, height: number) {
    if (width < 8 || height < 8) return;
    const image = context.getImageData(0, 0, width, height);
    const ink = new Uint8Array(width * height);
    for (let index = 0; index < ink.length; index++) {
        const pixel = index * 4;
        ink[index] = image.data[pixel] * 0.299 + image.data[pixel + 1] * 0.587 + image.data[pixel + 2] * 0.114;
    }
    const radius = Math.max(1, Math.min(3, Math.round(Math.min(width, height) / 950)));
    const stride = radius * width;
    for (let y = radius; y < height - radius; y++) {
        for (let x = radius; x < width - radius; x++) {
            const index = y * width + x;
            const level = ink[index];
            const soft = (ink[index - radius] + ink[index + radius] + ink[index - stride] + ink[index + stride]) / 4;
            const detail = level - soft;
            if (Math.abs(detail) < 4) continue;
            const upper = Math.min(14, (255 - level) * 0.35);
            const correction = Math.max(-26, Math.min(upper, detail * (detail < 0 ? 0.75 : 0.45)));
            const pixel = index * 4;
            for (let channel = 0; channel < 3; channel++) image.data[pixel + channel] += correction;
        }
    }
    context.putImageData(image, 0, 0);
}

export async function scanPageJpeg(image: ImageData, size: PageSize) {
    const source = document.createElement('canvas');
    const page = document.createElement('canvas');
    try {
        const bounds = contentBounds(image);
        source.width = bounds.width;
        source.height = bounds.height;
        const pixels = source.getContext('2d');
        if (!pixels) throw new Error('Canvas unavailable');
        pixels.putImageData(image, -bounds.x, -bounds.y, bounds.x, bounds.y, bounds.width, bounds.height);

        page.width = size.width;
        page.height = size.height;
        const ctx = page.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, page.width, page.height);
        ctx.imageSmoothingQuality = 'high';
        const margin = Math.min(page.width, page.height) * 0.042;
        const scale = Math.min((page.width - margin * 2) / bounds.width, (page.height - margin * 2) / bounds.height);
        const width = bounds.width * scale;
        const height = bounds.height * scale;
        ctx.drawImage(source, (page.width - width) / 2, (page.height - height) / 2, width, height);
        sharpenText(ctx, page.width, page.height);
        return await canvasToBlob(page, 'image/jpeg', 0.97);
    } finally {
        clearCanvas(source);
        clearCanvas(page);
    }
}
