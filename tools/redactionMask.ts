export type RedactionStyle = 'frosted' | 'black' | 'white';

type Region = { x: number; y: number; width: number; height: number };
type RGB = [number, number, number];

function samplePage(canvas: HTMLCanvasElement, regions: Region[]) {
    const thumbnail = document.createElement('canvas');
    thumbnail.width = thumbnail.height = 64;
    const context = thumbnail.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas unavailable');
    context.imageSmoothingEnabled = false;
    context.drawImage(canvas, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    const margin = 2 / 64;

    return (region: Region): RGB => {
        const colors: RGB[] = [];
        for (const fraction of [0.15, 0.35, 0.55, 0.75, 0.9]) {
            const x = region.x + region.width * fraction;
            const y = region.y + region.height * fraction;
            const points = [
                [x, region.y - margin], [x, region.y + region.height + margin],
                [region.x - margin, y], [region.x + region.width + margin, y],
            ];
            for (const [px, py] of points) {
                const column = Math.floor(px * 64);
                const row = Math.floor(py * 64);
                if (column < 0 || column >= 64 || row < 0 || row >= 64) continue;
                const centerX = (column + 0.5) / 64;
                const centerY = (row + 0.5) / 64;
                // Derive the mask only from the surroundings, never from covered pixels.
                if (regions.some(box => centerX >= box.x - 1 / 64 && centerX <= box.x + box.width + 1 / 64
                    && centerY >= box.y - 1 / 64 && centerY <= box.y + box.height + 1 / 64)) continue;
                const index = (row * 64 + column) * 4;
                if (pixels[index + 3] < 255) continue;
                colors.push([pixels[index], pixels[index + 1], pixels[index + 2]]);
            }
        }
        if (!colors.length) return [227, 234, 246];
        colors.sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]));
        const paper = colors.slice(0, Math.ceil(colors.length / 2));
        return [0, 1, 2].map(channel => paper.reduce((sum, color) => sum + color[channel], 0) / paper.length) as RGB;
    };
}

function tint(color: RGB, base: RGB, weight: number) {
    return `rgb(${color.map((value, channel) => Math.round(value * weight + base[channel] * (1 - weight))).join(', ')})`;
}

export function paintRedactions(canvas: HTMLCanvasElement, regions: Region[], style: RedactionStyle) {
    if (!regions.length) return;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    const sample = style === 'frosted' ? samplePage(canvas, regions) : undefined;
    for (const region of regions) {
        const x = Math.floor(region.x * canvas.width);
        const y = Math.floor(region.y * canvas.height);
        const width = Math.ceil((region.x + region.width) * canvas.width) - x;
        const height = Math.ceil((region.y + region.height) * canvas.height) - y;
        if (sample) {
            const paper = sample(region);
            const glass = context.createLinearGradient(x, y, x + width * 0.7, y + height);
            glass.addColorStop(0, tint(paper, [247, 250, 255], 0.38));
            glass.addColorStop(0.46, tint(paper, [215, 225, 241], 0.55));
            glass.addColorStop(1, tint(paper, [185, 204, 230], 0.52));
            context.fillStyle = glass;
        } else {
            context.fillStyle = style === 'black' ? '#000' : '#fff';
        }
        context.fillRect(x, y, width, height);
    }
}
