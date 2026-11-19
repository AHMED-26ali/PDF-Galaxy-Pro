import { useEffect, useState } from 'react';
import PdfPagePreview from './PdfPagePreview';
import { cropPage, getSignatureRectangle, getVisiblePage, type Edges } from './pdfOperations';
import { PdfDownload, PdfWorkspace, field, outputFilename, type OpenPdf } from './PdfWorkspace';

const edgeKeys = ['top', 'right', 'bottom', 'left'] as const;
const initialEdges: Edges = { top: 0, right: 0, bottom: 0, left: 0 };
const edgeLabels: Record<keyof Edges, string> = {
    top: 'أعلى',
    right: 'يمين',
    bottom: 'أسفل',
    left: 'يسار',
};

function PagePicker({ count, selected, onChange }: {
    count: number;
    selected: number;
    onChange: (page: number) => void;
}) {
    return (
        <label className="block space-y-1 text-sm font-bold text-slate-800">
            <span>رقم الصفحة</span>
            <select className={field} value={selected} onChange={event => onChange(Number(event.currentTarget.value))}>
                {Array.from({ length: count }, (_, index) => (
                    <option key={index} value={index}>صفحة {index + 1}</option>
                ))}
            </select>
        </label>
    );
}

function CropPageEditor({ file }: { file: OpenPdf }) {
    const [pageIndex, setPageIndex] = useState(0);
    const [applyToAll, setApplyToAll] = useState(false);
    const [edges, setEdges] = useState<Edges>(initialEdges);
    const pageCount = file.document.getPageCount();
    const valid = edges.top + edges.bottom < 100 && edges.left + edges.right < 100;
    const changed = edgeKeys.some(edge => edges[edge] > 0);

    async function save() {
        const { PDFDocument } = await import('pdf-lib');
        const pdf = await PDFDocument.load(file.bytes, { updateMetadata: false });
        const pages = applyToAll ? pdf.getPages() : [pdf.getPage(pageIndex)];
        for (const page of pages) cropPage(page, edges);
        return pdf.save();
    }

    return (
        <div className="space-y-4">
            <div className="grid items-start gap-4 md:grid-cols-2">
                <div className="space-y-4">
                    <PagePicker count={pageCount} selected={pageIndex} onChange={setPageIndex} />
                    <fieldset className="grid grid-cols-2 gap-3">
                        <legend className="mb-2 text-sm font-bold text-slate-800">الهامش المطلوب قصّه من كل جهة (%)</legend>
                        {edgeKeys.map(edge => (
                            <label key={edge} className="space-y-1 text-sm font-bold text-slate-700">
                                <span>{edgeLabels[edge]}</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={99}
                                    value={edges[edge]}
                                    className={field}
                                    onChange={event => {
                                        const value = Math.min(99, Math.max(0, Number(event.currentTarget.value) || 0));
                                        setEdges(current => ({ ...current, [edge]: value }));
                                    }}
                                />
                            </label>
                        ))}
                    </fieldset>
                    {pageCount > 1 && (
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                            <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={applyToAll} onChange={event => setApplyToAll(event.currentTarget.checked)} />
                            تطبيق نفس النسب على جميع الصفحات
                        </label>
                    )}
                    {!valid && <p role="alert" className="text-sm font-bold text-red-700">مجموع الهامشين المتقابلين لازم يكون أقل من 100٪.</p>}
                    <p className="text-sm text-slate-600">القص يغيّر حدود العرض والطباعة. محتوى الهوامش يظل داخل الملف.</p>
                </div>
                <PdfPagePreview bytes={file.bytes} pageNumber={pageIndex + 1}>
                    {valid && changed && (
                        <div
                            aria-hidden
                            className="pointer-events-none absolute border-2 border-blue-500"
                            style={{
                                top: `${edges.top}%`, right: `${edges.right}%`, bottom: `${edges.bottom}%`, left: `${edges.left}%`,
                                boxShadow: '0 0 0 100vmax rgb(15 23 42 / 0.55)',
                            }}
                        />
                    )}
                </PdfPagePreview>
            </div>
            <PdfDownload disabled={!valid || !changed} filename={outputFilename(file, 'cropped')} save={save} />
        </div>
    );
}

type SignatureImage = {
    bytes: Uint8Array<ArrayBuffer>;
    format: 'png' | 'jpeg';
    aspectRatio: number;
};

