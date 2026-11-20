type Line = { position: number; slope: number; bend: number; score: number };
type Axis = { shift: (across: number, along: number) => number; start: number; end: number };

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function luminance(image: ImageData) {
    const scale = Math.min(1, 400 / Math.max(image.width, image.height));
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);
    const levels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let darkest = 255;
            for (const dy of [0.2, 0.5, 0.8]) {
                const row = Math.floor((y + dy) * image.height / height);
                for (const dx of [0.2, 0.5, 0.8]) {
                    const column = Math.floor((x + dx) * image.width / width);
                    const pixel = (row * image.width + column) * 4;
                    const gray = image.data[pixel] * 0.299 + image.data[pixel + 1] * 0.587 + image.data[pixel + 2] * 0.114;
                    darkest = Math.min(darkest, gray);
                }
            }
            levels[y * width + x] = darkest;
        }
    }
    return { width, height, levels };
}

function findLines(image: ReturnType<typeof luminance>, vertical: boolean) {
    const width = vertical ? image.height : image.width;
    const height = vertical ? image.width : image.height;
    if (width < 90 || height < 90) return [];
    const read = (x: number, y: number) => image.levels[vertical ? x * image.width + y : y * image.width + x];
    const strength = new Uint8Array(width * height);
    for (let y = 4; y < height - 4; y++) {
        for (let x = 0; x < width; x++) {
            const background = (read(x, y - 4) + read(x, y + 4)) / 2;
            strength[y * width + x] = Math.min(100, Math.max(0, background - read(x, y) - 14));
        }
    }

    const starts = Math.round(width * 0.08);
    const stops = width - starts;
    const samples = Array.from({ length: Math.floor((stops - starts) / 3) }, (_, index) => starts + index * 3);
    const best: (Line | undefined)[] = new Array(14);
    for (const bend of [-0.1, -0.05, 0, 0.05, 0.1]) {
        for (let slopeStep = -24; slopeStep <= 24; slopeStep++) {
            const slope = slopeStep / 80;
            const offsets = samples.map(x => {
                const dx = x - (width - 1) / 2;
                return Math.round(slope * dx + bend * dx * dx / width);
            });
            const first = Math.max(Math.ceil(height * 0.045), 6 - Math.min(...offsets));
            const last = Math.min(Math.floor(height * 0.955), height - 7 - Math.max(...offsets));
            for (let y = first; y <= last; y++) {
                let total = 0;
                let supported = 0;
                let left = 0;
                let right = 0;
                for (let index = 0; index < samples.length; index++) {
                    const pixel = (y + offsets[index]) * width + samples[index];
                    const value = Math.max(strength[pixel], strength[pixel - width] * 0.82, strength[pixel + width] * 0.82);
                    if (value < 20) continue;
                    total += value;
                    supported++;
                    if (index < samples.length / 3) left++;
                    if (index >= samples.length * 2 / 3) right++;
                }
                if (supported < samples.length * (vertical ? 0.40 : 0.49)
                    || Math.min(left, right) < samples.length * (vertical ? 0.075 : 0.095)) continue;
                const score = total - samples.length * (Math.abs(bend) * 7 + Math.abs(slope) * 2);
                const band = Math.floor(y / height * best.length);
                if (score > (best[band]?.score ?? 0)) {
                    best[band] = { position: y / height, slope, bend, score };
                }
            }
        }
    }
    return best.filter(line => line !== undefined);
}

