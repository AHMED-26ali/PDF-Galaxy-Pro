import { decodePDFRawStream, EncryptedPDFError, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import { canvasToBlob, clearCanvas } from './pdfRuntime';

const profiles = {
    low: { quality: 0.90, maxSide: 3200, optimizeMoreFormats: false },
    medium: { quality: 0.55, maxSide: 1350, optimizeMoreFormats: true },
    high: { quality: 0.40, maxSide: 1050, optimizeMoreFormats: true },
};

export type CompressionLevel = keyof typeof profiles;

const subtype = PDFName.of('Subtype');
const filter = PDFName.of('Filter');
const dctDecode = PDFName.of('DCTDecode');
const flateDecode = PDFName.of('FlateDecode');
const colorSpace = PDFName.of('ColorSpace');
const deviceRgb = PDFName.of('DeviceRGB');
const deviceGray = PDFName.of('DeviceGray');
const bits = PDFName.of('BitsPerComponent');
const widthKey = PDFName.of('Width');
const heightKey = PDFName.of('Height');
const decodeParms = PDFName.of('DecodeParms');
const maskKeys = ['Mask', 'SMask'].map(PDFName.of);
const protectedImageEntries = [...maskKeys, ...['SMaskInData', 'ImageMask', 'Matte', 'Decode', 'Alternates', 'OPI']
    .map(PDFName.of)];

function jpegContents(stream: PDFRawStream) {
    const encoding = stream.dict.lookup(filter);
    if (encoding === dctDecode) return stream.contents;
    if (!(encoding instanceof PDFArray)) return;
    if (encoding.size() === 1 && encoding.lookup(0) === dctDecode) return stream.contents;
    if (encoding.size() !== 2 || encoding.lookup(1) !== dctDecode) return;
    const wrapper = encoding.lookup(0);
    if (wrapper !== PDFName.of('ASCII85Decode') && wrapper !== PDFName.of('ASCIIHexDecode')) return;
    const wrapped = stream.dict.clone();
    wrapped.set(filter, wrapper);
    return decodePDFRawStream(PDFRawStream.of(wrapped, stream.contents)).decode();
}

async function inflateImage(stream: PDFRawStream, length: number) {
    const reader = new Blob([new Uint8Array(stream.contents)]).stream()
        .pipeThrough(new DecompressionStream('deflate')).getReader();
    const pixels = new Uint8Array(length);
    let offset = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) return offset === length ? pixels : undefined;
            if (offset + value.length > length) return;
            pixels.set(value, offset);
            offset += value.length;
        }
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}

async function readFlateImage(stream: PDFRawStream, width: number, height: number, channels: number) {
    if (width * height > 8_000_000) return;
    const params = stream.dict.lookupMaybe(decodeParms, PDFDict);
    const predictor = params?.lookupMaybe(PDFName.of('Predictor'), PDFNumber)?.asNumber() ?? 1;
    const png = predictor >= 10 && predictor <= 15 && Number.isInteger(predictor);
    if (predictor !== 1 && !png) return;
    const stride = width * channels;
    if (png && (
        (params?.lookupMaybe(PDFName.of('Columns'), PDFNumber)?.asNumber() ?? 1) !== width ||
        (params?.lookupMaybe(PDFName.of('Colors'), PDFNumber)?.asNumber() ?? 1) !== channels ||
        (params?.lookupMaybe(bits, PDFNumber)?.asNumber() ?? 8) !== 8
    )) return;

    const length = (stride + Number(png)) * height;
    const data = await inflateImage(stream, length);
    if (!data) return;
    const image = new ImageData(width, height);
    let offset = 0;
    for (let y = 0; y < height; y++) {
        if (png) {
            const method = data[offset++];
            if (method > 4) return;
            const previousRow = offset - stride - 1;
            for (let column = 0; column < stride; column++) {
                const left = column >= channels ? data[offset + column - channels] : 0;
                const above = y > 0 ? data[previousRow + column] : 0;
                const upperLeft = y > 0 && column >= channels ? data[previousRow + column - channels] : 0;
                let prediction = 0;
                if (method === 1) prediction = left;
                else if (method === 2) prediction = above;
                else if (method === 3) prediction = (left + above) >> 1;
                else if (method === 4) {
                    // Paeth chooses the neighbor closest to the linear estimate.
                    const estimate = left + above - upperLeft;
                    const a = Math.abs(estimate - left);
                    const b = Math.abs(estimate - above);
                    const c = Math.abs(estimate - upperLeft);
                    prediction = a <= b && a <= c ? left : b <= c ? above : upperLeft;
                }
                data[offset + column] += prediction;
            }
        }
        for (let x = 0; x < width; x++) {
            const pixel = (y * width + x) * 4;
            image.data[pixel] = data[offset];
            image.data[pixel + 1] = data[offset + (channels === 3 ? 1 : 0)];
            image.data[pixel + 2] = data[offset + (channels === 3 ? 2 : 0)];
            image.data[pixel + 3] = 255;
            offset += channels;
        }
    }
    return image;
}

