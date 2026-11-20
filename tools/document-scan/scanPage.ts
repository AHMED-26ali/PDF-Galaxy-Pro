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
            const level = data[pixel] * 0.299 + data[pixel + 1] * 0.587 + data[pixel + 2] * 0.114;
            if (level < 222) {
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
        const ctx = page.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, page.width, page.height);
        ctx.imageSmoothingQuality = 'high';
        const margin = Math.min(page.width, page.height) * 0.042;
        const scale = Math.min((page.width - margin * 2) / bounds.width, (page.height - margin * 2) / bounds.height);
        const width = bounds.width * scale;
        const height = bounds.height * scale;
        ctx.drawImage(source, (page.width - width) / 2, (page.height - height) / 2, width, height);
        return await canvasToBlob(page, 'image/jpeg', 0.95);
    } finally {
        clearCanvas(source);
        clearCanvas(page);
    }
}
