import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUturnLeftIcon, ArrowUturnRightIcon, ChevronLeftIcon, ChevronRightIcon, PhotoIcon, TypeIcon } from '../../components/icons';
import { PdfDownload, PdfWorkspace, field, outputFilename, type OpenPdf } from '../pdf-pages/PdfWorkspace';
import { clearCanvas, openPdf, pdfError, renderPdfPage, type PDFDocumentProxy } from '../pdfRuntime';
import { prepareEditor, readNativeRuns, type FontFamily, type TextRun, type TextStyle } from './nativeText';
import { loadImage, saveEditorPdf, type AddedText, type EditorChanges, type EditorImage } from './editorDocument';
import EditorImageLayer from './EditorImageLayer';
import EditorIdentity from './EditorIdentity';
import type { EditorViewControls } from './EditorEntry';

const empty: EditorChanges = { text: {}, images: [], addedText: [] };
const defaultTextStyle: TextStyle = { family: 'sans', size: 18, color: '#0f172a', bold: false, italic: false };
type Selection = { kind: 'text'; id: number } | { kind: 'addition' | 'image'; id: string };

const markButton = 'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-blue-700 disabled:opacity-40';
const zoomSteps = [50, 75, 100, 125, 150, 175, 200, 250, 300];
type Zoom = number | 'page';

function Field({ label, children }: { label: string; children: ReactNode }) {
    return <label className="block min-w-0 space-y-1 text-sm font-bold text-slate-700"><span>{label}</span>{children}</label>;
}

function FormatControls({ style, onChange, canColor, canItalic }: {
    style: TextStyle;
    onChange: (style: TextStyle) => void;
    canColor: boolean;
    canItalic: boolean;
}) {
    return (
        <div className="grid grid-cols-2 gap-2">
            <Field label="الخط">
                <select aria-label="الخط" className={field} value={style.family} onChange={event => onChange({ ...style, family: event.currentTarget.value as FontFamily })}>
                    <option value="auto">حسب النص الأصلي</option>
                    <option value="sans">بسيط</option>
                    <option value="serif">كلاسيكي</option>
                    <option value="mono">ثابت العرض</option>
                </select>
            </Field>
            <Field label="حجم الخط">
                <input aria-label="حجم الخط" type="number" min="1" max="240" step="any" className={field} value={style.size || ''} onChange={event => onChange({ ...style, size: Number(event.currentTarget.value) })} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input type="checkbox" checked={style.bold} onChange={event => onChange({ ...style, bold: event.currentTarget.checked })} /> عريض
            </label>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input type="checkbox" disabled={!canItalic} checked={style.italic && canItalic} onChange={event => onChange({ ...style, italic: event.currentTarget.checked })} /> مائل
            </label>
            {canColor && (
                <div className="col-span-2 flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                        <input type="checkbox" checked={style.color !== null} onChange={event => onChange({ ...style, color: event.currentTarget.checked ? '#0f172a' : null })} />
                        لون مخصص
                    </label>
                    {style.color !== null && (
                        <input type="color" aria-label="لون النص" className="h-8 w-10 rounded border border-slate-200 bg-white p-0.5" value={style.color} onChange={event => onChange({ ...style, color: event.currentTarget.value })} />
                    )}
                </div>
            )}
        </div>
    );
}

