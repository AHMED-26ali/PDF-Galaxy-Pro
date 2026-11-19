import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFDocument } from 'pdf-lib';
import LoadingSpinner from '../../components/LoadingSpinner';
import { ArrowDownTrayIcon } from '../../components/icons';

export type OpenPdf = {
    name: string;
    bytes: Uint8Array<ArrayBuffer>;
    document: PDFDocument;
};

export const secondaryButton = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
export const field = 'w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900';

export function PdfWorkspace({ children }: { children: (file: OpenPdf) => ReactNode }) {
    const [file, setFile] = useState<OpenPdf | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function openFile(upload: File) {
        setError('');
        setLoading(true);
        try {
            const [{ PDFDocument }, buffer] = await Promise.all([import('pdf-lib'), upload.arrayBuffer()]);
            const bytes = new Uint8Array(buffer);
            const document = await PDFDocument.load(bytes, { updateMetadata: false });
            if (document.getPageCount() === 0) {
                setError('ملف PDF لا يحتوي على صفحات.');
                return;
            }
            setFile({ name: upload.name, bytes, document });
        } catch (error) {
            setError(error instanceof Error && error.message.includes('is encrypted')
                ? 'الملف محمي بكلمة مرور. اختر نسخة غير مشفّرة.'
                : 'تعذّر فتح الملف. اختر ملف PDF سليماً.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-5">
            {file ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="min-w-0">
                        <p className="break-all font-bold text-slate-900"><bdi>{file.name}</bdi></p>
                        <p className="text-sm text-slate-600">عدد الصفحات {file.document.getPageCount()}</p>
                    </div>
                    <button type="button" className={secondaryButton} onClick={() => setFile(null)}>اختيار ملف آخر</button>
                </div>
            ) : (
                <label className="block rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 p-5 sm:p-8 text-sm font-bold text-slate-800">
                    <span className="mb-3 block text-base">اختر ملف PDF من جهازك</span>
                    <input
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={loading}
                        className="block w-full min-w-0 rounded-lg text-sm text-slate-700 file:me-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:font-bold file:text-white"
                        onChange={event => {
                            const upload = event.currentTarget.files?.[0];
                            event.currentTarget.value = '';
                            if (upload) void openFile(upload);
                        }}
                    />
                </label>
            )}
            {loading && <div role="status" className="flex items-center gap-3 text-sm text-slate-700"><LoadingSpinner /> جاري فتح الملف…</div>}
            {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
            {file && children(file)}
        </div>
    );
}

export function PdfDownload({ disabled, filename, save }: {
    disabled: boolean;
    filename: string;
    save: () => Promise<Uint8Array>;
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const downloadUrl = useRef<string>(undefined);
    const unmounted = useRef(false);

    useEffect(() => {
        unmounted.current = false;
        return () => {
            unmounted.current = true;
            if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
        };
    }, []);

    async function download() {
        setLoading(true);
        setError('');
        try {
            const bytes = await save();
            if (unmounted.current) return;
            if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
            const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
            downloadUrl.current = url;
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch {
            if (!unmounted.current) setError('تعذّر إنشاء الملف. حاول مرة أخرى أو اختر ملفاً آخر.');
        } finally {
            if (!unmounted.current) setLoading(false);
        }
    }

    return (
        <div className="space-y-2">
            <button
                type="button"
                disabled={disabled || loading}
                onClick={download}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40"
            >
                <ArrowDownTrayIcon aria-hidden className="h-5 w-5" />
                {loading ? 'جاري تجهيز الملف…' : 'تحميل PDF'}
            </button>
            {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
        </div>
    );
}

export function outputFilename(file: OpenPdf, suffix: string) {
    return `${file.name.replace(/\.pdf$/i, '')}-${suffix}.pdf`;
}
