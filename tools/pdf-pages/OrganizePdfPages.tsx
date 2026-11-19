import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '../../components/icons';
import { editPageOrder, type PageOperation } from './pdfOperations';
import PdfPagePreview from './PdfPagePreview';
import { PdfDownload, PdfWorkspace, outputFilename, secondaryButton, type OpenPdf } from './PdfWorkspace';

const descriptions: Record<PageOperation, string> = {
    delete: 'حدّد الصفحات التي تريد حذفها. يجب أن تبقى صفحة واحدة على الأقل.',
    extract: 'حدّد الصفحات التي تريد جمعها في ملف PDF واحد بترتيبها الأصلي.',
    reorder: 'حرّك الصفحات لأعلى أو لأسفل لتغيير ترتيبها.',
};

function OrganizePages({ file, operation }: { file: OpenPdf; operation: PageOperation }) {
    const originalOrder = file.document.getPageIndices();
    const [order, setOrder] = useState(originalOrder);
    const [selected, setSelected] = useState(() => new Set<number>());
    const [preview, setPreview] = useState(0);
    const isReordering = operation === 'reorder';
    const output = isReordering ? order : originalOrder.filter(index => selected.has(index) === (operation === 'extract'));
    const canDownload = isReordering
        ? order.some((index, position) => index !== position)
        : selected.size > 0 && output.length > 0;

    function toggle(index: number, checked: boolean) {
        setSelected(current => {
            const next = new Set(current);
            if (checked) next.add(index);
            else next.delete(index);
            return next;
        });
        setPreview(index);
    }

    function move(position: number, offset: number) {
        const next = [...order];
        const index = next[position];
        next[position] = next[position + offset];
        next[position + offset] = index;
        setOrder(next);
        setPreview(index);
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-700">{descriptions[operation]}</p>
            <div className="grid items-start gap-4 md:grid-cols-2">
                <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {isReordering ? (
                            <>
                                <button type="button" className={secondaryButton} disabled={order.length < 2} onClick={() => setOrder([...order].reverse())}>عكس الترتيب</button>
                                <button type="button" className={secondaryButton} disabled={!canDownload} onClick={() => setOrder(originalOrder)}>استعادة الترتيب</button>
                            </>
                        ) : (
                            <>
                                {operation === 'extract' && (
                                    <button type="button" className={secondaryButton} disabled={selected.size === order.length} onClick={() => setSelected(new Set(order))}>تحديد الكل</button>
                                )}
                                <button type="button" className={secondaryButton} disabled={!selected.size} onClick={() => setSelected(new Set())}>إلغاء التحديد</button>
                            </>
                        )}
                    </div>
                    <ol aria-label="صفحات المستند" className="max-h-96 space-y-2 overflow-auto rounded-2xl border border-slate-200 p-2">
                        {order.map((index, position) => (
                            <li key={index} className={`flex flex-wrap items-center gap-2 rounded-lg p-2 ${preview === index ? 'bg-blue-50' : 'bg-slate-50'}`}>
                                {isReordering ? (
                                    <span className="shrink-0 text-xs font-bold text-slate-500" aria-label={`الموضع ${position + 1}`}>{position + 1}.</span>
                                ) : (
                                    <input
                                        type="checkbox"
                                        aria-label={`تحديد الصفحة ${index + 1}`}
                                        checked={selected.has(index)}
                                        onChange={event => toggle(index, event.currentTarget.checked)}
                                        className="h-5 w-5 shrink-0 accent-blue-600"
                                    />
                                )}
                                <button
                                    type="button"
                                    aria-pressed={preview === index}
                                    aria-label={`معاينة الصفحة ${index + 1}`}
                                    className="min-w-0 flex-1 rounded px-1 py-1 text-start text-sm font-bold text-blue-800 hover:underline"
                                    onClick={() => setPreview(index)}
                                >
                                    صفحة {index + 1}
                                </button>
                                {isReordering && (
                                    <div className="flex shrink-0 gap-1">
                                        <button type="button" className={secondaryButton} aria-label={`تحريك الصفحة ${index + 1} لأعلى`} disabled={position === 0} onClick={() => move(position, -1)}>
                                            <ChevronUpIcon className="h-4 w-4" />
                                        </button>
                                        <button type="button" className={secondaryButton} aria-label={`تحريك الصفحة ${index + 1} لأسفل`} disabled={position === order.length - 1} onClick={() => move(position, 1)}>
                                            <ChevronDownIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ol>
                    {!isReordering && (
                        <p role="status" className={`text-sm ${output.length === 0 && selected.size > 0 ? 'text-red-700' : 'text-slate-700'}`}>
                            الصفحات المحدّدة {selected.size} · الصفحات في الملف الناتج {output.length}
                        </p>
                    )}
                </div>
                <PdfPagePreview bytes={file.bytes} pageNumber={preview + 1} />
            </div>
            <PdfDownload
                disabled={!canDownload}
                filename={outputFilename(file, { delete: 'pages-removed', extract: 'pages-extracted', reorder: 'pages-reordered' }[operation])}
                save={() => editPageOrder(file.bytes, operation, output)}
            />
        </div>
    );
}

function OrganizePdfPages({ operation }: { operation: PageOperation }) {
    return <PdfWorkspace>{file => <OrganizePages file={file} operation={operation} />}</PdfWorkspace>;
}

export function DeletePdfPages() {
    return <OrganizePdfPages operation="delete" />;
}

export function ExtractPdfPages() {
    return <OrganizePdfPages operation="extract" />;
}

export function ReorderPdfPages() {
    return <OrganizePdfPages operation="reorder" />;
}
