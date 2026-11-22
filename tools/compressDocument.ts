import { decodePDFRawStream, EncryptedPDFError, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import { canvasToBlob, clearCanvas } from './pdfRuntime';

const profiles = {
    low: { quality: 0.90, maxSide: 3200 },
    medium: { quality: 0.76, maxSide: 2400 },
    high: { quality: 0.58, maxSide: 1600 },
};

export type CompressionLevel = keyof typeof profiles;

const subtype = PDFName.of('Subtype');
const filter = PDFName.of('Filter');
const dctDecode = PDFName.of('DCTDecode');
const colorSpace = PDFName.of('ColorSpace');
const bits = PDFName.of('BitsPerComponent');
const widthKey = PDFName.of('Width');
const heightKey = PDFName.of('Height');
const protectedImageEntries = ['Mask', 'SMask', 'SMaskInData', 'ImageMask', 'Decode', 'DecodeParms', 'Alternates', 'OPI']
    .map(PDFName.of);

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

async function recompressJpeg(stream: PDFRawStream, profile: typeof profiles.medium, canvas: HTMLCanvasElement) {
    const dict = stream.dict;
    if (dict.get(colorSpace) !== PDFName.of('DeviceRGB') || protectedImageEntries.some(key => dict.has(key))) return;

    const depth = dict.lookupMaybe(bits, PDFNumber)?.asNumber();
    const width = dict.lookupMaybe(widthKey, PDFNumber)?.asNumber() ?? 0;
    const height = dict.lookupMaybe(heightKey, PDFNumber)?.asNumber() ?? 0;
    if (depth !== 8 || width < 1 || height < 1 || width * height > 24_000_000) return;

    const jpegBytes = jpegContents(stream);
    if (!jpegBytes) return;
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(jpegBytes)], { type: 'image/jpeg' }), {
        imageOrientation: 'none',
        colorSpaceConversion: 'none',
    });
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

    const images = objects.filter(([, obj]) => obj instanceof PDFRawStream &&
        obj.dict.get(subtype) === PDFName.of('Image'));
    const canvas = document.createElement('canvas');
    for (const [index, [ref, image]] of images.entries()) {
        try {
            const optimized = await recompressJpeg(image as PDFRawStream, profiles[level], canvas);
            if (optimized) doc.context.assign(ref, optimized);
        } catch {
            // Keep unsupported or unreadable images in their original streams.
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