function SignaturePageEditor({ file }: { file: OpenPdf }) {
    const [pageIndex, setPageIndex] = useState(0);
    const [signature, setSignature] = useState<SignatureImage | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [scale, setScale] = useState(25);
    const [horizontal, setHorizontal] = useState(90);
    const [vertical, setVertical] = useState(90);
    const page = getVisiblePage(file.document.getPage(pageIndex));
    const rect = signature && getSignatureRectangle(page, signature.aspectRatio, scale, horizontal, vertical);

    const [signatureUrl, setSignatureUrl] = useState('');
    useEffect(() => {
        if (!signature) {
            setSignatureUrl('');
            return;
        }
        const url = URL.createObjectURL(new Blob([signature.bytes], { type: `image/${signature.format}` }));
        setSignatureUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [signature]);

    async function loadSignature(upload: File) {
        setSignature(null);
        setError('');
        setLoading(true);
        try {
            const [{ PDFDocument }, buffer] = await Promise.all([import('pdf-lib'), upload.arrayBuffer()]);
            const bytes = new Uint8Array(buffer);
            const format = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'png' : 'jpeg';
            const scratch = await PDFDocument.create();
            const image = format === 'png' ? await scratch.embedPng(bytes) : await scratch.embedJpg(bytes);
            const aspectRatio = image.width / image.height;
            if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) throw new Error('Invalid image dimensions');
            setSignature({ bytes, format, aspectRatio });
        } catch {
            setError('تعذّر فتح الصورة. اختر صورة PNG أو JPG سليمة.');
        } finally {
            setLoading(false);
        }
    }

    async function save() {
        if (!signature || !rect) throw new Error('Missing signature');
        const { PDFDocument, degrees } = await import('pdf-lib');
        const pdf = await PDFDocument.load(file.bytes, { updateMetadata: false });
        const targetPage = pdf.getPage(pageIndex);
        const image = signature.format === 'png' ? await pdf.embedPng(signature.bytes) : await pdf.embedJpg(signature.bytes);
        const origin = page.toPdfPoint(rect.x, rect.y + rect.height);
        targetPage.drawImage(image, {
            ...origin,
            width: rect.width,
            height: rect.height,
            rotate: degrees(page.rotation),
        });
        return pdf.save();
    }

    const sliders = [
        { title: 'حجم التوقيع', min: 5, max: 100, value: scale, change: setScale },
        { title: 'الموضع من اليسار', min: 0, max: 100, value: horizontal, change: setHorizontal },
        { title: 'الموضع من الأعلى', min: 0, max: 100, value: vertical, change: setVertical },
    ];

    return (
        <div className="space-y-4">
            <div className="grid items-start gap-4 md:grid-cols-2">
                <div className="space-y-4">
                    <PagePicker count={file.document.getPageCount()} selected={pageIndex} onChange={setPageIndex} />
                    <label className="block space-y-1 text-sm font-bold text-slate-800">
                        <span>صورة التوقيع (PNG أو JPG)</span>
                        <input
                            type="file"
                            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                            className={field}
                            disabled={loading}
                            onChange={event => {
                                const upload = event.currentTarget.files?.[0];
                                event.currentTarget.value = '';
                                if (upload) void loadSignature(upload);
                            }}
                        />
                    </label>
                    {loading && <p role="status" className="text-sm text-slate-700">جاري فتح الصورة…</p>}
                    {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
                    {signature && sliders.map(slider => (
                        <label key={slider.title} className="block space-y-1 text-sm font-bold text-slate-800">
                            <span className="flex justify-between gap-2"><span>{slider.title}</span><span>{slider.value}٪</span></span>
                            <input dir="ltr" type="range" className="w-full accent-blue-600" min={slider.min} max={slider.max} value={slider.value} onChange={event => slider.change(Number(event.currentTarget.value))} />
                        </label>
                    ))}
                </div>
                <PdfPagePreview bytes={file.bytes} pageNumber={pageIndex + 1}>
                    {signatureUrl && rect && (
                        <img
                            alt="موضع التوقيع"
                            src={signatureUrl}
                            className="pointer-events-none absolute"
                            style={{
                                left: `${rect.x / page.width * 100}%`,
                                top: `${rect.y / page.height * 100}%`,
                                width: `${rect.width / page.width * 100}%`,
                                height: `${rect.height / page.height * 100}%`,
                            }}
                        />
                    )}
                </PdfPagePreview>
            </div>
            <PdfDownload disabled={!signature || loading} filename={outputFilename(file, 'signed')} save={save} />
        </div>
    );
}

export function CropPdfPages() {
    return <PdfWorkspace>{file => <CropPageEditor file={file} />}</PdfWorkspace>;
}

export function SignPdf() {
    return <PdfWorkspace>{file => <SignaturePageEditor file={file} />}</PdfWorkspace>;
}
