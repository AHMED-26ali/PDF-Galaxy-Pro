import type { LoggerMessage } from 'tesseract.js';
import { clearCanvas, readPageText, renderPdfPage, withPdf } from './pdfRuntime';

type OcrLanguage = 'ara+eng' | 'ara' | 'eng';

export async function createOcrWorker(language: OcrLanguage, logger: (message: LoggerMessage) => void) {
    const [{ createWorker, OEM }, worker, core] = await Promise.all([
        import('tesseract.js'),
        import('tesseract.js/dist/worker.min.js?url'),
        import('tesseract.js-core/tesseract-core-lstm.wasm.js?url'),
    ]);
    return createWorker(language, OEM.LSTM_ONLY, {
        workerPath: new URL(worker.default, window.location.href).href,
        corePath: new URL(core.default, window.location.href).href,
        langPath: new URL('ocr-data/', document.baseURI).href,
        workerBlobURL: false,
        logger,
    });
}


export function readDocumentText(
    file: File,
    allowScannedDocument: boolean,
    onPage: (status: string) => void,
    onProgress: (message: LoggerMessage) => void,
) {
    return withPdf(file, async pdf => {
        const pages: string[] = [];
        for (let number = 1; number <= pdf.numPages; number++) {
            onPage(`قراءة صفحة ${number} من ${pdf.numPages}…`);
            const page = await pdf.getPage(number);
            pages.push(await readPageText(page));
            page.cleanup();
        }
        if (!allowScannedDocument && !pages.some(Boolean)) return null;
        if (pages.every(Boolean)) return pages;

        onPage('جاري تهيئة التعرف الضوئي للصفحات المصوّرة…');
        const worker = await createOcrWorker('ara+eng', onProgress);
        try {
            for (let i = 0; i < pages.length; i++) {
                if (pages[i]) continue;
                onPage(`التعرف الضوئي على صفحة ${i + 1} من ${pdf.numPages}…`);
                const page = await pdf.getPage(i + 1);
                const canvas = await renderPdfPage(page, 2.5);
                try {
                    const { data } = await worker.recognize(canvas);
                    pages[i] = data.text.trim();
                } finally {
                    clearCanvas(canvas);
                    page.cleanup();
                }
            }
            return pages;
        } finally {
            await worker.terminate();
        }
    });
}
