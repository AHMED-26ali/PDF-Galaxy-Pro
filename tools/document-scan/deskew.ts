type Line = { position: number; slope: number; bend: number; score: number };
type Axis = { shift: (across: number, along: number) => number; start: number; end: number; gain?: number };
const identity: Axis = { shift: (_, along) => along, start: 0, end: 1 };
const doesShift = (axis: Axis) => axis.start !== 0 || axis.end !== 1;

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

function evidence(image: ReturnType<typeof luminance>, vertical: boolean) {
    const width = vertical ? image.height : image.width;
    const height = vertical ? image.width : image.height;
    const read = (x: number, y: number) => image.levels[vertical ? x * image.width + y : y * image.width + x];
    const strength = new Uint8Array(width * height);
    for (let y = 4; y < height - 4; y++) {
        for (let x = 0; x < width; x++) {
            const background = (read(x, y - 4) + read(x, y + 4)) / 2;
            strength[y * width + x] = Math.min(100, Math.max(0, background - read(x, y) - 14));
        }
    }

    return { width, height, strength };
}

function findLines({ width, height, strength }: ReturnType<typeof evidence>, vertical: boolean) {
    if (width < 90 || height < 90) return [];
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
                if (supported < samples.length * (vertical ? 0.35 : 0.49)
                    || Math.min(left, right) < samples.length * (vertical ? 0.055 : 0.095)) continue;
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

type Profile = ReturnType<typeof evidence>;
type Trace = { anchor: number; offsets: number[]; confidence: number };

const nodeCount = 11;

function traceRule(profile: Profile, line: Line): Trace | null {
    const { width, height, strength } = profile;
    const offsets: number[] = [];
    const ratings: number[] = [];
    const radius = Math.max(3, Math.round(width / (nodeCount * 2.25)));
    const course = (x: number) => {
        const dx = x - (width - 1) / 2;
        return line.position * height + dx * (line.slope + line.bend * dx / width);
    };

    for (let node = 0; node < nodeCount; node++) {
        const center = Math.round((width - 1) * (0.055 + 0.89 * node / (nodeCount - 1)));
        let best = { offset: 0, rating: 0 };
        for (let offset = -5; offset <= 5; offset++) {
            let sum = 0;
            let hit = 0;
            let count = 0;
            for (let x = Math.max(0, center - radius); x <= Math.min(width - 1, center + radius); x++) {
                const y = Math.round(course(x)) + offset;
                if (y < 1 || y >= height - 1) continue;
                const index = y * width + x;
                const value = Math.max(strength[index], strength[index - width] * 0.68, strength[index + width] * 0.68);
                count++;
                sum += value;
                if (value >= 21) hit++;
            }
            if (!count || hit < count * 0.45) continue;
            const rating = sum / count - Math.abs(offset) * 1.2;
            if (rating > best.rating) best = { offset, rating };
        }
        offsets.push(best.offset);
        ratings.push(best.rating);
    }

    const anchors = ratings.flatMap((rating, index) => rating >= 18 ? [index] : []);
    if (anchors.length < 7 || anchors[0] > 2 || anchors[anchors.length - 1] < 8) return null;
    const positions = offsets.map((offset, node) => {
        const lo = [...anchors].reverse().find(index => index <= node);
        const hi = anchors.find(index => index >= node);
        const left = lo ?? anchors[0];
        const right = hi ?? anchors[anchors.length - 1];
        const residual = left === right ? offsets[left] :
            offsets[left] + (offsets[right] - offsets[left]) * (node - left) / (right - left);
        const px = (width - 1) * (0.055 + 0.89 * node / (nodeCount - 1));
        return (course(px) + (ratings[node] >= 18 ? offset : residual)) / (height - 1);
    });
    const smoothed = positions.map((value, index) => {
        if (index === 0 || index === nodeCount - 1) return value;
        return (positions[index - 1] + value * 4 + positions[index + 1]) / 6;
    });
    const anchor = smoothed[(nodeCount - 1) / 2];
    return { anchor, offsets: smoothed.map(position => position - anchor), confidence: ratings.reduce((a, b) => a + b, 0) };
}

function tracePolynomial(trace: Trace) {
    // Fit the displacement across the frame. Odd and even terms are orthogonal
    // on equally spaced, symmetric samples.
    let xy = 0;
    let x3y = 0;
    let x2y = 0;
    let x2 = 0;
    let x4 = 0;
    let x6 = 0;
    for (let index = 0; index < nodeCount; index++) {
        const x = (2 * index / (nodeCount - 1) - 1) * 0.89;
        const square = x * x;
        const value = trace.offsets[index];
        xy += x * value;
        x2y += square * value;
        x3y += square * x * value;
        x2 += square;
        x4 += square * square;
        x6 += square * square * square;
    }
    const determinant = x2 * (x6 + 0.14) - x4 * x4;
    return [
        (xy * (x6 + 0.14) - x3y * x4) / determinant,
        x2y / (x4 + 0.055),
        (x2 * x3y - x4 * xy) / determinant,
    ];
}

function smoothField(traces: Trace[]): Axis['shift'] {
    const polynomials = traces.map(tracePolynomial);
    const table = Array.from({ length: 257 }, (_, index) => {
        const position = index / 256;
        const weights = traces.map(trace => {
            const distance = (position - trace.anchor) / 0.135;
            return Math.exp(-0.5 * distance * distance) * trace.confidence;
        });
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        return [0, 1, 2].map(coefficient => polynomials.reduce((sum, terms, trace) => sum + weights[trace] * terms[coefficient], 0) / total);
    });
    return (across, along) => {
        const x = 2 * across - 1;
        const position = Math.max(0, Math.min(256, along * 256));
        const lower = Math.floor(position);
        const upper = Math.min(256, lower + 1);
        const blend = position - lower;
        const start = table[lower];
        const end = table[upper];
        const d0 = start[0] + (end[0] - start[0]) * blend;
        const d1 = start[1] + (end[1] - start[1]) * blend;
        const d2 = start[2] + (end[2] - start[2]) * blend;
        return along + x * (d0 + x * (d1 + x * d2));
    };
}

function trackedAxis(profile: Profile, lines: Line[], baseline: Axis): Axis | undefined {
    const ranked = lines.map(line => traceRule(profile, line)).filter((trace): trace is Trace => !!trace)
        .sort((a, b) => b.confidence - a.confidence);
    const traces: Trace[] = [];
    const refine = baseline.start !== 0 || baseline.end !== 1;
    for (const trace of ranked) {
        const modelDeviation = trace.offsets.map((offset, index) => {
            const across = 0.055 + 0.89 * index / (nodeCount - 1);
            return Math.abs(trace.anchor + offset - baseline.shift(across, trace.anchor));
        });
        if (refine && Math.max(...modelDeviation) > 0.024) continue;
        if (traces.some(other => {
            const distance = other.anchor - trace.anchor;
            return Math.abs(distance) < 0.032 || other.offsets.some((offset, i) =>
                Math.abs(offset - trace.offsets[i]) > Math.abs(distance) * 0.22);
        })) continue;
        traces.push(trace);
    }
    traces.sort((a, b) => a.anchor - b.anchor);
    if (traces.length < 2) return undefined;
    return paddedAxis(smoothField(traces));
}

function paddedAxis(shift: Axis['shift']): Axis {
    let start = 0;
    let end = 1;
    for (let index = 0; index <= 16; index++) {
        const across = index / 16;
        start = Math.min(start, -shift(across, 0));
        end = Math.max(end, 2 - shift(across, 1));
    }
    if (start > -0.004 && end < 1.004) return { shift: (_, along) => along, start: 0, end: 1 };
    return { shift, start, end };
}

function flatScore(profile: Profile, candidate?: Axis) {
    const { width, height, strength } = profile;
    const scores: { score: number; row: number }[] = [];
    const start = Math.ceil(width * 0.11);
    const end = Math.floor(width * 0.89);
    const sampleCount = Math.ceil((end - start) / 2);
    for (let y = 5; y < height - 5; y++) {
        let support = 0;
        let contrast = 0;
        let occupied = 0;
        for (let x = start; x < end; x += 2) {
            const at = candidate ? Math.round(candidate.shift(x / (width - 1), y / (height - 1)) * (height - 1)) : y;
            if (at < 1 || at >= height - 1) continue;
            const pixel = at * width + x;
            const value = Math.max(strength[pixel], 0.6 * strength[pixel - width], 0.6 * strength[pixel + width]);
            if (value < 20) continue;
            support++;
            occupied |= 1 << Math.min(5, Math.floor(6 * (x - start) / (end - start)));
            contrast += value;
        }
        if (support >= sampleCount * 0.46 && (occupied & 3) && (occupied & 48)) {
            scores.push({ score: contrast * (support / sampleCount), row: y });
        }
    }
    const best: typeof scores = [];
    for (const row of scores.sort((a, b) => b.score - a.score)) {
        if (best.some(entry => Math.abs(entry.row - row.row) <= 5)) continue;
        best.push(row);
        if (best.length === 10) break;
    }
    return best.reduce((sum, row) => sum + row.score, 0);
}

function alignment(sample: ReturnType<typeof luminance>) {
    const horizontal = evidence(sample, false);
    const vertical = evidence(sample, true);
    return { rows: flatScore(horizontal) / horizontal.width, columns: flatScore(vertical) / vertical.width };
}

function parallelRails(lines: Line[], aspect: number) {
    const strongest = [...lines].sort((a, b) => b.score - a.score);
    const first = strongest.find(line => line.position < 0.28);
    const last = strongest.find(line => line.position > 0.72);
    if (!first || !last || Math.abs(first.slope - last.slope) > 0.033 || Math.max(Math.abs(first.bend), Math.abs(last.bend)) > 0.05) return;
    const slope = (first.slope + last.slope) / 2;
    if (Math.abs(slope) < 0.016) return;
    return paddedAxis((across, along) => along + (across - 0.5) * aspect * slope);
}

function bestAxis(sample: ReturnType<typeof luminance>, vertical: boolean): Axis {
    const profile = evidence(sample, vertical);
    const lines = findLines(profile, vertical);
    let selected = identity;
    const initialScore = flatScore(profile);
    let bestScore = initialScore;
    const aspect = profile.width / profile.height;
    const model = axis(lines, aspect, vertical);
    for (const option of [model, trackedAxis(profile, lines, model), parallelRails(lines, aspect)]) {
        if (!option || !doesShift(option)) continue;
        const score = flatScore(profile, option);
        if (score < bestScore * 1.045 + profile.width * 1.3) continue;
        bestScore = score;
        selected = { ...option, gain: (score - initialScore) / profile.width };
    }
    return selected;
}

function applyAxes(image: ImageData, horizontal: Axis, vertical: Axis) {
    const { width, height, data } = image;
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

export function straightenLayout(image: ImageData) {
    const sample = luminance(image);
    const vertical = bestAxis(sample, true);
    const horizontal = bestAxis(sample, false);
    const before = alignment(sample);
    const candidates: [Axis, Axis][] = [];
    if (doesShift(horizontal) && doesShift(vertical)) candidates.push([horizontal, vertical]);
    const horizontalOnly: [Axis, Axis] = [horizontal, identity];
    const verticalOnly: [Axis, Axis] = [identity, vertical];
    const singles = (horizontal.gain ?? 0) > (vertical.gain ?? 0) ? [horizontalOnly, verticalOnly] : [verticalOnly, horizontalOnly];
    candidates.push(...singles.filter(([rows, columns]) => doesShift(rows) || doesShift(columns)));

    for (const [rows, columns] of candidates) {
        const result = applyAxes(image, rows, columns);
        const after = alignment(luminance(result));
        const movedRows = doesShift(rows);
        const movedColumns = doesShift(columns);
        const rowsImprove = after.rows >= before.rows * 1.055 + 4;
        const columnsImprove = after.columns >= before.columns * 1.055 + 4;
        const improves = movedRows && movedColumns
            ? (rowsImprove || columnsImprove) && after.rows + 4 >= before.rows * 0.89
                && after.columns + 4 >= before.columns * 0.89
                && after.rows + after.columns >= (before.rows + before.columns) * 1.025 + 3
            : movedRows ? rowsImprove : columnsImprove;
        if (!improves) continue;
        return result;
    }
    return image;
}
