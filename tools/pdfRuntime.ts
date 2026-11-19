/// <reference types="vite/client" />
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export async function openPdf(input: File | Uint8Array) {
    const [pdfjs, worker] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const data = input instanceof Uint8Array ? input.slice() : new Uint8Array(await input.arrayBuffer());
    const task = pdfjs.getDocument({ data, isEvalSupported: false });
    try {
        return await task.promise;
    } catch (error) {
        await task.destroy().catch(() => {});
        throw error;
    }
}

export async function withPdf<T>(input: File | Uint8Array, run: (pdf: PDFDocumentProxy) => Promise<T>) {
    const pdf = await openPdf(input);
    try {
        return await run(pdf);
    } finally {
        await pdf.destroy().catch(() => {});
    }
}

export function pdfError(error: unknown, fallback: string) {
    if (error instanceof Error && (error.name === 'PasswordException' || error.message.includes('is encrypted'))) {
        return 'الملف مشفّر بكلمة مرور. اختر نسخة مفتوحة من الملف.';
    }
    return fallback;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number) {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob?.type === type) resolve(blob);
            else reject(new Error('تعذّر إنشاء الصورة بالصيغة أو الأبعاد المطلوبة.'));
        }, type, quality);
    });
}

export async function renderPdfPage(page: PDFPageProxy, scale: number, maxSide = 4096) {
    const size = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
        scale: Math.min(scale, maxSide / Math.max(size.width, size.height)),
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('تعذّر تجهيز معاينة الصفحة.');
    await page.render({ canvasContext: context, viewport, background: '#fff' }).promise;
    return canvas;
}

export async function readPageText(page: PDFPageProxy) {
    const { items } = await page.getTextContent();
    const lines: string[] = [];
    let line = '';
    let last: Extract<(typeof items)[number], { str: string }> | undefined;
    for (const item of items) {
        if (!('str' in item)) continue;
        if (line && last && item.str) {
            const [a, b, c, d, x, y] = last.transform;
            const dx = item.transform[4] - x;
            const dy = item.transform[5] - y;
            const baseline = Math.hypot(a, b) || 1;
            const fontHeight = Math.hypot(c, d);
            const lineDistance = Math.abs((dy * a - dx * b) / baseline);
            const gap = (dx * a + dy * b) / baseline - last.width;
            if (lineDistance > Math.max(2, fontHeight / 4)) {
                lines.push(line.trim());
                line = '';
            } else if (!/\s$/.test(line) && !/^\s/.test(item.str) && (gap > fontHeight * 0.14 || item.dir === 'rtl')) {
                line += ' ';
            }
        }
        line += item.str;
        if (item.hasEOL) {
            if (line.trim()) lines.push(line.trim());
            line = '';
        }
        last = item;
    }
    if (line.trim()) lines.push(line.trim());
    return lines.filter(Boolean).join('\n');
}

export function downloadFile(data: Blob | Uint8Array, name: string, mime: string) {
    const blob = data instanceof Blob ? data : new Blob([new Uint8Array(data)], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function clearCanvas(canvas: HTMLCanvasElement) {
    canvas.width = 0;
    canvas.height = 0;
}

export function parsePageRange(input: string, count: number): number[] {
    const normalized = input
        .replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) & 15))
        .replace(/[–—−]/g, '-');
    const indices = new Set<number>();
    for (const part of normalized.split(/[,،]/)) {
        const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
        if (!match) throw new Error('اكتب الصفحات بالشكل 1، 3-5.');
        const first = Number(match[1]);
        const last = Number(match[2] ?? match[1]);
        if (first < 1 || first > last || last > count) {
            throw new Error(`اختر صفحات من 1 إلى ${count} بترتيب تصاعدي داخل كل نطاق.`);
        }
        for (let index = first; index <= last; index++) indices.add(index);
    }
    return [...indices].sort((a, b) => a - b);
}
