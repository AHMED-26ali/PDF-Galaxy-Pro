import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUturnLeftIcon, ArrowUturnRightIcon, PhotoIcon, TypeIcon } from '../../components/icons';
import { PdfDownload, PdfWorkspace, secondaryButton, field, outputFilename, type OpenPdf } from '../pdf-pages/PdfWorkspace';
import { clearCanvas, pdfError, renderPdfPage, withPdf } from '../pdfRuntime';
import { prepareEditor, readNativeRuns, type FontFamily, type TextRun, type TextStyle } from './nativeText';
import { loadImage, saveEditorPdf, type AddedText, type EditorChanges, type EditorImage } from './editorDocument';
import EditorImageLayer from './EditorImageLayer';

const empty: EditorChanges = { text: {}, images: [], addedText: [] };
const defaultTextStyle: TextStyle = { family: 'sans', size: 18, color: '#0f172a', bold: false, italic: false };
type Selection = { kind: 'text'; id: number } | { kind: 'addition' | 'image'; id: string };

const markButton = 'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40';

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
                <select className={field} value={style.family} onChange={event => onChange({ ...style, family: event.currentTarget.value as FontFamily })}>
                    <option value="auto">حسب النص الأصلي</option>
                    <option value="sans">بسيط</option>
                    <option value="serif">كلاسيكي</option>
                    <option value="mono">ثابت العرض</option>
                </select>
            </Field>
            <Field label="حجم الخط">
                <input type="number" min="1" max="240" step="any" className={field} value={style.size || ''} onChange={event => onChange({ ...style, size: Number(event.currentTarget.value) })} />
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