async function recompressImage(stream: PDFRawStream, profile: typeof profiles.medium, canvas: HTMLCanvasElement, allowGray: boolean) {
    const dict = stream.dict;
    const color = dict.lookup(colorSpace);
    if (color !== deviceRgb && !(profile.optimizeMoreFormats && allowGray && color === deviceGray)) return;
    if (protectedImageEntries.some(key => dict.has(key))) return;

    const depth = dict.lookupMaybe(bits, PDFNumber)?.asNumber();
    const width = dict.lookupMaybe(widthKey, PDFNumber)?.asNumber() ?? 0;
    const height = dict.lookupMaybe(heightKey, PDFNumber)?.asNumber() ?? 0;
    if (depth !== 8 || !Number.isInteger(width) || !Number.isInteger(height) ||
        width < 1 || height < 1 || width * height > 24_000_000) return;

    let bitmap: ImageBitmap;
    if (profile.optimizeMoreFormats && dict.lookup(filter) === flateDecode) {
        const image = await readFlateImage(stream, width, height, color === deviceRgb ? 3 : 1);
        if (!image) return;
        bitmap = await createImageBitmap(image);
    } else {
        if (dict.has(decodeParms)) return;
        const jpegBytes = jpegContents(stream);
        if (!jpegBytes) return;
        bitmap = await createImageBitmap(new Blob([new Uint8Array(jpegBytes)], { type: 'image/jpeg' }), {
            imageOrientation: 'none',
            colorSpaceConversion: 'none',
        });
    }

    try {
        if (bitmap.width !== width || bitmap.height !== height) return;
        const scale = Math.min(1, profile.maxSide / Math.max(width, height));
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const jpeg = await canvasToBlob(canvas, 'image/jpeg', profile.quality);
        if (jpeg.size >= stream.contents.length) return;
        const optimized = dict.clone();
        optimized.set(filter, dctDecode);
        optimized.set(colorSpace, deviceRgb);
        optimized.delete(decodeParms);
        optimized.set(widthKey, PDFNumber.of(canvas.width));
        optimized.set(heightKey, PDFNumber.of(canvas.height));
        return PDFRawStream.of(optimized, new Uint8Array(await jpeg.arrayBuffer()));
    } finally {
        bitmap.close();
        clearCanvas(canvas);
    }
}

export async function compressDocument(input: File, level: CompressionLevel, onProgress: (fraction: number) => void) {
    const doc = await PDFDocument.load(await input.arrayBuffer(), { updateMetadata: false });
    const pages = doc.getPageCount();
    if (pages < 1) throw new Error('PDF contains no pages');
    const objects = doc.context.enumerateIndirectObjects();
    const signed = doc.catalog.has(PDFName.of('Perms')) || objects.some(([, obj]) =>
        obj instanceof PDFDict && obj.has(PDFName.of('ByteRange')) && obj.has(PDFName.of('Contents'))
    );
    if (signed) return { file: input, pages, kind: 'signed' as const };

    const images = objects.filter((entry): entry is [typeof entry[0], PDFRawStream] =>
        entry[1] instanceof PDFRawStream && entry[1].dict.get(subtype) === PDFName.of('Image'));
    const maskImages = new Set(images.flatMap(([, image]) => maskKeys.map(key => image.dict.lookup(key))));
    const allowGray = !doc.catalog.has(PDFName.of('OutputIntents'));
    const canvas = document.createElement('canvas');
    for (const [index, [ref, image]] of images.entries()) {
        if (!maskImages.has(image)) {
            try {
                const optimized = await recompressImage(image, profiles[level], canvas, allowGray);
                if (optimized) doc.context.assign(ref, optimized);
            } catch {
                // Keep unsupported or unreadable images in their original streams.
            }
        }
        onProgress((index + 1) / (images.length + 1));
    }
    const bytes = await doc.save({ addDefaultPage: false, updateFieldAppearances: false, useObjectStreams: true });
    if (bytes.byteLength >= input.size) return { file: input, pages, kind: 'original' as const };
    return {
        file: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
        pages,
        kind: 'compressed' as const,
    };
}

export function compressionError(error: unknown) {
    if (error instanceof EncryptedPDFError) return 'الملف محمي بكلمة مرور. اختر نسخة مفتوحة منه.';
    return 'تعذّر ضغط هذا الملف. تأكد من أنه ملف PDF سليم.';
}
