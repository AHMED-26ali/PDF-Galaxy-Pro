import { decodePDFRawStream, EncryptedPDFError, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import { canvasToBlob, clearCanvas, openPdf } from './pdfRuntime';

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

async function recompressImage(stream: PDFRawStream, profile: typeof profiles.medium, canvas: HTMLCanvasElement, allowGray: boolean, preserveResolution: boolean) {
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
        // Keep the original raster pixel dimensions when the document will be uploaded to other services.
        const scale = preserveResolution ? 1 : Math.min(1, profile.maxSide / Math.max(width, height));
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

/**
 * Independently check a smaller PDF with the same viewer used by the preview tool.
 * Both page geometry and searchable text must survive the conversion. On any
 * unexpected change, never hand the transformed file to the user.
 */
async function isUploadCompatible(before: Uint8Array, after: Uint8Array) {
    let source: Awaited<ReturnType<typeof openPdf>> | undefined;
    let output: Awaited<ReturnType<typeof openPdf>> | undefined;
    try {
        source = await openPdf(before);
        output = await openPdf(after);
        if (source.numPages !== output.numPages) return false;
        for (let i = 1; i <= source.numPages; i++) {
            const [a, b] = await Promise.all([source.getPage(i), output.getPage(i)]);
            try {
                if (a.rotate !== b.rotate || Math.abs(a.userUnit - b.userUnit) > 0.0001 ||
                    a.view.length !== b.view.length || a.view.some((value, n) => Math.abs(value - b.view[n]) > 0.02)) {
                    return false;
                }
                const [originalText, compressedText] = await Promise.all([a.getTextContent(), b.getTextContent()]);
                const textOf = (items: typeof originalText.items) => items.filter(item => 'str' in item)
                    .map(item => 'str' in item ? item.str : '').join('');
                if (textOf(originalText.items) !== textOf(compressedText.items)) return false;
                // Parse the compressed page's drawing operations before offering it for download.
                await b.getOperatorList();
            } finally {
                a.cleanup();
                b.cleanup();
            }
        }
        return true;
    } catch {
        return false;
    } finally {
        if (output) await output.destroy().catch(() => {});
        if (source) await source.destroy().catch(() => {});
    }
}

type ImageProfile = typeof profiles.medium;

/**
 * Re-encode eligible image XObjects without changing the page tree, geometry,
 * text, selectable layers or annotations. Starting from source bytes each time
 * prevents repeated lossy generations of already-compressed JPEG images.
 */
async function encodeImageObjects(
    input: Uint8Array,
    profile: ImageProfile,
    preserveResolution: boolean,
    onProgress: (fraction: number) => void,
): Promise<Uint8Array> {
    const doc = await PDFDocument.load(input, { updateMetadata: false });
    const objects = doc.context.enumerateIndirectObjects();
    const images = objects.filter((entry): entry is [typeof entry[0], PDFRawStream] =>
        entry[1] instanceof PDFRawStream && entry[1].dict.get(subtype) === PDFName.of('Image'));
    const maskImages = new Set(images.flatMap(([, image]) => maskKeys.map(key => image.dict.lookup(key))));
    const allowGray = !doc.catalog.has(PDFName.of('OutputIntents'));
    const canvas = document.createElement('canvas');
    try {
        for (const [index, [ref, image]] of images.entries()) {
            if (!maskImages.has(image)) {
                try {
                    const optimized = await recompressImage(image, profile, canvas, allowGray, preserveResolution);
                    if (optimized) doc.context.assign(ref, optimized);
                } catch {
                    // Preserve an unsupported or damaged image instead of altering the document.
                }
            }
            onProgress((index + 1) / (images.length + 1));
        }
    } finally {
        clearCanvas(canvas);
    }
    const output = await doc.save({
        addDefaultPage: false,
        updateFieldAppearances: false,
        useObjectStreams: false,
    });
    onProgress(1);
    return output;
}

/**
 * Optional last resort only for a scan-only PDF (no selectable text,
 * annotations, or form fields): rebuild pages from their visible appearance.
 * This preserves the exact PDF page size, but raster resolution can decrease.
 * Never use this method for searchable/document-native PDFs.
 */
async function encodeScanPages(
    originalBytes: Uint8Array,
    maxSide: number,
    quality: number,
    onProgress: (fraction: number) => void,
): Promise<Uint8Array | undefined> {
    const pdf = await openPdf(originalBytes);
    try {
        if (pdf.numPages < 1 || pdf.numPages > 80) return;
        const original = await PDFDocument.load(originalBytes, { updateMetadata: false });
        if (original.catalog.has(PDFName.of('AcroForm'))) return;
        const originalPages = original.getPages();
        // Do all eligibility checks before creating a single output page.
        for (let i = 1; i <= pdf.numPages; i++) {
            const view = await pdf.getPage(i);
            const media = originalPages[i - 1].getMediaBox();
            const crop = originalPages[i - 1].getCropBox();
            if (view.userUnit !== 1 || Math.abs(media.x) > 0.01 || Math.abs(media.y) > 0.01 ||
                Math.abs(crop.x) > 0.01 || Math.abs(crop.y) > 0.01 ||
                Math.abs(crop.width - media.width) > 0.01 ||
                Math.abs(crop.height - media.height) > 0.01) return;
            const [text, annotations] = await Promise.all([
                view.getTextContent(),
                view.getAnnotations({ intent: 'display' }),
            ]);
            if (annotations.length || text.items.some(item => 'str' in item && item.str.trim())) return;
        }

        const output = await PDFDocument.create();
        const canvas = document.createElement('canvas');
        try {
            for (let i = 1; i <= pdf.numPages; i++) {
                const pdfPage = await pdf.getPage(i);
                const originalPage = originalPages[i - 1];
                const base = pdfPage.getViewport({ scale: 1, rotation: 0 });
                const scale = Math.min(2, maxSide / Math.max(base.width, base.height));
                const viewport = pdfPage.getViewport({ scale, rotation: 0 });
                canvas.width = Math.max(1, Math.round(viewport.width));
                canvas.height = Math.max(1, Math.round(viewport.height));
                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) return;
                await pdfPage.render({ canvasContext: ctx, viewport, background: '#ffffff' }).promise;
                const compressed = await canvasToBlob(canvas, 'image/jpeg', quality);
                const jpg = await output.embedJpg(new Uint8Array(await compressed.arrayBuffer()));
                const newPage = output.addPage([originalPage.getWidth(), originalPage.getHeight()]);
                newPage.setRotation(originalPage.getRotation());
                newPage.drawImage(jpg, {
                    x: 0, y: 0, width: originalPage.getWidth(), height: originalPage.getHeight(),
                });
                onProgress(i / pdf.numPages);
            }
            return output.save({ useObjectStreams: false, addDefaultPage: false });
        } finally {
            clearCanvas(canvas);
        }
    } catch {
        // This optional fallback is skipped if PDF.js cannot fully render the scan.
        return;
    } finally {
        await pdf.destroy().catch(() => {});
    }
}

export async function compressDocument(
    input: File, level: CompressionLevel, onProgress: (fraction: number) => void,
    preserveResolution = true, targetBytes?: number,
) {
    const originalBytes = new Uint8Array(await input.arrayBuffer());
    const source = await PDFDocument.load(originalBytes, { updateMetadata: false });
    const pages = source.getPageCount();
    if (pages < 1) throw new Error('PDF contains no pages');
    const objects = source.context.enumerateIndirectObjects();
    const signed = source.catalog.has(PDFName.of('Perms')) || objects.some(([, obj]) =>
        obj instanceof PDFDict && obj.has(PDFName.of('ByteRange')) && obj.has(PDFName.of('Contents'))
    );
    if (signed) return { file: input, pages, kind: 'signed' as const, targetReached: false };

    const desired = Number.isFinite(targetBytes) && (targetBytes ?? 0) >= 50 * 1024
        ? Math.round(targetBytes!) : undefined;
    const tries: ImageProfile[] = desired
        ? [profiles[level], { quality: 0.38, maxSide: 1050, optimizeMoreFormats: true },
            { quality: 0.27, maxSide: 850, optimizeMoreFormats: true },
            { quality: 0.18, maxSide: 700, optimizeMoreFormats: true }]
        : [profiles[level]];
    let best: Uint8Array | undefined;
    let bestSize = input.size;
    const totalSteps = tries.length + (desired ? 4 : 0);

    for (const [index, profile] of tries.entries()) {
        const bytes = await encodeImageObjects(originalBytes, profile,
            desired ? false : preserveResolution, fraction => onProgress((index + fraction) / totalSteps));
        if (bytes.length < bestSize && await isUploadCompatible(originalBytes, bytes)) {
            best = bytes;
            bestSize = bytes.length;
            if (desired && bestSize <= desired) break;
        }
    }

    // A photographed PDF sometimes contains unsupported image encodings. When
    // a hard size limit was requested, offer scan-only recompression as a safe
    // fallback, not as a replacement for PDF text or vector content.
    if (desired && bestSize > desired) {
        const scanTries = [
            { maxSide: 1350, quality: 0.55 },
            { maxSide: 1050, quality: 0.40 },
            { maxSide: 850, quality: 0.30 },
            { maxSide: 700, quality: 0.23 },
        ];
        for (const [index, profile] of scanTries.entries()) {
            const candidate = await encodeScanPages(originalBytes, profile.maxSide, profile.quality,
                fraction => onProgress((tries.length + index + fraction) / totalSteps));
            if (!candidate) break;
            if (candidate.length < bestSize && await isUploadCompatible(originalBytes, candidate)) {
                best = candidate;
                bestSize = candidate.length;
                if (bestSize <= desired) break;
            }
        }
    }
    onProgress(1);
    if (!best) return {
        file: input, pages, kind: 'original' as const, targetReached: desired ? input.size <= desired : undefined,
    };
    return {
        file: new Blob([new Uint8Array(best)], { type: 'application/pdf' }),
        pages,
        kind: 'compressed' as const,
        targetReached: desired ? bestSize <= desired : undefined,
    };
}

export function compressionError(error: unknown) {
    if (error instanceof EncryptedPDFError) return 'الملف محمي بكلمة مرور. اختر نسخة مفتوحة منه.';
    return 'تعذّر ضغط هذا الملف. تأكد من أنه ملف PDF سليم.';
}
