import { layoutAlignment, straightenLayout } from './deskew';

export type Point = { x: number; y: number };
export type Corners = [Point, Point, Point, Point];
export type ScanMode = 'grayscale' | 'color';
type Line = { slope: number; intercept: number };

export const imageCorners: Corners = [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function validCorners(corners: Corners) {
    return corners.every((a, index) => {
        const b = corners[(index + 1) % 4];
        const c = corners[(index + 2) % 4];
        return distance(a, b) > 0.05
            && (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 0.004;
    });
}

function detectSide(luminance: Float32Array, width: number, height: number, vertical: boolean, reverse: boolean): Line | null {
    const length = vertical ? height : width;
    const depth = vertical ? width : height;
    const samples: { along: number; across: number }[] = [];
    const read = (along: number, across: number) => {
        const position = reverse ? depth - 1 - across : across;
        return luminance[vertical ? along * width + position : position * width + along];
    };
    for (let sample = 0; sample < 33; sample++) {
        const along = Math.round(length * (0.09 + 0.82 * sample / 32));
        let bestAt = -1;
        let best = 19;
        for (let across = 8; across < depth * 0.32; across++) {
            const outside = (read(along - 1, across - 2) + read(along, across - 4) + read(along + 1, across - 7)) / 3;
            const inside = (read(along - 1, across + 2) + read(along, across + 4) + read(along + 1, across + 7)) / 3;
            const outerLevel = (read(along, Math.floor(across * 0.2)) + read(along, Math.floor(across * 0.48))
                + read(along, Math.floor(across * 0.77))) / 3;
            const score = inside - outside - across / depth * 75;
            if (inside >= 112 && outerLevel < 154 && inside - outerLevel >= 22 && score > best) {
                bestAt = across;
                best = score;
            }
        }
        if (bestAt >= 0) samples.push({ along, across: reverse ? depth - 1 - bestAt : bestAt });
    }

    const tolerance = Math.max(2.6, depth * 0.019);
    let inliers: typeof samples = [];
    for (let index = 0; index < samples.length; index++) {
        const a = samples[index];
        for (const b of samples.slice(index + 1)) {
            if (b.along - a.along < length * 0.38) continue;
            const slope = (b.across - a.across) / (b.along - a.along);
            if (Math.abs(slope) > 0.55) continue;
            const matches = samples.filter(point => Math.abs(point.across - a.across - slope * (point.along - a.along)) <= tolerance);
            if (matches.length > inliers.length) inliers = matches;
        }
    }
    if (inliers.length < 15 || inliers[inliers.length - 1].along - inliers[0].along < length * 0.5) return null;

    const meanAlong = inliers.reduce((sum, point) => sum + point.along, 0) / inliers.length;
    const meanAcross = inliers.reduce((sum, point) => sum + point.across, 0) / inliers.length;
    const covariance = inliers.reduce((sum, point) => sum + (point.along - meanAlong) * (point.across - meanAcross), 0);
    const variance = inliers.reduce((sum, point) => sum + (point.along - meanAlong) ** 2, 0);
    const slope = covariance / variance;
    // Keep a little of the margin when the detected edge cuts through a shadow.
    return { slope, intercept: meanAcross - slope * meanAlong + (reverse ? 1 : -1) };
}

export function detectCorners({ data, width, height }: ImageData): Corners {
    if (width < 50 || height < 50) return imageCorners;
    const luminance = new Float32Array(width * height);
    for (let index = 0; index < luminance.length; index++) {
        const pixel = index * 4;
        luminance[index] = data[pixel] * 0.299 + data[pixel + 1] * 0.587 + data[pixel + 2] * 0.114;
    }

    const left = detectSide(luminance, width, height, true, false) ?? { slope: 0, intercept: 0 };
    const right = detectSide(luminance, width, height, true, true) ?? { slope: 0, intercept: width - 1 };
    const top = detectSide(luminance, width, height, false, false) ?? { slope: 0, intercept: 0 };
    const bottom = detectSide(luminance, width, height, false, true) ?? { slope: 0, intercept: height - 1 };
    const intersect = (side: Line, end: Line): Point => {
        const x = (side.intercept + side.slope * end.intercept) / (1 - side.slope * end.slope);
        const y = end.intercept + end.slope * x;
        return { x: clamp(x / (width - 1), 0, 1), y: clamp(y / (height - 1), 0, 1) };
    };
    const corners: Corners = [intersect(left, top), intersect(right, top), intersect(right, bottom), intersect(left, bottom)];
    return validCorners(corners) ? corners : imageCorners;
}

function perspective([a, b, c, d]: Corners) {
    const dx = a.x - b.x + c.x - d.x;
    const dy = a.y - b.y + c.y - d.y;
    const determinant = (b.x - c.x) * (d.y - c.y) - (d.x - c.x) * (b.y - c.y);
    const g = (dx * (d.y - c.y) - (d.x - c.x) * dy) / determinant;
    const h = ((b.x - c.x) * dy - dx * (b.y - c.y)) / determinant;
    return {
        ax: b.x - a.x + g * b.x, bx: d.x - a.x + h * d.x, cx: a.x,
        ay: b.y - a.y + g * b.y, by: d.y - a.y + h * d.y, cy: a.y,
        g, h,
    };
}

function warp({ data, width, height }: ImageData, corners: Corners) {
    const points = corners.map(({ x, y }) => ({ x: x * (width - 1), y: y * (height - 1) })) as Corners;
    const [a, b, c, d] = points;
    const pageWidth = (distance(a, b) + distance(d, c)) / 2;
    const pageHeight = (distance(a, d) + distance(b, c)) / 2;
    const scale = Math.min(2, 3508 / Math.max(pageWidth, pageHeight));
    const output = new ImageData(Math.max(2, Math.round(pageWidth * scale)), Math.max(2, Math.round(pageHeight * scale)));
    const mapping = perspective(points);

    for (let y = 0; y < output.height; y++) {
        const v = y / (output.height - 1);
        for (let x = 0; x < output.width; x++) {
            const u = x / (output.width - 1);
            const denominator = mapping.g * u + mapping.h * v + 1;
            const sx = clamp((mapping.ax * u + mapping.bx * v + mapping.cx) / denominator, 0, width - 1);
            const sy = clamp((mapping.ay * u + mapping.by * v + mapping.cy) / denominator, 0, height - 1);
            const x0 = Math.floor(sx);
            const y0 = Math.floor(sy);
            const x1 = Math.min(x0 + 1, width - 1);
            const y1 = Math.min(y0 + 1, height - 1);
            const fx = sx - x0;
            const fy = sy - y0;
            const topLeft = (y0 * width + x0) * 4;
            const topRight = (y0 * width + x1) * 4;
            const bottomLeft = (y1 * width + x0) * 4;
            const bottomRight = (y1 * width + x1) * 4;
            const pixel = (y * output.width + x) * 4;
            for (let channel = 0; channel < 3; channel++) {
                const top = data[topLeft + channel] * (1 - fx) + data[topRight + channel] * fx;
                const bottom = data[bottomLeft + channel] * (1 - fx) + data[bottomRight + channel] * fx;
                output.data[pixel + channel] = top * (1 - fy) + bottom * fy;
            }
            output.data[pixel + 3] = 255;
        }
    }
    return output;
}

function exteriorMask(samples: Float32Array, columns: number, rows: number) {
    const mask = new Uint8Array(samples.length);
    const queue: number[] = [];
    function visit(x: number, y: number) {
        const index = y * columns + x;
        const nearEdge = Math.min(x / columns, (columns - 1 - x) / columns, y / rows, (rows - 1 - y) / rows) < 0.19;
        if (nearEdge && !mask[index] && samples[index] < 109) {
            mask[index] = 1;
            queue.push(index);
        }
    }
    for (let x = 0; x < columns; x++) {
        visit(x, 0);
        visit(x, rows - 1);
    }
    for (let y = 0; y < rows; y++) {
        visit(0, y);
        visit(columns - 1, y);
    }
    for (let current = 0; current < queue.length; current++) {
        const y = Math.floor(queue[current] / columns);
        const x = queue[current] % columns;
        if (x > 0) visit(x - 1, y);
        if (x < columns - 1) visit(x + 1, y);
        if (y > 0) visit(x, y - 1);
        if (y < rows - 1) visit(x, y + 1);
    }
    return mask;
}

function cleanPaper({ data, width, height }: ImageData, mode: ScanMode) {
    const columns = Math.min(120, Math.ceil(width / 10));
    const rows = Math.min(120, Math.ceil(height / 10));
    const samples = new Float32Array(columns * rows);
    const paperColor = mode === 'color' ? new Float32Array(samples.length * 3) : null;
    const fineColumns = Math.min(440, Math.ceil(width / 6));
    const fineRows = Math.min(440, Math.ceil(height / 6));
    const fineSamples = new Float32Array(fineColumns * fineRows);
    for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
            const index = Math.floor(y * rows / height) * columns + Math.floor(x * columns / width);
            const pixel = (y * width + x) * 4;
            const level = data[pixel] * 0.299 + data[pixel + 1] * 0.587 + data[pixel + 2] * 0.114;
            if (level > samples[index]) {
                samples[index] = level;
                if (paperColor && level >= 90) {
                    paperColor[index * 3] = data[pixel] / level;
                    paperColor[index * 3 + 1] = data[pixel + 1] / level;
                    paperColor[index * 3 + 2] = data[pixel + 2] / level;
                }
            }
            const fineIndex = Math.floor(y * fineRows / height) * fineColumns + Math.floor(x * fineColumns / width);
            fineSamples[fineIndex] = Math.max(fineSamples[fineIndex], level);
        }
    }
    // Use light pixels for the lighting map and exclude dark areas that meet the photo border.
    const exterior = exteriorMask(samples, columns, rows);
    const fineExterior = exteriorMask(fineSamples, fineColumns, fineRows);
    const shadowMap = new Float32Array(fineSamples.length);
    for (let y = 0; y < fineRows; y++) {
        for (let x = 0; x < fineColumns; x++) {
            const index = y * fineColumns + x;
            if (fineExterior[index]) continue;
            let highlight = fineSamples[index];
            for (let row = Math.max(0, y - 1); row <= Math.min(fineRows - 1, y + 1); row++) {
                for (let column = Math.max(0, x - 1); column <= Math.min(fineColumns - 1, x + 1); column++) {
                    highlight = Math.max(highlight, fineSamples[row * fineColumns + column]);
                }
            }
            shadowMap[index] = highlight;
        }
    }
    const background = new Float32Array(samples.length);
    const whiteBalance = paperColor ? new Float32Array(paperColor.length) : null;
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            let sum = 0;
            let count = 0;
            let red = 0;
            let green = 0;
            let blue = 0;
            let colors = 0;
            for (let row = Math.max(0, y - 3); row <= Math.min(rows - 1, y + 3); row++) {
                for (let column = Math.max(0, x - 3); column <= Math.min(columns - 1, x + 3); column++) {
                    const index = row * columns + column;
                    if (!exterior[index]) {
                        sum += samples[index];
                        count++;
                        if (paperColor && paperColor[index * 3 + 1] > 0) {
                            red += paperColor[index * 3];
                            green += paperColor[index * 3 + 1];
                            blue += paperColor[index * 3 + 2];
                            colors++;
                        }
                    }
                }
            }
            const index = y * columns + x;
            background[index] = count ? Math.max(92, sum / count) : 255;
            if (whiteBalance) {
                whiteBalance[index * 3] = colors ? clamp(red / colors, 0.64, 1.42) : 1;
                whiteBalance[index * 3 + 1] = colors ? clamp(green / colors, 0.64, 1.42) : 1;
                whiteBalance[index * 3 + 2] = colors ? clamp(blue / colors, 0.64, 1.42) : 1;
            }
        }
    }

    const ratios = new Float32Array(3);
    for (let y = 0; y < height; y++) {
        const row = clamp((y + 0.5) * rows / height - 0.5, 0, rows - 1);
        const y0 = Math.floor(row);
        const y1 = Math.min(y0 + 1, rows - 1);
        const fy = row - y0;
        for (let x = 0; x < width; x++) {
            const col = clamp((x + 0.5) * columns / width - 0.5, 0, columns - 1);
            const x0 = Math.floor(col);
            const x1 = Math.min(x0 + 1, columns - 1);
            const fx = col - x0;
            const top = background[y0 * columns + x0] * (1 - fx) + background[y0 * columns + x1] * fx;
            const bottom = background[y1 * columns + x0] * (1 - fx) + background[y1 * columns + x1] * fx;
            const light = top * (1 - fy) + bottom * fy;
            const pixel = (y * width + x) * 4;
            const r = data[pixel];
            const g = data[pixel + 1];
            const b = data[pixel + 2];
            const level = r * 0.299 + g * 0.587 + b * 0.114;
            const maskIndex = Math.floor(y * fineRows / height) * fineColumns + Math.floor(x * fineColumns / width);
            if (fineExterior[maskIndex]) {
                data[pixel] = data[pixel + 1] = data[pixel + 2] = 255;
            } else if (mode === 'grayscale') {
                const paperLight = Math.max(light * 0.72, Math.min(light, shadowMap[maskIndex]));
                const ink = clamp((level / paperLight - 0.055) / 0.90, 0, 1);
                const gray = 255 * ink ** 1.22;
                data[pixel] = data[pixel + 1] = data[pixel + 2] = gray;
            } else if (whiteBalance) {
                const paperLight = Math.max(light * 0.72, Math.min(light, shadowMap[maskIndex]));
                const neutral = 255 / paperLight;
                const corner1 = (y0 * columns + x0) * 3;
                const corner2 = (y0 * columns + x1) * 3;
                const corner3 = (y1 * columns + x0) * 3;
                const corner4 = (y1 * columns + x1) * 3;
                for (let channel = 0; channel < 3; channel++) {
                    const top = whiteBalance[corner1 + channel] * (1 - fx) + whiteBalance[corner2 + channel] * fx;
                    const bottom = whiteBalance[corner3 + channel] * (1 - fx) + whiteBalance[corner4 + channel] * fx;
                    ratios[channel] = data[pixel + channel] * neutral / (top * (1 - fy) + bottom * fy);
                }
                const balanced = (ratios[0] * 0.299 + ratios[1] * 0.587 + ratios[2] * 0.114) / 255;
                const enhanced = clamp((balanced - 0.031) / 0.924, 0, 1) ** 1.16;
                const correction = (enhanced - balanced) * 255;
                for (let channel = 0; channel < 3; channel++) data[pixel + channel] = ratios[channel] + correction;
            }
        }
    }
}

