import { useEffect, useState, type ReactNode } from 'react';

interface PdfPage {
    getViewport(options: { scale: number }): { width: number; height: number };
    render(options: { canvasContext: CanvasRenderingContext2D; viewport: ReturnType<PdfPage['getViewport']> }): {
        promise: Promise<void>;
        cancel(): void;
    };
}

interface PreviewDocument {
    getPage(page: number): Promise<PdfPage>;
}

declare const pdfjsLib: {
    getDocument(options: { data: Uint8Array; isEvalSupported: boolean }): {
        promise: Promise<PreviewDocument>;
        destroy(): Promise<void>;
    };
};

export default function PdfPagePreview({ bytes, pageNumber, children }: {
    bytes: Uint8Array;
    pageNumber: number;
    children?: ReactNode;
}) {
    const [pdf, setPdf] = useState<PreviewDocument | null>(null);
    const [image, setImage] = useState<{ pageNumber: number; src: string } | null>(null);
    const [documentError, setDocumentError] = useState(false);
    const [renderError, setRenderError] = useState<number | null>(null);

    useEffect(() => {
        if (typeof pdfjsLib === 'undefined') {
            setDocumentError(true);
            return;
        }
        const task = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false });
        let active = true;
        task.promise.then(document => {
            if (active) setPdf(document);
        }).catch(() => {
            if (active) setDocumentError(true);
        });
        return () => {
            active = false;
            void task.destroy().catch(() => {});
        };
    }, [bytes]);

    useEffect(() => {
        if (!pdf) return;
        let active = true;
        let rendering: ReturnType<PdfPage['render']> | undefined;
        async function renderPage() {
            const page = await pdf.getPage(pageNumber);
            if (!active) return;
            const naturalSize = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: 600 / Math.max(naturalSize.width, naturalSize.height) });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const canvasContext = canvas.getContext('2d');
            if (!canvasContext) throw new Error('Canvas unavailable');
            rendering = page.render({ canvasContext, viewport });
            await rendering.promise;
            if (active) {
                setImage({ pageNumber, src: canvas.toDataURL('image/png') });
                setRenderError(null);
            }
        }
        void renderPage().catch(() => {
            if (active) setRenderError(pageNumber);
        });
        return () => {
            active = false;
            rendering?.cancel();
        };
    }, [pdf, pageNumber]);

    return (
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-4">
            <p className="mb-3 text-center text-sm font-bold text-slate-700">معاينة صفحة {pageNumber}</p>
            {documentError || renderError === pageNumber ? (
                <p role="status" className="text-center text-sm text-slate-700">تعذّر عرض المعاينة. يمكنك متابعة العمل باستخدام رقم الصفحة.</p>
            ) : image?.pageNumber === pageNumber ? (
                <div dir="ltr" className="relative mx-auto w-fit max-w-full overflow-hidden bg-white shadow-sm">
                    <img alt={`معاينة محتوى الصفحة ${pageNumber}`} src={image.src} className="block h-auto max-h-[440px] max-w-full object-contain" />
                    {children}
                </div>
            ) : (
                <p role="status" className="py-8 text-center text-sm text-slate-700">جاري تحميل المعاينة…</p>
            )}
        </div>
    );
}