function EditorWorkspace({ file }: { file: OpenPdf }) {
    const [source, setSource] = useState<Awaited<ReturnType<typeof prepareEditor>> | null>(null);
    const [pageIndex, setPageIndex] = useState(0);
    const [pageData, setPageData] = useState<{ page: number; width: number; height: number; runs: TextRun[]; image: string } | null>(null);
    const [patchedPreview, setPatchedPreview] = useState<{ page: number; image: string; text: EditorChanges['text'] } | null>(null);
    const [history, setHistory] = useState({ entries: [empty], position: 0 });
    const [selection, setSelection] = useState<Selection | null>(null);
    const [draft, setDraft] = useState<{ text: string; style: TextStyle }>({ text: '', style: defaultTextStyle });
    const [zoom, setZoom] = useState(100);
    const [placeText, setPlaceText] = useState(false);
    const [addingImage, setAddingImage] = useState(false);
    const [error, setError] = useState('');
    const [pageError, setPageError] = useState('');
    const [previewError, setPreviewError] = useState('');
    const uploadRef = useRef<HTMLInputElement>(null);
    const editPanel = useRef<HTMLElement>(null);
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
    const previewPending = Boolean(alteredRuns?.length && (patchedPreview?.text !== changes.text || patchedPreview.page !== pageIndex) && !previewError);

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
            const [runs, canvas] = await Promise.all([
                readNativeRuns(page, file.document.getPage(pageIndex), source.targets[pageIndex] ?? []),
                renderPdfPage(page, 1.75, 1120),
            ]);
            try {
                if (active) setPageData({ page: pageIndex, width: viewport.width, height: viewport.height, runs, image: canvas.toDataURL('image/png') });
            } finally {
                clearCanvas(canvas);
            }
        };
        void run().catch(error => {
            if (active) setPageError(pdfError(error, 'تعذّر عرض هذه الصفحة.'));
        });
        return () => { active = false; };
    }, [source, file, pageIndex]);

    useEffect(() => {
        if (!alteredRuns?.length) return;
        let active = true;
        setPreviewError('');
        const run = async () => {
            const bytes = await saveEditorPdf(file.bytes, { ...empty, text: { [pageIndex]: alteredRuns } });
            await withPdf(bytes, async pdf => {
                const canvas = await renderPdfPage(await pdf.getPage(pageIndex + 1), 1.75, 1120);
                try {
                    if (active) setPatchedPreview({ page: pageIndex, image: canvas.toDataURL('image/png'), text: changes.text });
                } finally {
                    clearCanvas(canvas);
                }
            });
        };
        void run().catch(error => {
            if (active) setPreviewError(error instanceof Error ? error.message : 'تعذّر عرض النص بعد التعديل.');
        });
        return () => { active = false; };
    }, [alteredRuns, changes.text, file, pageIndex]);

    useEffect(() => {
        if (selection && selection.kind !== 'image' && window.matchMedia('(max-width: 1023px)').matches) {
            editPanel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [selection]);

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

    const rendered = patchedPreview?.page === pageIndex && patchedPreview.text === changes.text && alteredRuns?.length
        ? patchedPreview.image : current?.image;
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
                <button type="button" className={markButton} aria-pressed={placeText} disabled={!current} onClick={() => { setPlaceText(value => !value); setSelection(null); }}>
                    <TypeIcon className="h-4 w-4" /> إضافة نص
                </button>
                <button type="button" className={markButton} disabled={!current || addingImage} onClick={() => uploadRef.current?.click()}>
                    <PhotoIcon className="h-4 w-4" /> {addingImage ? 'جاري تجهيز الصورة…' : 'إضافة صورة'}
                </button>
                <input
                    ref={uploadRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="تحميل صورة للمحرّر"
                    className="hidden"
                    onChange={event => {
                        const image = event.currentTarget.files?.[0];
                        event.currentTarget.value = '';
                        if (image) void addImage(image);
                    }}
                />
                <button type="button" className={markButton} disabled={history.position === 0} onClick={() => travelHistory(-1)}><ArrowUturnRightIcon className="h-4 w-4" /> تراجع</button>
                <button type="button" className={markButton} disabled={history.position >= history.entries.length - 1} onClick={() => travelHistory(1)}><ArrowUturnLeftIcon className="h-4 w-4" /> إعادة</button>
                <label className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-700">
                    الصفحة
                    <select aria-label="رقم الصفحة" className="rounded-lg border border-slate-200 bg-white px-2 py-2" disabled={addingImage} value={pageIndex} onChange={event => goToPage(Number(event.currentTarget.value))}>
                        {Array.from({ length: totalPages }, (_, index) => <option key={index} value={index}>{index + 1} / {totalPages}</option>)}
                    </select>
                </label>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    العرض
                    <select aria-label="تكبير عرض الصفحة" className="rounded-lg border border-slate-200 bg-white px-2 py-2" value={zoom} onChange={event => setZoom(Number(event.currentTarget.value))}>
                        {[100, 125, 150, 200].map(value => <option key={value} value={value}>{value}%</option>)}
                    </select>
                </label>
            </div>
            {placeText && <p role="status" className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">اضغط على المكان اللي عايز تبدأ عنده النص.</p>}
            {scannedOrUnsupported && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">الصفحة دي مفيهاش نص متاح للتحرير المباشر. تقدر تضيف نص أو صورة. لو الصفحة ممسوحة، جرّب أداة OCR لاستخراج النص.</p>}
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_270px]">
                <div className="min-w-0 overflow-auto rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-4">
                    {current && rendered ? (
                        <div style={{ width: `${zoom}%` }} className="mx-auto">
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
                                            fontSize: `clamp(8px, ${item.style.size / current.width * zoom * 0.52}vw, ${item.style.size}px)`,
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
                    ) : <p role="status" className="py-12 text-center text-sm text-slate-700">{pageError || 'جاري فتح الصفحة وتحليل النص الأصلي…'}</p>}
                    {previewPending && <p role="status" className="mt-2 text-sm text-blue-800">جاري تحديث الصفحة بعد التعديل…</p>}
                </div>

                <aside ref={editPanel} aria-label="إعدادات التعديل" className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                    {pickedText || pickedAddition ? (
                        <>
                            <Field label={pickedText ? 'نص الملف' : 'النص المضاف'}>
                                <textarea className={field} dir="auto" rows={3} maxLength={500} value={draft.text} onChange={event => setDraft({ ...draft, text: event.currentTarget.value })} />
                            </Field>
                            <FormatControls style={draft.style} canColor={pickedText?.canColor ?? true} canItalic={!/[\u0600-\u08ff]/.test(draft.text)} onChange={style => setDraft({ ...draft, style })} />
                            <button type="button" className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700" onClick={() => updateText()}>تطبيق التعديل</button>
                            <button type="button" className={secondaryButton} onClick={() => updateText(true)}>حذف النص</button>
                        </>
                    ) : pickedImage ? (
                        <>
                            <h2 className="text-base font-bold text-slate-900">الصورة المضافة</h2>
                            <p className="text-sm text-slate-600">اسحب الصورة لتحريكها، واستخدم المقبضين للتدوير وتغيير الحجم.</p>
                            <Field label={`الحجم (${Math.round(pickedImage.width)}٪)`}>
                                <input type="range" dir="ltr" min="2" max="180" step="0.1" className="w-full accent-blue-600" value={pickedImage.width} onChange={event => changeImage({ ...pickedImage, width: Number(event.currentTarget.value) })} />
                            </Field>
                            <Field label={`التدوير (${Math.round(pickedImage.angle)}°)`}>
                                <input type="range" dir="ltr" min="-180" max="180" step="0.1" className="w-full accent-blue-600" value={pickedImage.angle} onChange={event => changeImage({ ...pickedImage, angle: Number(event.currentTarget.value) })} />
                            </Field>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className={secondaryButton} onClick={() => {
                                    const duplicate = { ...pickedImage, id: crypto.randomUUID(), x: Math.min(96, pickedImage.x + 6), y: Math.min(96, pickedImage.y + 6) };
                                    apply(previous => ({ ...previous, images: [...previous.images, duplicate] }));
                                    setSelection({ kind: 'image', id: duplicate.id });
                                }}>تكرار الصورة</button>
                                <button type="button" className={secondaryButton} onClick={() => {
                                    apply(previous => ({ ...previous, images: previous.images.filter(item => item.id !== pickedImage.id) }));
                                    setSelection(null);
                                }}>حذف الصورة</button>
                            </div>
                        </>
                    ) : (
                        <p className="text-sm leading-relaxed text-slate-700">اضغط على نص موجود في الصفحة لتعديله، أو أضف نصاً أو صورة من الشريط.</p>
                    )}
                </aside>
            </div>
            {(error || previewError) && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error || previewError}</p>}
            <div className="flex flex-wrap items-center gap-3">
                <PdfDownload disabled={!hasChanges || previewPending || Boolean(previewError)} filename={outputFilename(file, 'edited')} save={() => saveEditorPdf(file.bytes, changes)} />
            </div>
        </div>
    );
}

export default function PdfEditor() {
    return <PdfWorkspace>{file => <EditorWorkspace file={file} />}</PdfWorkspace>;
}