function fullFrame(corners: Corners) {
    return corners.every((point, index) => point.x === imageCorners[index].x && point.y === imageCorners[index].y);
}

function conservativeCrop(image: ImageData, corners: Corners): Corners {
    if (fullFrame(corners)) return imageCorners;
    const [a, b, c, d] = corners;
    const left = Math.max(0, Math.min(a.x, d.x) - 0.004);
    const right = Math.min(1, Math.max(b.x, c.x) + 0.004);
    const top = Math.max(0, Math.min(a.y, b.y) - 0.011);
    const bottom = Math.min(1, Math.max(c.y, d.y) + 0.011);
    const box: Corners = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
    const variation = Math.max(Math.abs(a.x - d.x), Math.abs(b.x - c.x), Math.abs(a.y - b.y), Math.abs(d.y - c.y));
    if (variation < 0.022) return box;

    const scale = Math.min(1, 356 / Math.max(image.width, image.height));
    const reduced = new ImageData(Math.max(2, Math.round(image.width * scale)), Math.max(2, Math.round(image.height * scale)));
    for (let y = 0; y < reduced.height; y++) {
        const sy = Math.floor((y + 0.5) * image.height / reduced.height);
        for (let x = 0; x < reduced.width; x++) {
            const sx = Math.floor((x + 0.5) * image.width / reduced.width);
            const source = (sy * image.width + sx) * 4;
            const target = (y * reduced.width + x) * 4;
            reduced.data[target] = image.data[source];
            reduced.data[target + 1] = image.data[source + 1];
            reduced.data[target + 2] = image.data[source + 2];
            reduced.data[target + 3] = 255;
        }
    }

    const plain = layoutAlignment(warp(reduced, box));
    const corrected = layoutAlignment(warp(reduced, corners));
    return corrected >= plain * 1.12 + 12 ? corners : box;
}

export function renderScan(input: ImageData, corners: Corners, mode: ScanMode, automatic = false, straighten = true) {
    if (!validCorners(corners)) throw new Error('Invalid crop');
    const selection = automatic ? (straighten ? conservativeCrop(input, corners) : imageCorners) : corners;
    const output = fullFrame(selection) ? input : warp(input, selection);
    cleanPaper(output, mode);
    return straighten ? straightenLayout(output, automatic && !fullFrame(corners)) : output;
}
