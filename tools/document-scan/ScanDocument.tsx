import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpTrayIcon, DocumentTextIcon, PhotoIcon } from '../../components/icons';
import { canvasToBlob, clearCanvas, downloadFile, openPdf, pdfError, renderPdfPage, type PDFDocumentProxy } from '../pdfRuntime';
import { scanPageJpeg, type PageSize } from './scanPage';
import { detectCorners, imageCorners, validCorners, type Corners, type Point, type ScanMode, type ScanProfile, type ScanSettings } from './scanImage';

type Source = {
    url: string;
    fileName: string;
    canvas: HTMLCanvasElement;
    detected: Corners;
    pixelSize: PageSize;
    pdfSize: PageSize;
};
type Scan = { url: string; blob: Blob };

const galleryTypes = 'image/*,.heic,.heif';
const heicExtension = /\.hei[cf]$/i;
const heicMime = /^image\/hei[cf](?:-sequence)?$/i;
const labels = ['الركن العلوي الأيسر', 'الركن العلوي الأيمن', 'الركن السفلي الأيمن', 'الركن السفلي الأيسر'];
const primaryButton = 'rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50';

async function loadImage(blob: Blob) {
    const url = URL.createObjectURL(blob);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        return { image, url };
    } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
    }
}

async function openPhoto(file: File) {
    try {
        return await loadImage(file);
    } catch (error) {
        if (!heicExtension.test(file.name) && !heicMime.test(file.type)) throw error;
        /*! HEIC decoder heic-to, LGPL-3.0-or-later. See /licenses/heic-to.txt. */
        const { heicTo } = await import('heic-to/csp');
        const photo = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.97 });
        return loadImage(photo);
    }
}

function imageCanvas(image: CanvasImageSource, width: number, height: number, maxSide: number) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { canvas, ctx };
}

async function pdfCanvas(pdf: PDFDocumentProxy, pageNumber: number) {
    const page = await pdf.getPage(pageNumber);
    try {
        const { width, height } = page.getViewport({ scale: 1 });
        const canvas = await renderPdfPage(page, 4.2, 3508);
        return { canvas, pdfSize: { width, height } };
    } finally {
        page.cleanup();
    }
}

async function pdfPageSource(pdf: PDFDocumentProxy, pageNumber: number, fileName: string): Promise<Source> {
    const { canvas, pdfSize } = await pdfCanvas(pdf, pageNumber);
    try {
        const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
        return { url: URL.createObjectURL(blob), fileName, canvas, detected: imageCorners,
            pixelSize: { width: canvas.width, height: canvas.height }, pdfSize };
    } catch (error) {
        clearCanvas(canvas);
        throw error;
    }
}