function fit(lines: Line[], getValue: (line: Line) => number, tolerance: number) {
    const fallback = median(lines.map(getValue));
    let best: Line[] = [];
    let bestScore = 0;
    for (let first = 0; first < lines.length; first++) {
        const from = lines[first];
        for (const to of lines.slice(first + 1)) {
            const span = to.position - from.position;
            if (span < 0.24) continue;
            const slope = (getValue(to) - getValue(from)) / span;
            if (Math.abs(slope) > 0.23) continue;
            const matches = lines.filter(line => Math.abs(getValue(line) - getValue(from) - slope * (line.position - from.position)) <= tolerance);
            const score = matches.reduce((sum, line) => sum + line.score, 0);
            if (matches.length >= 3 && score > bestScore) {
                best = matches;
                bestScore = score;
            }
        }
    }
    if (best.length < 3) return () => fallback;
    const meanX = best.reduce((sum, line) => sum + line.position * line.score, 0) / bestScore;
    const meanY = best.reduce((sum, line) => sum + getValue(line) * line.score, 0) / bestScore;
    const variance = best.reduce((sum, line) => sum + (line.position - meanX) ** 2 * line.score, 0);
    const covariance = best.reduce((sum, line) => sum + (line.position - meanX) * (getValue(line) - meanY) * line.score, 0);
    const slope = covariance / variance;
    const min = Math.max(0, best[0].position - 0.055);
    const max = Math.min(1, best[best.length - 1].position + 0.055);
    return (position: number) => meanY + slope * (Math.max(min, Math.min(max, position)) - meanX);
}

function axis(lines: Line[], aspect: number, vertical: boolean): Axis {
    const identity: Axis = { shift: (_, along) => along, start: 0, end: 1 };
    if (lines.length < (vertical ? 3 : 2)) return identity;
    const totalScore = lines.reduce((sum, line) => sum + line.score, 0);
    const straightScore = lines.reduce((sum, line) =>
        Math.abs(line.slope) <= 0.0125 && line.bend === 0 ? sum + line.score : sum, 0);
    if (straightScore >= totalScore * 0.7) return identity;
    const centralAngle = median(lines.map(line => line.slope));
    const consistent = lines.filter(line => Math.abs(line.slope - centralAngle) <= 0.13);
    if (consistent.length < (vertical ? 3 : 2)) return identity;
    const slope = fit(consistent, line => line.slope, 0.025);
    const bend = vertical || consistent.length < 4 ? () => 0 : fit(consistent, line => line.bend, 0.045);
    const shift = (across: number, along: number) => {
        const distance = across - 0.5;
        return along + aspect * distance * (slope(along) + distance * bend(along));
    };
    let start = 0;
    let end = 1;
    for (let index = 0; index <= 8; index++) {
        const across = index / 8;
        start = Math.min(start, -shift(across, 0));
        end = Math.max(end, 2 - shift(across, 1));
    }
    if (start > -0.005 && end < 1.005) return identity;
    return { shift, start, end };
}

export function straightenLayout(image: ImageData) {
    const { width, height, data } = image;
    const sample = luminance(image);
    const vertical = axis(findLines(sample, true), height / width, true);
    const horizontal = axis(findLines(sample, false), width / height, false);
    if (horizontal.start === 0 && horizontal.end === 1 && vertical.start === 0 && vertical.end === 1) return image;

    const result = new ImageData(width, height);
    result.data.fill(255);
    const xs = Float32Array.from({ length: width }, (_, x) => x / (width - 1));
    const paddedXs = xs.map(x => vertical.start + x * (vertical.end - vertical.start));
    for (let y = 0; y < height; y++) {
        const v = y / (height - 1);
        const paddedY = horizontal.start + v * (horizontal.end - horizontal.start);
        for (let x = 0; x < width; x++) {
            const sx = vertical.shift(v, paddedXs[x]) * (width - 1);
            const sy = horizontal.shift(xs[x], paddedY) * (height - 1);
            if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) continue;
            const x0 = Math.floor(sx);
            const y0 = Math.floor(sy);
            const dx = sx - x0;
            const dy = sy - y0;
            const topLeft = (y0 * width + x0) * 4;
            const bottomLeft = Math.min(y0 + 1, height - 1) * width * 4 + x0 * 4;
            const right = x0 < width - 1 ? 4 : 0;
            const pixel = (y * width + x) * 4;
            for (let channel = 0; channel < 3; channel++) {
                const top = data[topLeft + channel] * (1 - dx) + data[topLeft + right + channel] * dx;
                const bottom = data[bottomLeft + channel] * (1 - dx) + data[bottomLeft + right + channel] * dx;
                result.data[pixel + channel] = top * (1 - dy) + bottom * dy;
            }
        }
    }
    return result;
}
