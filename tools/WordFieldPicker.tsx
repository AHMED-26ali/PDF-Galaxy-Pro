import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { PositionedWordDraft } from './positionedWord';

type DraftPage = PositionedWordDraft['pages'][number];
type DraftField = DraftPage['fields'][number];
type Point = { x: number; y: number };
type Box = DraftField['box'];

function rectangle(start: Point, end: Point): Box {
    return { x0: Math.min(start.x, end.x), y0: Math.min(start.y, end.y), x1: Math.max(start.x, end.x), y1: Math.max(start.y, end.y) };
}

function PagePicker({ page, onAdd }: { page: DraftPage; onAdd: (page: number, field: Omit<DraftField, 'id'>) => void }) {
    const [image, setImage] = useState('');
    const [armed, setArmed] = useState(false);
    const [zoom, setZoom] = useState(100);
    const [selection, setSelection] = useState<Box | null>(null);
    const [value, setValue] = useState('');
    const start = useRef<Point | null>(null);
    const preview = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const url = URL.createObjectURL(page.image);
        setImage(url);
        return () => URL.revokeObjectURL(url);
    }, [page.image]);

    function point(event: PointerEvent<HTMLDivElement>): Point {
        const bounds = event.currentTarget.getBoundingClientRect();
        return {
            x: Math.round(Math.max(4, Math.min(page.width - 5, ((event.clientX - bounds.left) / bounds.width) * page.width))),
            y: Math.round(Math.max(4, Math.min(page.height - 5, ((event.clientY - bounds.top) / bounds.height) * page.height))),
        };
    }

    function add() {
        if (!selection || !value.trim() || !preview.current?.naturalWidth) return;
        const { x0, x1, y0, y1 } = selection;
        const sample = document.createElement('canvas');
        const width = x1 - x0, height = y1 - y0;
        const scale = Math.min(1, 550 / width);
        sample.width = Math.max(1, Math.round(width * scale));
        sample.height = Math.max(1, Math.round(height * scale));
        sample.getContext('2d')?.drawImage(preview.current, x0, y0, width, height, 0, 0, sample.width, sample.height);
        onAdd(page.number, { box: selection, text: value.trim(), manual: true, preview: sample.toDataURL('image/jpeg', 0.82) });
        setValue('');
        setSelection(null);
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" aria-pressed={armed} onClick={() => {
                    setArmed(!armed);
                    setSelection(null);
                    start.current = null;
                }} className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-bold text-white">
                    {armed ? 'إلغاء التحديد' : 'تحديد سطر'}
                </button>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                    تكبير الصفحة
                    <select value={zoom} onChange={event => setZoom(Number(event.currentTarget.value))}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1">
                        {[100, 150, 200].map(level => <option key={level} value={level}>{level}%</option>)}
                    </select>
                </label>
            </div>
            <p className="text-sm text-slate-600">كبّر الصفحة أو حرّكها، ثم اضغط «تحديد سطر» واسحب حول السطر المطبوع.</p>
            <div dir="ltr" className="max-h-[60vh] overflow-auto rounded-xl border border-slate-300 bg-slate-100">
                <div className={`relative select-none ${armed ? 'touch-none cursor-crosshair' : ''}`} style={{ width: `${zoom}%` }}
                    onPointerDown={event => {
                        if (!armed || event.button !== 0) return;
                        start.current = point(event);
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setSelection(rectangle(start.current, start.current));
                    }}
                    onPointerMove={event => { if (start.current) setSelection(rectangle(start.current, point(event))); }}
                    onPointerUp={event => {
                        if (!start.current) return;
                        const box = rectangle(start.current, point(event));
                        start.current = null;
                        if (box.x1 - box.x0 < 8 || box.y1 - box.y0 < 7) { setSelection(null); return; }
                        setSelection(box);
                        setArmed(false);
                    }}
                    onPointerCancel={() => { start.current = null; setSelection(null); }}>
                    {image && <img ref={preview} src={image} alt={`صفحة PDF الأصلية ${page.number}`}
                        draggable={false} className="block h-auto w-full max-w-none" />}
                    {selection && <div aria-hidden="true" className="pointer-events-none absolute border-2 border-blue-600 bg-blue-500/20"
                        style={{
                            left: `${selection.x0 * 100 / page.width}%`, top: `${selection.y0 * 100 / page.height}%`,
                            width: `${(selection.x1 - selection.x0) * 100 / page.width}%`,
                            height: `${(selection.y1 - selection.y0) * 100 / page.height}%`,
                        }} />}
                </div>
            </div>
            {selection && !armed && (
                <div className="flex flex-wrap gap-2">
                    <input dir="auto" aria-label="نص الحقل الجديد" placeholder="اكتب النص في الموضع المحدد" value={value} onChange={event => setValue(event.currentTarget.value)}
                        onKeyDown={event => { if (event.key === 'Enter') add(); }}
                        className="min-w-32 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <button type="button" disabled={!value.trim()} onClick={add} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">إضافة الحقل</button>
                </div>
            )}
        </div>
    );
}

export default function WordFieldPicker({ pages, onAdd }: { pages: DraftPage[]; onAdd: (page: number, field: Omit<DraftField, 'id'>) => void }) {
    const [pageIndex, setPageIndex] = useState(0);
    const page = pages[pageIndex];
    if (!page) return null;
    return (
        <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-3">
            {pages.length > 1 && <select aria-label="صفحة الحقل الجديد" value={pageIndex} onChange={event => setPageIndex(Number(event.currentTarget.value))}
                className="rounded-lg border border-slate-300 bg-white p-2 text-sm">
                {pages.map((page, index) => <option key={page.number} value={index}>صفحة {page.number}</option>)}
            </select>}
            <div key={page.number}>
                <PagePicker page={page} onAdd={onAdd} />
            </div>
        </div>
    );
}