const ScanDocument: React.FC = () => {
    const [source, setSource] = useState<Source | null>(null);
    const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [exportPage, setExportPage] = useState(0);
    const pageSelections = useRef(new Map<number, Corners>());
    const [scan, setScan] = useState<Scan | null>(null);
    const [corners, setCorners] = useState<Corners>(imageCorners);
    const [cropEdited, setCropEdited] = useState(false);
    const [profile, setProfile] = useState<ScanProfile>('detail');
    const [mode, setMode] = useState<ScanMode>('color');
    const [autoStraighten, setAutoStraighten] = useState(true);
    const [view, setView] = useState<'crop' | 'scan'>('crop');
    const [status, setStatus] = useState<'idle' | 'loading' | 'processing' | 'pdf'>('idle');
    const [error, setError] = useState('');
    const workerRef = useRef<Worker | null>(null);
    const job = useRef(0);
    const photo = useRef<HTMLDivElement>(null);
    const settings: ScanSettings = { mode, profile, straighten: autoStraighten };

    useEffect(() => () => {
        job.current++;
        workerRef.current?.terminate();
    }, []);
    useEffect(() => () => {
        if (source) {
            URL.revokeObjectURL(source.url);
            clearCanvas(source.canvas);
        }
    }, [source]);
    useEffect(() => () => {
        void pdfDocument?.destroy().catch(() => {});
    }, [pdfDocument]);
    useEffect(() => () => {
        if (scan) URL.revokeObjectURL(scan.url);
    }, [scan]);

    async function scanCanvas(canvas: HTMLCanvasElement, selection: Corners, pixelSize: PageSize, options: ScanSettings, suggestedCrop = false) {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const worker = new Worker(new URL('./scanImage.worker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        try {
            const result = await new Promise<ImageData>((resolve, reject) => {
                worker.onmessage = ({ data }) => data.image ? resolve(data.image) : reject(new Error('Scan failed'));
                worker.onerror = reject;
                worker.postMessage({ image, corners: selection, settings: options, suggestedCrop }, [image.data.buffer]);
            });
            return await scanPageJpeg(result, pixelSize);
        } finally {
            worker.terminate();
            if (workerRef.current === worker) workerRef.current = null;
        }
    }

    async function process(page: Source, selection: Corners, options = settings, manualCrop = cropEdited) {
        const current = ++job.current;
        setStatus('processing');
        setError('');
        setScan(null);
        try {
            const suggestedCrop = options.profile === 'document' && options.straighten && !manualCrop;
            const crop = suggestedCrop ? page.detected : selection;
            const blob = await scanCanvas(page.canvas, crop, page.pixelSize, options, suggestedCrop);
            if (job.current !== current) return;
            setScan({ blob, url: URL.createObjectURL(blob) });
            setView('scan');
        } catch {
            if (job.current === current) {
                setView('crop');
                setError('تعذّر تجهيز السكان. جرّب تعديل الأركان أو اختر ملفًا آخر.');
            }
        } finally {
            if (job.current === current) setStatus('idle');
        }
    }

    async function selectFile(file?: File) {
        if (!file) return;
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        const hasImageType = !file.type || file.type === 'application/octet-stream'
            || (file.type.startsWith('image/') && file.type !== 'image/svg+xml');
        if (!isPdf && !hasImageType && !heicExtension.test(file.name)) {
            setError('اختر صورة للورقة أو ملف PDF.');
            return;
        }
        const current = ++job.current;
        setStatus('loading');
        setError('');
        const fileName = file.name.replace(/\.[^.]+$/, '') || 'document';
        let url: string | undefined;
        let openedPdf: PDFDocumentProxy | undefined;
        try {
            let next: Source;
            if (isPdf) {
                openedPdf = await openPdf(file);
                if (job.current !== current) return;
                next = await pdfPageSource(openedPdf, 1, fileName);
                url = next.url;
            } else {
                const photo = await openPhoto(file);
                url = photo.url;
                const { image } = photo;
                const { canvas } = imageCanvas(image, image.naturalWidth, image.naturalHeight, 3600);
                const preview = imageCanvas(canvas, canvas.width, canvas.height, 384);
                const detected = detectCorners(preview.ctx.getImageData(0, 0, preview.canvas.width, preview.canvas.height));
                const pixelSize = { width: image.naturalWidth, height: image.naturalHeight };
                // A photo has pixel dimensions; map CSS pixels to PDF points at 96 px/in.
                const pdfSize = { width: pixelSize.width * 72 / 96, height: pixelSize.height * 72 / 96 };
                next = { url, fileName, canvas, detected, pixelSize, pdfSize };
            }
            if (job.current !== current) {
                URL.revokeObjectURL(next.url);
                clearCanvas(next.canvas);
                return;
            }
            pageSelections.current.clear();
            setPdfDocument(openedPdf ?? null);
            openedPdf = undefined;
            setPageNumber(1);
            setSource(next);
            setCorners(imageCorners);
            setCropEdited(false);
            setView('crop');
            await process(next, imageCorners, settings, false);
        } catch (error) {
            if (url) URL.revokeObjectURL(url);
            if (job.current === current) {
                setError(isPdf ? pdfError(error, 'تعذّر فتح ملف PDF. اختر ملفًا سليمًا.') :
                    'تعذّر فتح الصورة. جرّب صورة JPG أو PNG أو HEIC سليمة.');
                setStatus('idle');
            }
        } finally {
            void openedPdf?.destroy().catch(() => {});
        }
    }

    function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        void selectFile(file);
    }

    async function showPdfPage(number: number) {
        if (!pdfDocument || !source || number < 1 || number > pdfDocument.numPages || number === pageNumber) return;
        const current = ++job.current;
        setStatus('loading');
        setError('');
        try {
            const next = await pdfPageSource(pdfDocument, number, source.fileName);
            if (job.current !== current) {
                URL.revokeObjectURL(next.url);
                clearCanvas(next.canvas);
                return;
            }
            const saved = pageSelections.current.get(number);
            const selection = saved ?? imageCorners;
            setPageNumber(number);
            setSource(next);
            setCorners(selection);
            setCropEdited(!!saved);
            setView('crop');
            await process(next, selection, settings, !!saved);
        } catch {
            if (job.current === current) {
                setError('تعذّر فتح الصفحة. جرّب مرة أخرى.');
                setStatus('idle');
            }
        }
    }

    function changeCorners(next: Corners) {
        if (!validCorners(next) || (cropEdited && next.every((point, index) => point === corners[index]))) return;
        setCorners(next);
        setCropEdited(true);
        if (pdfDocument) pageSelections.current.set(pageNumber, next);
        setScan(null);
    }

    function moveCorner(index: number, point: Point) {
        const next = [...corners] as Corners;
        next[index] = {
            x: Math.max(0, Math.min(1, point.x)),
            y: Math.max(0, Math.min(1, point.y)),
        };
        changeCorners(next);
    }

    async function downloadPdf() {
        if (!scan || !source) return;
        const current = ++job.current;
        const pageCount = pdfDocument?.numPages ?? 1;
        setExportPage(1);
        setStatus('pdf');
        setError('');
        try {
            const { PDFDocument } = await import('pdf-lib');
            const output = await PDFDocument.create();
            for (let number = 1; number <= pageCount; number++) {
                if (job.current !== current) return;
                setExportPage(number);
                let blob = scan.blob;
                let pageSize = source.pdfSize;
                if (pdfDocument && number !== pageNumber) {
                    const { canvas, pdfSize } = await pdfCanvas(pdfDocument, number);
                    pageSize = pdfSize;
                    try {
                        if (job.current !== current) return;
                        blob = await scanCanvas(canvas, pageSelections.current.get(number) ?? imageCorners,
                            { width: canvas.width, height: canvas.height }, settings);
                    } finally {
                        clearCanvas(canvas);
                    }
                }
                if (job.current !== current) return;
                const image = await output.embedJpg(await blob.arrayBuffer());
                const { width, height } = pageSize;
                const page = output.addPage([width, height]);
                const size = image.scaleToFit(width, height);
                page.drawImage(image, { ...size, x: (width - size.width) / 2, y: (height - size.height) / 2 });
            }
            const bytes = await output.save();
            if (job.current === current) downloadFile(bytes, source.fileName + '-scan.pdf', 'application/pdf');
        } catch {
            if (job.current === current) setError('تعذّر تنزيل ملف PDF. جرّب مرة أخرى.');
        } finally {
            if (job.current === current) setStatus('idle');
        }
    }

    function changeProfile(next: ScanProfile) {
        if (profile === next) return;
        setProfile(next);
        if (source && view === 'scan') void process(source, corners, { ...settings, profile: next });
        else setScan(null);
    }

    const busy = status !== 'idle';

    return (
        <div className="space-y-5">
            <fieldset disabled={busy}>
                <legend className="mb-2 text-sm font-bold text-slate-700">نوع المعالجة</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" aria-pressed={profile === 'document'}
                        className={(profile === 'document' ? primaryButton : secondaryButton) + ' text-start leading-relaxed'}
                        onClick={() => changeProfile('document')}>
                        <span className="block">سكان مستند</span>
                        <span className="block text-xs font-normal">للفواتير والبيانات · تقليل الظلال وتفتيح الورق</span>
                    </button>
                    <button type="button" aria-pressed={profile === 'detail'}
                        className={(profile === 'detail' ? primaryButton : secondaryButton) + ' text-start leading-relaxed'}
                        onClick={() => changeProfile('detail')}>
                        <span className="block">حفظ الصور والتفاصيل</span>
                        <span className="block text-xs font-normal">للجوازات والهويات · الحفاظ على تفاصيل الصور</span>
                    </button>
                </div>
            </fieldset>
            {!source && status !== 'loading' && (
                <section aria-label="رفع المستند"
                    className="rounded-3xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-5 text-center sm:p-10"
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => {
                        event.preventDefault();
                        void selectFile(event.dataTransfer.files[0]);
                    }}>
                    <h2 className="text-xl font-black text-slate-900 sm:text-2xl">ارفع صورة أو ملف PDF</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">اختر ملفًا من جهازك أو التقط صورة للورقة بالكاميرا. يمكنك أيضًا سحب الملف وإفلاته هنا.</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                        <label className={primaryButton + ' inline-flex cursor-pointer items-center justify-center gap-2 focus-within:ring-2 focus-within:ring-blue-700 focus-within:ring-offset-2'}>
                            <ArrowUpTrayIcon className="h-5 w-5" />
                            اختيار صورة من المعرض
                            <input className="sr-only" type="file" accept={galleryTypes} onChange={handleFileInput} />
                        </label>
                        <label className={secondaryButton + ' inline-flex cursor-pointer items-center justify-center gap-2 focus-within:ring-2 focus-within:ring-blue-700 focus-within:ring-offset-2'}>
                            <DocumentTextIcon className="h-5 w-5" />
                            رفع ملف PDF
                            <input className="sr-only" type="file" accept=".pdf,application/pdf" onChange={handleFileInput} />
                        </label>
                        <label className={secondaryButton + ' inline-flex cursor-pointer items-center justify-center gap-2 focus-within:ring-2 focus-within:ring-blue-700 focus-within:ring-offset-2'}>
                            <PhotoIcon className="h-5 w-5" />
                            تصوير الورقة بالكاميرا
                            <input className="sr-only" type="file" accept="image/*" capture="environment" onChange={handleFileInput} />
                        </label>
                    </div>
                    <p className="mt-4 text-xs text-slate-600">يدعم ملفات PDF وصور JPG وPNG وWebP وHEIC. تتم المعالجة على جهازك.</p>
                </section>
            )}
            {source && (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2" role="group" aria-label="معاينة المستند">
                            <button type="button" className={view === 'crop' ? primaryButton : secondaryButton}
                                aria-pressed={view === 'crop'} disabled={busy} onClick={() => setView('crop')}>
                                تحديد الأركان
                            </button>
                            <button type="button" className={view === 'scan' ? primaryButton : secondaryButton}
                                aria-pressed={view === 'scan'} disabled={busy || !scan} onClick={() => setView('scan')}>
                                معاينة السكان
                            </button>
                        </div>
                        <button type="button" className={secondaryButton} disabled={busy}
                            onClick={() => { setSource(null); setPdfDocument(null); setScan(null); setProfile('detail'); setView('crop'); setError(''); }}>
                            اختيار ملف آخر
                        </button>
                    </div>

                    {pdfDocument && pdfDocument.numPages > 1 && (
                        <div className="flex flex-wrap items-center justify-center gap-3" aria-label="التنقل بين الصفحات" role="group">
                            <button type="button" className={secondaryButton} disabled={busy || pageNumber === 1}
                                onClick={() => showPdfPage(pageNumber - 1)}>الصفحة السابقة</button>
                            <span role="status" className="text-sm font-semibold text-slate-700">
                                صفحة {pageNumber} من {pdfDocument.numPages}
                            </span>
                            <button type="button" className={secondaryButton} disabled={busy || pageNumber === pdfDocument.numPages}
                                onClick={() => showPdfPage(pageNumber + 1)}>الصفحة التالية</button>
                        </div>
                    )}
                    <div className="rounded-2xl bg-slate-100 p-5 sm:p-6">
                        {view === 'crop' ? (
                            <>
                                <p className="mb-4 text-sm text-slate-700">اسحب العلامات الأربع إلى أركان الورقة أو حرّكها بمفاتيح الأسهم.</p>
                                <div ref={photo} dir="ltr" className="relative mx-auto w-full"
                                    style={{ maxWidth: Math.min(656, 660 * source.canvas.width / source.canvas.height) }}>
                                    <img src={source.url} alt="صورة المستند الأصلية" className="block h-auto w-full rounded" draggable={false} />
                                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
                                        className="pointer-events-none absolute inset-0 h-full w-full">
                                        <polygon points={corners.map(({ x, y }) => `${x * 100},${y * 100}`).join(' ')}
                                            fill="#2563eb" fillOpacity=".08" stroke="#2563eb" strokeWidth="2"
                                            vectorEffect="non-scaling-stroke" />
                                    </svg>
                                    {corners.map((point, index) => (
                                        <button key={index} type="button" aria-label={labels[index]} disabled={busy}
                                            className="absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-blue-700 cursor-grab active:cursor-grabbing"
                                            style={{ top: `${point.y * 100}%`, left: `${point.x * 100}%`, touchAction: 'none' }}
                                            onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
                                            onPointerMove={event => {
                                                if (!event.currentTarget.hasPointerCapture(event.pointerId) || !photo.current) return;
                                                const bounds = photo.current.getBoundingClientRect();
                                                moveCorner(index, { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height });
                                            }}
                                            onKeyDown={event => {
                                                const offset: Record<string, [number, number]> = {
                                                    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
                                                };
                                                const delta = offset[event.key];
                                                if (!delta) return;
                                                event.preventDefault();
                                                const step = event.shiftKey ? 0.027 : 0.006;
                                                moveCorner(index, { x: point.x + delta[0] * step, y: point.y + delta[1] * step });
                                            }}>
                                            <span className="h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow-md" />
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-5 flex flex-wrap gap-2">
                                    <button type="button" className={secondaryButton} disabled={busy} onClick={() => changeCorners(source.detected)}>
                                        اقتراح حدود الورقة
                                    </button>
                                    <button type="button" className={secondaryButton} disabled={busy} onClick={() => changeCorners(imageCorners)}>
                                        استخدام الصورة كاملة
                                    </button>
                                </div>
                            </>
                        ) : scan && (
                            <section aria-labelledby="scan-result-title">
                                <h2 id="scan-result-title" className="mb-4 text-center text-lg font-black text-slate-900">
                                    معاينة الملف بعد التحسين
                                </h2>
                                <img src={scan.url} alt="معاينة السكان بعد التحسين"
                                    className="mx-auto block h-auto max-h-[660px] max-w-full rounded bg-white object-contain shadow-sm" />
                                <div className="mt-5 flex flex-wrap justify-center gap-3">
                                    <a className={secondaryButton} href={scan.url}
                                        download={source.fileName + (pdfDocument && pdfDocument.numPages > 1 ? '-page-' + pageNumber : '-scan') + '.jpg'}>
                                        {pdfDocument && pdfDocument.numPages > 1 ? 'تنزيل الصفحة JPG' : 'تنزيل كصورة JPG'}
                                    </a>
                                    <button type="button" className={primaryButton} disabled={busy} onClick={downloadPdf}>
                                        {pdfDocument && pdfDocument.numPages > 1 ? 'تنزيل كل الصفحات PDF' : 'تنزيل كملف PDF'}
                                    </button>
                                </div>
                            </section>
                        )}
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="grid gap-1 text-sm font-bold text-slate-700">
                            وضع التحسين
                            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2.5" value={mode} disabled={busy}
                                onChange={event => {
                                    const nextMode = event.target.value as ScanMode;
                                    setMode(nextMode);
                                    if (view === 'scan') void process(source, corners, { ...settings, mode: nextMode });
                                    else setScan(null);
                                }}>
                                <option value="grayscale">أبيض وأسود</option>
                                <option value="color">ألوان محسّنة</option>
                            </select>
                        </label>
                        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                            <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={autoStraighten} disabled={busy}
                                onChange={event => {
                                    const enabled = event.target.checked;
                                    setAutoStraighten(enabled);
                                    if (view === 'scan') void process(source, corners, { ...settings, straighten: enabled });
                                    else setScan(null);
                                }} />
                            تصحيح الميل تلقائيًا
                        </label>
                        {(!scan || view === 'crop') && (
                            <button type="button" className={primaryButton} disabled={busy}
                                onClick={() => process(source, corners)}>تحسين الصورة</button>
                        )}
                    </div>
                </>
            )}
            {busy && (
                <p role="status" className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                    {status === 'loading' ? 'جاري فتح الملف…' : status === 'pdf' && pdfDocument && pdfDocument.numPages > 1
                        ? `جاري تجهيز الصفحة ${exportPage} من ${pdfDocument.numPages}…`
                        : status === 'pdf' ? 'جاري تجهيز ملف PDF…' : 'جاري تسوية الورقة وتحسين وضوح الكتابة…'}
                </p>
            )}
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}
        </div>
    );
};

export default ScanDocument;
