import React, { useEffect, useRef, useState } from 'react';
import FileUploader from '../../components/FileUploader';
import { detectCorners, imageCorners, validCorners, type Corners, type Point, type ScanMode } from './scanImage';

type Source = { url: string; fileName: string; canvas: HTMLCanvasElement; detected: Corners };
type Scan = { url: string; blob: Blob; width: number; height: number };

const fileTypes = 'image/jpeg,image/png,image/webp';
const takePhotoTypes = fileTypes.split(',');
const labels = ['الركن العلوي الأيسر', 'الركن العلوي الأيمن', 'الركن السفلي الأيمن', 'الركن السفلي الأيسر'];
const primaryButton = 'rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50';

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

function jpegFromImage(image: ImageData) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.putImageData(image, 0, 0);
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode JPEG')), 'image/jpeg', 0.95);
    });
}

const ScanDocument: React.FC = () => {
    const [source, setSource] = useState<Source | null>(null);
    const [scan, setScan] = useState<Scan | null>(null);
    const [corners, setCorners] = useState<Corners>(imageCorners);
    const [mode, setMode] = useState<ScanMode>('grayscale');
    const [view, setView] = useState<'crop' | 'scan'>('crop');
    const [status, setStatus] = useState<'idle' | 'loading' | 'processing' | 'pdf'>('idle');
    const [error, setError] = useState('');
    const workerRef = useRef<Worker | null>(null);
    const job = useRef(0);
    const photo = useRef<HTMLDivElement>(null);

    useEffect(() => () => {
        job.current++;
        workerRef.current?.terminate();
    }, []);
    useEffect(() => () => {
        if (source) URL.revokeObjectURL(source.url);
    }, [source]);
    useEffect(() => () => {
        if (scan) URL.revokeObjectURL(scan.url);
    }, [scan]);

    async function process(canvas: HTMLCanvasElement, selection: Corners, scanMode: ScanMode) {
        const current = ++job.current;
        workerRef.current?.terminate();
        setStatus('processing');
        setError('');
        setScan(null);
        let worker: Worker | undefined;
        try {
            const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
            worker = new Worker(new URL('./scanImage.worker.ts', import.meta.url), { type: 'module' });
            workerRef.current = worker;
            const result = await new Promise<ImageData>((resolve, reject) => {
                worker!.onmessage = ({ data }) => data.image ? resolve(data.image) : reject(new Error('Scan failed'));
                worker!.onerror = reject;
                worker!.postMessage({ image, corners: selection, mode: scanMode }, [image.data.buffer]);
            });
            const blob = await jpegFromImage(result);
            if (job.current !== current) return;
            setScan({ blob, url: URL.createObjectURL(blob), width: result.width, height: result.height });
            setView('scan');
        } catch {
            if (job.current === current) setError('تعذّر تجهيز السكان. جرّب تعديل الأركان أو اختر صورة أخرى.');
        } finally {
            worker?.terminate();
            if (job.current === current) {
                workerRef.current = null;
                setStatus('idle');
            }
        }
    }

    async function selectFile([file]: File[]) {
        if (!file) return;
        if (file.type && !takePhotoTypes.includes(file.type)) {
            setError('اختر صورة بصيغة JPG أو PNG أو WebP.');
            return;
        }
        const current = ++job.current;
        setStatus('loading');
        setError('');
        const url = URL.createObjectURL(file);
        try {
            const image = new Image();
            image.src = url;
            await image.decode();
            if (job.current !== current) {
                URL.revokeObjectURL(url);
                return;
            }
            const { canvas } = imageCanvas(image, image.naturalWidth, image.naturalHeight, 3600);
            const preview = imageCanvas(canvas, canvas.width, canvas.height, 384);
            const detected = detectCorners(preview.ctx.getImageData(0, 0, preview.canvas.width, preview.canvas.height));
            setSource({ url, fileName: file.name.replace(/\.[^.]+$/, '') || 'document', canvas, detected });
            setCorners(detected);
            await process(canvas, detected, mode);
        } catch {
            URL.revokeObjectURL(url);
            if (job.current === current) {
                setError('تعذّر فتح الصورة. جرّب اختيار صورة أخرى بصيغة JPG أو PNG أو WebP.');
                setStatus('idle');
            }
        }
    }

    function changeCorners(next: Corners) {
        if (!validCorners(next) || next.every((point, index) => point === corners[index])) return;
        setCorners(next);
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
        const current = job.current;
        setStatus('pdf');
        setError('');
        try {
            const { PDFDocument, PageSizes } = await import('pdf-lib');
            const pdf = await PDFDocument.create();
            const image = await pdf.embedJpg(await scan.blob.arrayBuffer());
            const landscape = scan.width > scan.height;
            const [width, height] = landscape ? [PageSizes.A4[1], PageSizes.A4[0]] : PageSizes.A4;
            const page = pdf.addPage([width, height]);
            const size = image.scaleToFit(width - 24, height - 24);
            page.drawImage(image, { ...size, x: (width - size.width) / 2, y: (height - size.height) / 2 });
            const bytes = await pdf.save();
            if (job.current !== current) return;
            const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = source.fileName + '-scan.pdf';
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch {
            if (job.current === current) setError('تعذّر تنزيل ملف PDF. جرّب مرة أخرى.');
        } finally {
            if (job.current === current) setStatus('idle');
        }
    }

    const busy = status !== 'idle';

    return (
        <div className="space-y-5">
            {!source && status !== 'loading' && (
                <>
                    <div role="button" tabIndex={0} aria-label="اختيار صورة المستند"
                        className="rounded-3xl focus-visible:ring-2 focus-visible:ring-blue-600 [&_span.font-mono]:break-all"
                        onKeyDown={event => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            (event.currentTarget as HTMLDivElement).querySelector<HTMLInputElement>('input[type="file"]')?.click();
                        }}>
                        <FileUploader onFilesSelected={selectFile} accept=".jpg,.jpeg,.png,.webp" />
                    </div>
                    <p className="text-center text-sm text-slate-600">تُعالج الصورة داخل متصفحك على جهازك.</p>
                </>
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
                            onClick={() => { setSource(null); setScan(null); setView('crop'); setError(''); }}>
                            اختيار صورة أخرى
                        </button>
                    </div>

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
                                        استعادة التحديد التلقائي
                                    </button>
                                    <button type="button" className={secondaryButton} disabled={busy} onClick={() => changeCorners(imageCorners)}>
                                        استخدام الصورة كاملة
                                    </button>
                                </div>
                            </>
                        ) : scan && (
                            <img src={scan.url} alt="معاينة السكان بعد التحسين" className="mx-auto block max-h-[660px] max-w-full rounded bg-white shadow-sm" />
                        )}
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="grid gap-1 text-sm font-bold text-slate-700">
                            وضع التحسين
                            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2.5" value={mode} disabled={busy}
                                onChange={event => { setMode(event.target.value as ScanMode); setScan(null); setView('crop'); }}>
                                <option value="grayscale">أبيض وأسود</option>
                                <option value="color">ألوان محسّنة</option>
                            </select>
                        </label>
                        {(!scan || view === 'crop') && (
                            <button type="button" className={primaryButton} disabled={busy}
                                onClick={() => process(source.canvas, corners, mode)}>تحسين الصورة</button>
                        )}
                        {scan && (
                            <>
                                <a className={secondaryButton} href={scan.url} download={source.fileName + '-scan.jpg'}>تنزيل JPG</a>
                                <button type="button" className={primaryButton} disabled={busy} onClick={downloadPdf}>تنزيل PDF بحجم A4</button>
                            </>
                        )}
                    </div>
                </>
            )}
            {busy && (
                <p role="status" className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                    {status === 'loading' ? 'جاري فتح الصورة…' : status === 'pdf' ? 'جاري تجهيز ملف PDF…' : 'جاري تسوية الورقة وتحسين وضوح الكتابة…'}
                </p>
            )}
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}
        </div>
    );
};

export default ScanDocument;