function EditorWorkspace({ file, reset, onBack, onFullscreen, fullscreen }: EditorViewControls & { file: OpenPdf; reset: () => void }) {
    const [source, setSource] = useState<Awaited<ReturnType<typeof prepareEditor>> | null>(null);
    const [pageIndex, setPageIndex] = useState(0);
    const [pageData, setPageData] = useState<{ page: number; width: number; height: number; runs: TextRun[] } | null>(null);
    const [patchedReader, setPatchedReader] = useState<{ page: number; edits: EditorChanges['text'][number]; reader: PDFDocumentProxy } | null>(null);
    const [preview, setPreview] = useState<{ page: number; image: string; reader: PDFDocumentProxy } | null>(null);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [history, setHistory] = useState({ entries: [empty], position: 0 });
    const [selection, setSelection] = useState<Selection | null>(null);
    const [draft, setDraft] = useState<{ text: string; style: TextStyle }>({ text: '', style: defaultTextStyle });
    const [zoom, setZoom] = useState<Zoom>(100);
    const [placeText, setPlaceText] = useState(false);
    const [addingImage, setAddingImage] = useState(false);
    const [error, setError] = useState('');
    const [pageError, setPageError] = useState('');
    const [previewError, setPreviewError] = useState('');
    const uploadRef = useRef<HTMLInputElement>(null);
    const viewportRef = useRef<HTMLElement>(null);
    const changes = history.entries[history.position];
    const current = pageData?.page === pageIndex ? pageData : null;
    const totalPages = file.document.getPageCount();
    const alteredRuns = changes.text[pageIndex];
    const currentTexts = current?.runs ?? [];
    const scannedOrUnsupported = current !== null && currentTexts.length === 0;
    const pickedText = selection?.kind === 'text' ? currentTexts.find(run => run.id === selection.id) : undefined;
    const pickedImage = selection?.kind === 'image' ? changes.images.find(image => image.id === selection.id) : undefined;
    const pickedAddition = selection?.kind === 'addition' ? changes.addedText.find(item => item.id === selection.id) : undefined;
    const hasChanges = Object.keys(changes.text).some(page => changes.text[Number(page)].length > 0)
        || changes.images.length > 0 || changes.addedText.some(item => item.text.trim());
    const activeReader = alteredRuns?.length
        ? patchedReader?.page === pageIndex && patchedReader.edits === alteredRuns ? patchedReader.reader : null
        : source?.reader;
    const previewPending = Boolean(alteredRuns?.length && (!activeReader || preview?.reader !== activeReader) && !previewError);
    const rendered = preview?.page === pageIndex ? preview.image : undefined;
    const pageWidth = current && viewportSize.width ? Math.max(1, Math.floor(zoom === 'page'
        ? Math.min(viewportSize.width, viewportSize.height * current.width / current.height)
        : viewportSize.width * zoom / 100)) : 0;
    const hasViewport = pageWidth > 0;
    const rasterScale = current && pageWidth ? Math.max(1.5, Math.ceil(pageWidth * Math.min(2, window.devicePixelRatio || 1) / current.width * 2) / 2) : 1.5;

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setViewportSize({ width, height });
        });
        observer.observe(viewport);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        let active = true;
        let opened: Awaited<ReturnType<typeof prepareEditor>> | undefined;
        prepareEditor(file.bytes).then(async data => {
            if (!active) {
                await data.reader.destroy();
                return;
            }
            opened = data;
            setSource(data);
        }).catch(error => {
            if (active) setPageError(pdfError(error, 'تعذّر فتح الملف داخل المحرّر.'));
        });
        return () => {
            active = false;
            if (opened) void opened.reader.destroy().catch(() => {});
        };
    }, [file]);

    useEffect(() => {
        if (!source) return;
        let active = true;
        setPageError('');
        const run = async () => {
            const page = await source.reader.getPage(pageIndex + 1);
            const viewport = page.getViewport({ scale: 1 });
            const runs = await readNativeRuns(page, file.document.getPage(pageIndex), source.targets[pageIndex] ?? []);
            if (active) setPageData({ page: pageIndex, width: viewport.width, height: viewport.height, runs });
        };
        void run().catch(error => {
            if (active) setPageError(pdfError(error, 'تعذّر عرض هذه الصفحة.'));
        });
        return () => { active = false; };
    }, [source, file, pageIndex]);

    useEffect(() => {
        if (!alteredRuns?.length) return;
        let active = true;
        let reader: PDFDocumentProxy | undefined;
        setPreviewError('');
        const run = async () => {
            const bytes = await saveEditorPdf(file.bytes, { ...empty, text: { [pageIndex]: alteredRuns } });
            if (!active) return;
            reader = await openPdf(bytes);
            if (active) setPatchedReader({ page: pageIndex, edits: alteredRuns, reader });
            else await reader.destroy();
        };
        void run().catch(error => {
            if (active) setPreviewError(error instanceof Error ? error.message : 'تعذّر عرض النص بعد التعديل.');
        });
        return () => {
            active = false;
            if (reader) void reader.destroy().catch(() => {});
        };
    }, [alteredRuns, file, pageIndex]);

    useEffect(() => {
        if (!activeReader || !current || !hasViewport) return;
        let active = true;
        const run = async () => {
            const page = await activeReader.getPage(pageIndex + 1);
            if (!active) return;
            const canvas = await renderPdfPage(page, rasterScale);
            try {
                if (active) {
                    setPreview({ page: pageIndex, image: canvas.toDataURL('image/png'), reader: activeReader });
                    setPageError('');
                }
            } finally {
                clearCanvas(canvas);
            }
        };
        void run().catch(error => {
            if (active) setPageError(pdfError(error, 'تعذّر عرض معاينة الصفحة.'));
        });
        return () => { active = false; };
    }, [activeReader, current, pageIndex, rasterScale, hasViewport]);

    function stepZoom(direction: number) {
        const index = zoomSteps.indexOf(zoom === 'page' ? 100 : zoom);
        setZoom(zoomSteps[Math.max(0, Math.min(zoomSteps.length - 1, index + direction))]);
    }

    function apply(update: (previous: EditorChanges) => EditorChanges) {
        setError('');
        setPreviewError('');
        setHistory(previous => {
            const entry = update(previous.entries[previous.position]);
            const entries = [...previous.entries.slice(0, previous.position + 1), entry].slice(-35);
            return { entries, position: entries.length - 1 };
        });
    }

    function goToPage(next: number) {
        if (next === pageIndex) return;
        viewportRef.current?.scrollTo({ top: 0, left: 0 });
        setPageIndex(next);
        setSelection(null);
        setPlaceText(false);
        setError('');
        setPreviewError('');
    }

    function selectText(run: TextRun) {
        const existing = alteredRuns?.find(edit => edit.run.id === run.id);
        setDraft({ text: existing?.text ?? run.text, style: existing?.style ?? run.style });
        setSelection({ kind: 'text', id: run.id });
        setPlaceText(false);
    }

    function selectAddition(item: AddedText) {
        setDraft({ text: item.text, style: item.style });
        setSelection({ kind: 'addition', id: item.id });
        setPlaceText(false);
    }

    function updateText(remove = false) {
        const text = remove ? '' : draft.text.trim();
        if (!Number.isFinite(draft.style.size) || draft.style.size < 1 || draft.style.size > 240) {
            setError('اختَر حجم خط بين 1 و240 نقطة.');
            return;
        }
        if (pickedText) {
            apply(previous => {
                const rest = (previous.text[pageIndex] ?? []).filter(edit => edit.run.id !== pickedText.id);
                return {
                    ...previous,
                    text: { ...previous.text, [pageIndex]: [
                        ...rest, { run: pickedText, text, style: draft.style },
                    ] },
                };
            });
        } else if (pickedAddition) {
            apply(previous => ({
                ...previous,
                addedText: remove ? previous.addedText.filter(item => item.id !== pickedAddition.id)
                    : previous.addedText.map(item => item.id === pickedAddition.id ? { ...item, text, style: draft.style } : item),
            }));
        }
        if (remove) setSelection(null);
    }

    function newText(x: number, y: number) {
        const item = {
            id: crypto.randomUUID(), page: pageIndex, text: '',
            x: Math.min(96, x), y: Math.max(2, y), style: defaultTextStyle,
        };
        apply(previous => ({ ...previous, addedText: [...previous.addedText, item] }));
        selectAddition(item);
    }

    async function addImage(upload: File) {
        setAddingImage(true);
        setError('');
        try {
            const asset = await loadImage(upload);
            const image = { ...asset, id: crypto.randomUUID(), page: pageIndex, x: 50, y: 50, width: 28, angle: 0 };
            apply(previous => ({ ...previous, images: [...previous.images, image] }));
            setSelection({ kind: 'image', id: image.id });
            setPlaceText(false);
        } catch {
            setError('تعذّر فتح الصورة. اختر ملف PNG أو JPG أو WebP سليماً.');
        } finally {
            setAddingImage(false);
        }
    }

    function changeImage(image: EditorImage) {
        apply(previous => ({ ...previous, images: previous.images.map(item => item.id === image.id ? image : item) }));
    }

    function travelHistory(delta: number) {
        setSelection(null);
        setPlaceText(false);
        setError('');
        setPreviewError('');
        setHistory(previous => ({ ...previous, position: Math.min(previous.entries.length - 1, Math.max(0, previous.position + delta)) }));
    }

    const status = error || previewError || (pageError && rendered ? pageError : '')
        || (placeText ? 'اضغط على المكان اللي عايز تبدأ عنده النص.' : '')
        || (scannedOrUnsupported ? 'الصفحة دي مفيهاش نص متاح للتحرير المباشر. تقدر تضيف نص أو صورة.' : '')
        || (previewPending ? 'جاري تحديث الصفحة بعد التعديل…' : '');
    const failed = Boolean(error || previewError || (pageError && rendered));

    return (
        <>
            <header className="relative z-30 shrink-0 border-b border-slate-200 bg-white shadow-sm">
                <div role="toolbar" aria-label="أدوات محرّر PDF" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2.5 py-2 sm:px-4">
                    <EditorIdentity onBack={onBack} />
                    <button type="button" className={markButton} title={file.name} onClick={reset}>اختيار ملف آخر</button>
                    <bdi title={file.name} className="hidden max-w-32 truncate text-xs font-semibold text-slate-500 2xl:block">{file.name}</bdi>

                    <div className="flex flex-wrap items-center gap-1">
                        <button type="button" className={markButton} aria-pressed={placeText} disabled={!current} onClick={() => { setPlaceText(value => !value); setSelection(null); }}>
                            <TypeIcon className="h-4 w-4" /> إضافة نص
                        </button>
                        <button type="button" className={markButton} disabled={!current || addingImage} onClick={() => uploadRef.current?.click()}>
                            <PhotoIcon className="h-4 w-4" /> {addingImage ? 'جاري تجهيز الصورة…' : 'إضافة صورة'}
                        </button>
                        <input
                            ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp"
                            aria-label="تحميل صورة للمحرّر" className="hidden"
                            onChange={event => {
                                const image = event.currentTarget.files?.[0];
                                event.currentTarget.value = '';
                                if (image) void addImage(image);
                            }}
                        />
                        <button type="button" className={markButton} aria-label="تراجع" title="تراجع" disabled={history.position === 0} onClick={() => travelHistory(-1)}><ArrowUturnRightIcon className="h-4 w-4" /></button>
                        <button type="button" className={markButton} aria-label="إعادة" title="إعادة" disabled={history.position >= history.entries.length - 1} onClick={() => travelHistory(1)}><ArrowUturnLeftIcon className="h-4 w-4" /></button>
                    </div>

                    <div role="group" aria-label="التنقّل بين الصفحات" className="flex shrink-0 items-center gap-1">
                        <button type="button" className={markButton} aria-label="الصفحة السابقة" title="الصفحة السابقة" disabled={pageIndex === 0 || addingImage} onClick={() => goToPage(pageIndex - 1)}><ChevronRightIcon className="h-4 w-4" /></button>
                        <select aria-label="رقم الصفحة" className={markButton} disabled={addingImage} value={pageIndex} onChange={event => goToPage(Number(event.currentTarget.value))}>
                            {Array.from({ length: totalPages }, (_, index) => <option key={index} value={index}>{index + 1} / {totalPages}</option>)}
                        </select>
                        <button type="button" className={markButton} aria-label="الصفحة التالية" title="الصفحة التالية" disabled={pageIndex === totalPages - 1 || addingImage} onClick={() => goToPage(pageIndex + 1)}><ChevronLeftIcon className="h-4 w-4" /></button>
                    </div>

                    <div role="group" aria-label="تكبير وتصغير المعاينة" className="flex shrink-0 items-center gap-1">
                        <button type="button" className={markButton} aria-label="تصغير المعاينة" title="تصغير المعاينة" disabled={zoom === zoomSteps[0]} onClick={() => stepZoom(-1)}>−</button>
                        <select aria-label="تكبير عرض الصفحة" className={markButton} value={zoom} onChange={event => setZoom(event.currentTarget.value === 'page' ? 'page' : Number(event.currentTarget.value))}>
                            <option value="page">الصفحة كاملة</option>
                            {zoomSteps.map(value => <option key={value} value={value}>{value === 100 ? 'ملاءمة العرض' : `${value}%`}</option>)}
                        </select>
                        <button type="button" className={markButton} aria-label="تكبير المعاينة" title="تكبير المعاينة" disabled={zoom === zoomSteps.at(-1)} onClick={() => stepZoom(1)}>+</button>
                    </div>

                    {onFullscreen && <button type="button" className={markButton} aria-pressed={fullscreen} onClick={onFullscreen}>{fullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}</button>}
                    <div className="ms-auto shrink-0">
                        <PdfDownload compact disabled={!hasChanges || previewPending || Boolean(previewError)} filename={outputFilename(file, 'edited')} save={() => saveEditorPdf(file.bytes, changes)} />
                    </div>
                </div>

                {(pickedText || pickedAddition) && (
                    <div aria-label="إعدادات التعديل" className="relative flex flex-wrap items-center gap-1.5 border-t border-blue-100 bg-blue-50/65 px-2.5 py-1.5 sm:px-4">
                        <textarea
                            aria-label={pickedText ? 'نص الملف' : 'النص المضاف'}
                            className="min-w-36 flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                            dir="auto" rows={1} maxLength={500} value={draft.text}
                            onChange={event => setDraft({ ...draft, text: event.currentTarget.value })}
                        />
                        <details>
                            <summary className={`${markButton} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>تنسيق</summary>
                            <div className="absolute end-2.5 top-full z-40 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:end-4">
                                <FormatControls style={draft.style} canColor={pickedText?.canColor ?? true} canItalic={!/[\u0600-\u08ff]/.test(draft.text)} onChange={style => setDraft({ ...draft, style })} />
                            </div>
                        </details>
                        <button type="button" className="shrink-0 whitespace-nowrap rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800" onClick={() => updateText()}>تطبيق التعديل</button>
                        <button type="button" className={markButton} onClick={() => updateText(true)}>حذف النص</button>
                    </div>
                )}

                {pickedImage && (
                    <div aria-label="إعدادات الصورة" className="flex flex-wrap items-center gap-2 border-t border-blue-100 bg-blue-50/65 px-2.5 py-1.5 sm:px-4">
                        <label className="flex min-w-36 flex-1 items-center gap-2 whitespace-nowrap text-xs font-bold text-slate-700">
                            الحجم {Math.round(pickedImage.width)}٪
                            <input type="range" dir="ltr" min="2" max="180" step="0.1" className="min-w-0 max-w-48 flex-1 accent-blue-600" value={pickedImage.width} onChange={event => changeImage({ ...pickedImage, width: Number(event.currentTarget.value) })} />
                        </label>
                        <label className="flex min-w-36 flex-1 items-center gap-2 whitespace-nowrap text-xs font-bold text-slate-700">
                            التدوير {Math.round(pickedImage.angle)}°
                            <input type="range" dir="ltr" min="-180" max="180" step="0.1" className="min-w-0 max-w-48 flex-1 accent-blue-600" value={pickedImage.angle} onChange={event => changeImage({ ...pickedImage, angle: Number(event.currentTarget.value) })} />
                        </label>
                        <button type="button" className={markButton} onClick={() => {
                            const duplicate = { ...pickedImage, id: crypto.randomUUID(), x: Math.min(96, pickedImage.x + 6), y: Math.min(96, pickedImage.y + 6) };
                            apply(previous => ({ ...previous, images: [...previous.images, duplicate] }));
                            setSelection({ kind: 'image', id: duplicate.id });
                        }}>تكرار الصورة</button>
                        <button type="button" className={markButton} onClick={() => {
                            apply(previous => ({ ...previous, images: previous.images.filter(item => item.id !== pickedImage.id) }));
                            setSelection(null);
                        }}>حذف الصورة</button>
                    </div>
                )}

                {status && <p role={failed ? 'alert' : 'status'} className={`border-t px-3 py-1.5 text-xs font-semibold ${failed ? 'border-red-100 bg-red-50 text-red-700' : 'border-slate-100 bg-slate-50 text-slate-700'}`}>{status}</p>}
            </header>

            <main
                ref={viewportRef}
                aria-label="مساحة عرض المستند"
                className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-slate-200/85 px-2 py-2 sm:px-4 sm:py-3"
                dir="ltr"
                style={{ scrollbarGutter: 'stable' }}
            >
                    {current && rendered ? (
                        <div style={{ width: pageWidth || '100%' }} className="mx-auto">
                            <div
                                data-editor-stage=""
                                aria-label={`صفحة PDF رقم ${pageIndex + 1}`}
                                className={`relative mx-auto overflow-hidden bg-white shadow-sm ${placeText ? 'cursor-crosshair' : ''}`}
                                dir="ltr"
                                style={{ aspectRatio: current.width / current.height }}
                                onClick={event => {
                                    if (!placeText) return;
                                    const bounds = event.currentTarget.getBoundingClientRect();
                                    newText((event.clientX - bounds.left) * 100 / bounds.width, (event.clientY - bounds.top) * 100 / bounds.height);
                                }}
                            >
                                <img src={rendered} alt={`معاينة تحرير صفحة ${pageIndex + 1}`} className="pointer-events-none absolute inset-0 h-full w-full select-none" draggable={false} />
                                {!placeText && current.runs.map(run => {
                                    const edit = alteredRuns?.find(item => item.run.id === run.id);
                                    if (edit?.text === '') return null;
                                    const selected = pickedText?.id === run.id;
                                    return (
                                        <button
                                            key={run.id}
                                            type="button"
                                            aria-label={`تحرير النص ${edit?.text ?? run.text}`}
                                            className={`absolute z-[1] origin-top-left rounded-sm outline-none hover:bg-blue-500/15 hover:ring-1 hover:ring-blue-500 focus-visible:ring-2 focus-visible:ring-blue-600 ${selected ? 'bg-blue-500/10 ring-1 ring-blue-500' : ''}`}
                                            style={{
                                                left: `${run.left / current.width * 100}%`, top: `${run.top / current.height * 100}%`,
                                                width: `${run.width / current.width * 100}%`, height: `${run.height / current.height * 100}%`,
                                                transform: `rotate(${run.angle}rad)`,
                                            }}
                                            onClick={() => selectText(run)}
                                        />
                                    );
                                })}
                                {changes.addedText.filter(item => item.page === pageIndex).map(item => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        dir="auto"
                                        className="absolute z-[2] max-w-full -translate-y-[82%] whitespace-nowrap border border-dashed border-blue-400 bg-white/10 text-start font-normal"
                                        style={{
                                            left: `${item.x}%`, top: `${item.y}%`,
                                            fontSize: `${Math.max(3, item.style.size * pageWidth / current.width)}px`,
                                            color: item.style.color ?? '#0f172a', fontWeight: item.style.bold ? 'bold' : 'normal', fontStyle: item.style.italic ? 'italic' : 'normal',
                                        }}
                                        onClick={event => { event.stopPropagation(); selectAddition(item); }}
                                        aria-label={item.text ? `تعديل النص المضاف ${item.text}` : 'النص المضاف'}
                                    >{item.text || '+'}</button>
                                ))}
                                {changes.images.filter(item => item.page === pageIndex).map(item => (
                                    <div key={item.id} className="contents">
                                        <EditorImageLayer
                                            image={item}
                                            selected={pickedImage?.id === item.id}
                                            pageRatio={current.width / current.height}
                                            onSelect={() => { setSelection({ kind: 'image', id: item.id }); setPlaceText(false); }}
                                            onChange={changeImage}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : <p dir="rtl" role="status" className="py-12 text-center text-sm text-slate-700">{pageError || 'جاري فتح الصفحة وتحليل النص الأصلي…'}</p>}
            </main>
        </>
    );
}

export default function PdfEditor(controls: EditorViewControls) {
    return (
        <PdfWorkspace emptyHeader={<header className="border-b border-slate-200 bg-white px-3 py-2"><EditorIdentity onBack={controls.onBack} /></header>}>
            {(file, reset) => <EditorWorkspace file={file} reset={reset} {...controls} />}
        </PdfWorkspace>
    );
}
