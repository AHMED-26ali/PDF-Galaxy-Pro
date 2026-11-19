import { useEffect, useState, type ReactNode } from 'react';

import { clearCanvas, openPdf, renderPdfPage, type PDFDocumentProxy } from '../pdfRuntime';

export default function PdfPagePreview({ bytes, pageNumber, children }: {
    bytes: Uint8Array;
    pageNumber: number;
    children?: ReactNode;
}) {
    const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
    const [image, setImage] = useState<{ pageNumber: number; src: string } | null>(null);
    const [documentError, setDocumentError] = useState(false);
    const [renderError, setRenderError] = useState<number | null>(null);

    useEffect(() => {
        let active = true;
        let document: PDFDocumentProxy | undefined;
        openPdf(bytes).then(async loaded => {
            if (!active) {
                await loaded.destroy();
                return;
            }
            document = loaded;
            setPdf(loaded);
        }).catch(() => {
            if (active) setDocumentError(true);
        });
        return () => {
            active = false;
            if (document) void document.destroy().catch(() => {});
        };
    }, [bytes]);

    useEffect(() => {
        if (!pdf) return;
        let active = true;
        async function renderPage() {
            const page = await pdf.getPage(pageNumber);
            if (!active) return;
            const canvas = await renderPdfPage(page, 2, 850);
            try {
                if (active) {
                    setImage({ pageNumber, src: canvas.toDataURL('image/png') });
                    setRenderError(null);
                }
            } finally {
                clearCanvas(canvas);
                page.cleanup();
            }
        }
        void renderPage().catch(() => {
            if (active) setRenderError(pageNumber);
        });
        return () => { active = false; };
    }, [pdf, pageNumber]);

    return (
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-4">
            <p className="mb-3 text-center text-sm font-bold text-slate-700">معاينة صفحة {pageNumber}</p>
            {documentError || renderError === pageNumber ? (
                <p role="status" className="text-center text-sm text-slate-700">تعذّر عرض المعاينة. يمكنك متابعة العمل باستخدام رقم الصفحة.</p>
            ) : image?.pageNumber === pageNumber ? (
                <div dir="ltr" className="relative mx-auto w-fit max-w-full overflow-hidden bg-white shadow-sm">
                    <img alt={`معاينة محتوى الصفحة ${pageNumber}`} src={image.src} className="block h-auto max-h-[440px] w-auto max-w-full" />
                    {children}
                </div>
            ) : (
                <p role="status" className="py-8 text-center text-sm text-slate-700">جاري تحميل المعاينة…</p>
            )}
        </div>
    );
}
