import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { MagnifyingGlassIcon, ArrowDownTrayIcon, ClipboardIcon, CheckIcon, DocumentTextIcon, SparklesIcon } from '../components/icons';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';

import { createOcrWorker } from './ocrRuntime';
import { canvasToBlob, clearCanvas, downloadFile as download, pdfError, renderPdfPage, withPdf } from './pdfRuntime';

interface OcrPageResult {
    pageNumber: number;
    text: string;
}

const OcrPdf: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');
    const [ocrResults, setOcrResults] = useState<OcrPageResult[]>([]);
    const [searchablePdfBlob, setSearchablePdfBlob] = useState<Blob | null>(null);
    const [copied, setCopied] = useState(false);
    const [language, setLanguage] = useState<'ara+eng' | 'ara' | 'eng'>('ara+eng');

    const resetState = useCallback(() => {
        setFile(null);
        setIsLoading(false);
        setError(null);
        setProgress(0);
        setStatus('');
        setOcrResults([]);
        setSearchablePdfBlob(null);
        setCopied(false);
    }, []);

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            resetState();
            setFile(selectedFiles[0]);
        }
    }, [resetState]);

    const handleOcr = async () => {
        if (!file) return;

        setIsLoading(true);
        setError(null);
        setStatus("جاري تهيئة محرك التعرف الضوئي الذكي...");
        setProgress(0);

        setOcrResults([]);
        setSearchablePdfBlob(null);
        try {
            const [{ PDFDocument }, { default: fontkit }, { default: fontUrl }] = await Promise.all([
                import('pdf-lib'),
                import('@pdf-lib/fontkit'),
                import('@expo-google-fonts/noto-sans-arabic/400Regular/NotoSansArabic_400Regular.ttf?url'),
            ]);
            const fontResponse = await fetch(fontUrl);
            if (!fontResponse.ok) throw new Error('تعذّر تحميل خط PDF القابل للبحث.');
            const fontBytes = await fontResponse.arrayBuffer();
            const searchablePdf = await PDFDocument.create();
            searchablePdf.registerFontkit(fontkit);
            const font = await searchablePdf.embedFont(fontBytes, { subset: true });
            const results = await withPdf(file, async pdf => {
                const worker = await createOcrWorker(language, message => {
                    if (message.status === 'recognizing text') setProgress(Math.round(message.progress * 100));
                });
                try {
                    const pages: OcrPageResult[] = [];
                    for (let number = 1; number <= pdf.numPages; number++) {
                        setStatus(`التعرف الضوئي على صفحة ${number} من ${pdf.numPages}…`);
                        const page = await pdf.getPage(number);
                        const size = page.getViewport({ scale: 1 });
                        const canvas = await renderPdfPage(page, 2.5);
                        try {
                            const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
                            const output = searchablePdf.addPage([size.width, size.height]);
                            const visibleImage = await searchablePdf.embedPng(await (await canvasToBlob(canvas)).arrayBuffer());
                            output.drawImage(visibleImage, { x: 0, y: 0, width: size.width, height: size.height });

                            for (const block of data.blocks ?? []) {
                                for (const paragraph of block.paragraphs) {
                                    for (const line of paragraph.lines) {
                                        const text = line.text.trim();
                                        const { x0, x1, y0, y1 } = line.bbox;
                                        const textWidth = font.widthOfTextAtSize(text, 1);
                                        if (!text || textWidth <= 0) continue;
                                        const targetWidth = (x1 - x0) * size.width / canvas.width;
                                        const targetHeight = (y1 - y0) * size.height / canvas.height;
                                        output.drawText(text, {
                                            x: x0 * size.width / canvas.width,
                                            y: size.height - y1 * size.height / canvas.height,
                                            size: Math.max(1, Math.min(targetHeight, targetWidth / textWidth)),
                                            font,
                                            opacity: 0,
                                        });
                                    }
                                }
                            }
                            pages.push({ pageNumber: number, text: data.text.trim() });
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
            if (!results.some(page => page.text)) {
                setError('لم يتم العثور على نص مقروء. راجع لغة المستند وجودة المسح.');
                return;
            }
            setStatus('جاري حفظ ملف PDF القابل للبحث…');
            const pdfBytes = await searchablePdf.save();
            setSearchablePdfBlob(new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' }));
            setOcrResults(results);
        } catch (error) {
            console.error(error);
            setError(pdfError(error, 'تعذّر التعرف الضوئي. تأكد من سلامة الملف وجرّب مرة أخرى.'));
        } finally {
            setIsLoading(false);
            setProgress(0);
            setStatus('');
        }
    };

    const combinedText = ocrResults.map(p => `--- صفحة [${p.pageNumber}] ---\n${p.text}`).join('\n\n');

    const handleCopy = async () => {
        if (!combinedText) return;
        try {
            await navigator.clipboard.writeText(combinedText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setError('تعذّر النسخ إلى الحافظة. يمكنك تنزيل النص بصيغة Word.');
        }
    };

    const handleDownloadSearchablePdf = () => {
        if (!searchablePdfBlob || !file) return;
        const cleanName = file.name.replace(/\.pdf$/i, '') + '_searchable.pdf';
        download(searchablePdfBlob, cleanName, 'application/pdf');
    };

    const handleDownloadTxt = () => {
        if (!combinedText || !file) return;
        const blob = new Blob([combinedText], { type: 'text/plain;charset=utf-8' });
        const cleanName = file.name.replace(/\.pdf$/i, '') + '_ocr.txt';
        download(blob, cleanName, 'text/plain');
    };

    const handleDownloadDocx = async () => {
        if (!combinedText || !file) return;
        try {
            const paragraphs = combinedText.split(/\r?\n/).map(line => {
                const isHeading = line.startsWith('--- صفحة');
                return new Paragraph({
                    children: [
                        new TextRun({
                            text: line,
                            bold: isHeading,
                            size: isHeading ? 28 : 24,
                            color: isHeading ? 'D97706' : '1E293B',
                            font: 'Arial',
                        })
                    ],
                    alignment: AlignmentType.RIGHT,
                    bidirectional: true,
                    spacing: { after: 120 },
                });
            });

            const doc = new Document({
                sections: [{ children: paragraphs }],
            });

            const blob = await Packer.toBlob(doc);
            const cleanName = file.name.replace(/\.pdf$/i, '') + '_ocr.docx';
            download(blob, cleanName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        } catch (e) {
            console.error(e);
            handleDownloadTxt();
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {!file ? (
                <FileUploader onFilesSelected={onFilesSelected} multiple={false} accept=".pdf" />
            ) : (
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                                🔍
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm">{file.name}</h3>
                                <p className="text-xs text-slate-500">تحويل المستندات المصورة إلى نصوص حية وقابلة للبحث</p>
                            </div>
                        </div>
                        <button
                            onClick={resetState}
                            className="text-xs text-slate-500 hover:text-slate-800 font-bold px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                            تغيير الملف
                        </button>
                    </div>

                    {/* Pre-OCR Settings */}
                    {!isLoading && ocrResults.length === 0 && (
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto space-y-6 text-center">
                            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto text-3xl">
                                🧠
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-800">التعرف الضوئي على الحروف (OCR)</h3>
                                <p className="text-slate-500 text-xs mt-1">
                                    استخراج الكلمات العربية والإنجليزية من المستند المصور مع إمكانية تحويله إلى PDF قابل للبحث والتحديد
                                </p>
                            </div>

                            {/* Language selector */}
                            <div className="text-right p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                                <label className="block text-xs font-bold text-slate-700">لغة النصوص في المستند:</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { id: 'ara+eng', label: 'عربي + إنجليزي' },
                                        { id: 'ara', label: 'عربي فقط' },
                                        { id: 'eng', label: 'إنجليزي فقط' },
                                    ].map(item => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => setLanguage(item.id as any)}
                                            className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                                                language === item.id
                                                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleOcr}
                                className="bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold py-3.5 px-8 rounded-2xl hover:opacity-95 shadow-lg shadow-amber-500/25 transition-all text-sm flex items-center justify-center gap-2 mx-auto"
                            >
                                <SparklesIcon className="w-5 h-5" />
                                بدء المعالجة والمسح الضوئي الذكي
                            </button>
                        </div>
                    )}

                    {/* Loading State */}
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto text-center">
                            <LoadingSpinner />
                            <p className="text-base font-bold text-slate-800 mt-4">{status}</p>
                            <div className="w-full bg-slate-100 rounded-full h-3 mt-4 overflow-hidden border border-slate-200">
                                <div className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                            </div>
                            <p className="text-xs font-bold text-amber-600 mt-2 font-mono">{progress}%</p>
                        </div>
                    )}

                    {/* Results State */}
                    {ocrResults.length > 0 && (
                        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-amber-200 shadow-sm space-y-6 animate-fade-in">
                            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl font-bold">
                                        ✓
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-slate-800">اكتمل التعرف الضوئي بنجاح!</h3>
                                        <p className="text-xs text-slate-500">تم التعرف على نصوص {ocrResults.length} صفحة</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        onClick={handleDownloadSearchablePdf}
                                        className="bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 hover:opacity-95 transition-opacity"
                                    >
                                        <ArrowDownTrayIcon className="w-4 h-4" />
                                        <span>تحميل PDF قابل للبحث</span>
                                    </button>
                                    <button
                                        onClick={handleDownloadDocx}
                                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-2.5 px-3.5 rounded-xl text-xs flex items-center gap-1.5 border border-blue-200 transition-colors"
                                    >
                                        <DocumentTextIcon className="w-4 h-4" />
                                        <span>Word (.docx)</span>
                                    </button>
                                    <button
                                        onClick={handleCopy}
                                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-3.5 rounded-xl text-xs flex items-center gap-1.5 border border-slate-200 transition-colors"
                                    >
                                        {copied ? <CheckIcon className="w-4 h-4 text-emerald-600" /> : <ClipboardIcon className="w-4 h-4" />}
                                        <span>{copied ? 'تم النسخ!' : 'نسخ النص'}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Recognized Text Box */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2">النصوص التي تم التعرف عليها:</label>
                                <textarea
                                    readOnly
                                    value={combinedText}
                                    className="w-full h-80 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-800 font-sans text-sm leading-relaxed focus:outline-none select-all"
                                    dir="auto"
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-center text-sm font-bold max-w-xl mx-auto">
                    {error}
                </div>
            )}
        </div>
    );
};

export default OcrPdf;
