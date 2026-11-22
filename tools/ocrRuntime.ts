import type { LoggerMessage } from 'tesseract.js';
import { clearCanvas, readPageText, renderPdfPage, withPdf } from './pdfRuntime';

type OcrLanguage = 'ara+eng' | 'ara' | 'eng';

export class OcrStartupError extends Error {}

export async function createOcrWorker(language: OcrLanguage, logger: (message: LoggerMessage) => void) {
    let abandoned = false;
    let timer: number | undefined;
    let failStartup: (cause: unknown) => void = () => {};
    const failed = new Promise<never>((_, reject) => {
        failStartup = cause => reject(new OcrStartupError('تعذّر تحميل ملفات التعرّف الضوئي. جرّب مرة أخرى.', { cause }));
        timer = window.setTimeout(() => {
            reject(new OcrStartupError('استغرق تحميل التعرّف الضوئي وقتًا طويلًا. جرّب مرة أخرى.'));
        }, 90_000);
    });

    const pending = (async () => {
        const [{ createWorker, OEM }, worker, core] = await Promise.all([
            import('tesseract.js'),
            import('tesseract.js/dist/worker.min.js?url'),
            import('tesseract.js-core/tesseract-core-lstm.wasm.js?url'),
        ]);
        if (abandoned) throw new Error('OCR startup expired before loading the worker');

        const assetBase = new URL(import.meta.env.BASE_URL, window.location.origin);
        return createWorker(language, OEM.LSTM_ONLY, {
            workerPath: new URL(worker.default, assetBase).href,
            corePath: new URL(core.default, assetBase).href,
            langPath: new URL('ocr-data/', assetBase).href,
            workerBlobURL: false,
            logger: message => { if (!abandoned) logger(message); },
            // Tesseract may report a language-load failure without rejecting its startup promise.
            errorHandler: failStartup,
        });
    })();

    try {
        return await Promise.race([pending, failed]);
    } catch (error) {
        abandoned = true;
        void pending.then(worker => worker.terminate()).catch(() => {});
        if (error instanceof OcrStartupError) throw error;
        throw new OcrStartupError('تعذّر تحميل ملفات التعرّف الضوئي. جرّب مرة أخرى.', { cause: error });
    } finally {
        window.clearTimeout(timer);
    }
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
