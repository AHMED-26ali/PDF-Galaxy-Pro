type Rectangle = { left: number; right: number; top: number; bottom: number };

function rulePositions(projection: Uint32Array, minCoverage: number, gap: number) {
    const positions: number[] = [];
    let previous = -gap - 1;
    for (let index = 0; index < projection.length; index++) {
        if (projection[index] < minCoverage) continue;
        if (index - previous > gap) positions.push(index);
        else if (projection[index] > projection[positions[positions.length - 1]]) {
            positions[positions.length - 1] = index;
        }
        previous = index;
    }
    return positions;
}

export function scanGrid(canvas: HTMLCanvasElement) {
    const { width, height } = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx || width < 200 || height < 200) return;
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const ink = new Uint8Array(width * height);
    const horizontal = new Uint32Array(height);
    // Colored paper patterns are typically lighter in at least one channel.
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const offset = i * 4;
            if (Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > 145) continue;
            ink[i] = 1;
            horizontal[y]++;
        }
    }
    const gap = Math.max(3, Math.round(width * 0.004));
    const rows = rulePositions(horizontal, width * 0.54, gap);
    if (rows.length < 4 || rows.length > 17 || rows[0] > height * 0.15 || rows.at(-1)! < height * 0.76) return;

    const cells: Rectangle[][] = [];
    let outer: [number, number] | undefined;
    for (let index = 1; index < rows.length; index++) {
        const top = rows[index - 1];
        const bottom = rows[index];
        if (bottom - top < height * 0.012) return;
        const vertical = new Uint32Array(width);
        for (let y = top + gap; y < bottom - gap; y++) {
            for (let x = 0; x < width; x++) vertical[x] += ink[y * width + x];
        }
        const columns = rulePositions(vertical, (bottom - top - 2 * gap) * 0.65, gap);
        if (columns.length < 2 || columns.length > 10) return;
        const left = columns[0];
        const right = columns[columns.length - 1];
        if (right - left < width * 0.58) return;
        outer ??= [left, right];
        if (Math.abs(left - outer[0]) > width * 0.02 || Math.abs(right - outer[1]) > width * 0.02) return;
        const row = columns.slice(1).map((right, i) => ({ left: columns[i], right, top, bottom }));
        if (row.some(cell => cell.right - cell.left < gap * 4)) return;
        cells.push(row);
    }
    if (cells.filter(row => row.length > 1).length < 2 || cells.flat().length > 48) return;

    const inset = Math.round(width * 0.006);
    const pad = 20;
    function crop(cell: Rectangle, target: HTMLCanvasElement) {
        const left = cell.left + inset;
        const top = cell.top + inset;
        const w = Math.max(1, cell.right - left - inset);
        const h = Math.max(1, cell.bottom - top - inset);
        target.width = w + 2 * pad;
        target.height = h + 2 * pad;
        const targetCtx = target.getContext('2d');
        if (!targetCtx) return false;
        const image = targetCtx.createImageData(target.width, target.height);
        image.data.fill(255);
        let inkCount = 0;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!ink[(top + y) * width + left + x]) continue;
                const index = ((y + pad) * target.width + x + pad) * 4;
                image.data[index] = image.data[index + 1] = image.data[index + 2] = 0;
                inkCount++;
            }
        }
        if (inkCount < 30) return false;
        targetCtx.putImageData(image, 0, 0);
        return { x: left - pad, y: top - pad };
    }
    return { cells, crop };
}
