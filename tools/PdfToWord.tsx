import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { DocumentTextIcon, ArrowDownTrayIcon, ClipboardIcon, CheckIcon, SparklesIcon } from '../components/icons';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

declare const pdfjsLib: any;
declare const download: any;
declare const Tesseract: any;

interface ExtractedParagraph {
    text: string;
    isHeading?: boolean;
    fontSize?: number;
}

const PdfToWord: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [needsOcr, setNeedsOcr] = useState(false);
    const [ocrProgress, setOcrProgress] = useState(0);
    const [extractedText, setExtractedText] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [docxBlob, setDocxBlob] = useState<Blob | null>(null);

    const resetState = () => {
        setFile(null);
        setIsLoading(false);
        setStatus('');
        setError(null);
        setNeedsOcr(false);
        setOcrProgress(0);
        setExtractedText(null);
        setCopied(false);
        setDocxBlob(null);
    };

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            resetState();
            setFile(selectedFiles[0]);
        }
    }, []);

    // Create a genuine .docx document using docx library
    const generateDocx = async (text: string, paragraphsList?: ExtractedParagraph[]): Promise<Blob> => {
        const rawLines = paragraphsList && paragraphsList.length > 0 
            ? paragraphsList 
            : text.split(/\r?\n\r?\n/).map(p => ({ text: p.trim() })).filter(p => p.text.length > 0);

        const docxChildren: Paragraph[] = [];

        // Title header
        docxChildren.push(
            new Paragraph({
                children: [
                    new TextRun({
                        text: file ? file.name.replace(/\.pdf$/i, '') : 'مستند محول',
                        bold: true,
                        size: 36, // 18pt
                        font: 'Cairo',
                        color: '1E3A8A',
                    })
                ],
                alignment: AlignmentType.RIGHT,
                bidirectional: true,
                spacing: { after: 300 },
            })
        );

        for (const item of rawLines) {
            const cleanText = item.text.trim();
            if (!cleanText) continue;

            const isShortTitle = cleanText.length < 60 && !cleanText.endsWith('.') && !cleanText.endsWith('،');
            
            docxChildren.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: cleanText,
                            bold: item.isHeading || isShortTitle,
                            size: item.isHeading || isShortTitle ? 28 : 24, // 14pt or 12pt
                            font: 'Arial',
                        })
                    ],
                    alignment: AlignmentType.RIGHT,
                    bidirectional: true,
                    spacing: {
                        before: item.isHeading || isShortTitle ? 200 : 100,
                        after: 150,
                        line: 360, // 1.5 line spacing
                    },
                })
            );
        }

        const doc = new Document({
            sections: [
                {
                    properties: {
                        page: {
                            margin: {
                                top: 1440, // 1 inch
                                right: 1440,
                                bottom: 1440,
                                left: 1440,
                            },
                        },
                    },
                    children: docxChildren,
                },
            ],
        });

        return await Packer.toBlob(doc);
    };

    const processConversion = async (text: string, paragraphsList?: ExtractedParagraph[]) => {
        try {
            if (!text.trim()) {
                setError("لم يتم العثور على أي نصوص لتحويلها إلى Word.");
                setIsLoading(false);
                setStatus('');
                return;
            }

            setStatus("جاري إنشاء مستند Word (.docx) أصلي متوافق 100%...");
            setOcrProgress(0);

            const blob = await generateDocx(text, paragraphsList);
            setDocxBlob(blob);
            setExtractedText(text);

            // Auto trigger download of genuine DOCX
            const cleanName = (file ? file.name.replace(/\.pdf$/i, '') : 'document') + '.docx';
            download(blob, cleanName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

            setIsLoading(false);
            setStatus('');
        } catch (e: any) {
            console.error(e);
            setError(e.message || "حدث خطأ أثناء إنشاء ملف Word.");
            setIsLoading(false);
            setStatus('');
        }
    };

    const runOcrAndConvert = async () => {
        if (!file) return;

        setNeedsOcr(false);
        setIsLoading(true);
        setError(null);
        setStatus('تحضير محرك المسح الضوئي (OCR)...');

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            const numPages = pdfDoc.numPages;
            let fullText = '';

            const worker = await Tesseract.createWorker('ara+eng', 1, {
                logger: (m: any) => {
                    if (m.status === 'recognizing text') {
                        setOcrProgress(Math.round(m.progress * 100));
                    }
                }
            });

            for (let i = 1; i <= numPages; i++) {
                setStatus(`جاري قراءة واستخراج نص صفحة ${i} من ${numPages}...`);
                const page = await pdfDoc.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                if (!context) continue;

                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvasContext: context, viewport }).promise;

                const { data } = await worker.recognize(canvas);
                fullText += data.text + '\n\n';
            }
            await worker.terminate();

            await processConversion(fullText);

        } catch (e: any) {
            console.error(e);
            setError(e.message || "فشلت عملية المسح الضوئي. يرجى التأكد من جودة الملف.");
            setIsLoading(false);
            setStatus('');
        }
    };

    const handleInitialCheck = async () => {
        if (!file) return;
        setIsLoading(true);
        setError(null);
        setNeedsOcr(false);

        try {
            setStatus("جاري تحليل واستخراج نصوص الـ PDF بدقة...");
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            let fullText = '';
            const structuredParagraphs: ExtractedParagraph[] = [];

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                if (textContent.items.length === 0) continue;

                // Group text items by vertical position (lines)
                const lineMap = new Map<number, any[]>();
                for (const item of textContent.items) {
                    const y = Math.round(item.transform[5]);
                    if (!lineMap.has(y)) {
                        lineMap.set(y, []);
                    }
                    lineMap.get(y)!.push(item);
                }

                // Sort lines from top to bottom
                const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);
                let currentParagraph = '';

                for (const y of sortedY) {
                    const items = lineMap.get(y)!;
                    // Sort items from right to left or left to right depending on order
                    items.sort((a, b) => a.transform[4] - b.transform[4]);
                    const lineText = items.map(item => item.str).join(' ').trim();
                    if (!lineText) continue;

                    if (currentParagraph && (y - (sortedY[sortedY.indexOf(y) - 1] || y) < -25)) {
                        structuredParagraphs.push({ text: currentParagraph });
                        fullText += currentParagraph + '\n\n';
                        currentParagraph = lineText;
                    } else {
                        currentParagraph = currentParagraph ? `${currentParagraph} ${lineText}` : lineText;
                    }
                }

                if (currentParagraph) {
                    structuredParagraphs.push({ text: currentParagraph });
                    fullText += currentParagraph + '\n\n';
                }
            }

            if (!fullText.trim()) {
                setNeedsOcr(true);
                setIsLoading(false);
                setStatus('');
            } else {
                await processConversion(fullText, structuredParagraphs);
            }

        } catch (e: any) {
            console.error(e);
            setError(e.message || "حدث خطأ أثناء معالجة ملف الـ PDF.");
            setIsLoading(false);
            setStatus('');
        }
    };

    const handleCopy = () => {
        if (!extractedText) return;
        navigator.clipboard.writeText(extractedText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleManualDownload = () => {
        if (!docxBlob || !file) return;
        const cleanName = file.name.replace(/\.pdf$/i, '') + '.docx';
        download(docxBlob, cleanName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    };

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col items-center justify-center p-8 bg-white rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto">
                    <LoadingSpinner />
                    <p className="text-base font-bold text-slate-800 mt-4">{status}</p>
                    {ocrProgress > 0 && (
                        <div className="w-full bg-slate-100 rounded-full h-3 mt-4 overflow-hidden border border-slate-200">
                            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-300" style={{ width: `${ocrProgress}%` }}></div>
                            <p className="text-xs font-bold text-blue-600 mt-2 text-center">{ocrProgress}%</p>
                        </div>
                    )}
                </div>
            );
        }

        if (needsOcr) {
            return (
                <div className="text-center p-8 bg-amber-50/70 border border-amber-200 rounded-3xl max-w-xl mx-auto">
                    <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
                        🔍
                    </div>
                    <h3 className="text-xl font-black text-amber-900 mb-2">مستند مصور أو ممسوح ضوئياً</h3>
                    <p className="text-slate-600 mb-6 text-sm leading-relaxed">
                        ملف الـ PDF لا يحتوي على نصوص نصية مدمجة (عبارة عن صور). يمكنك استخدام تقنية التعرف الضوئي الذكي (OCR) لاستخراج النصوص وتحويلها إلى مستند Word.
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                        <button onClick={resetState} className="bg-white text-slate-700 font-bold py-2.5 px-6 rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors text-sm">
                            إلغاء
                        </button>
                        <button onClick={runOcrAndConvert} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-2.5 px-7 rounded-2xl shadow-md shadow-blue-500/20 hover:opacity-95 transition-opacity text-sm flex items-center gap-2">
                            <SparklesIcon className="w-4 h-4" />
                            بدء المسح الضوئي والتحويل لـ Word
                        </button>
                    </div>
                </div>
            );
        }

        if (docxBlob && extractedText) {
            return (
                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-emerald-200 shadow-sm max-w-2xl mx-auto text-center space-y-6 animate-fade-in">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto text-3xl">
                        ✓
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-800">تم التحويل بنجاح إلى مستند Word!</h3>
                        <p className="text-slate-500 text-sm mt-1">
                            ملف <span className="font-bold text-slate-700">{file?.name}</span> جاهز بصيغة <span className="font-mono font-bold text-emerald-600">.docx</span> الأصلية
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                        <button
                            onClick={handleManualDownload}
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 px-8 rounded-2xl shadow-lg shadow-blue-500/25 hover:opacity-95 transition-all text-sm flex items-center gap-2"
                        >
                            <ArrowDownTrayIcon className="w-5 h-5" />
                            تحميل ملف Word (.docx)
                        </button>
                        <button
                            onClick={handleCopy}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-6 rounded-2xl transition-colors text-sm flex items-center gap-2 border border-slate-200"
                        >
                            {copied ? <CheckIcon className="w-5 h-5 text-emerald-600" /> : <ClipboardIcon className="w-5 h-5" />}
                            {copied ? 'تم النسخ!' : 'نسخ النص'}
                        </button>
                        <button
                            onClick={resetState}
                            className="bg-white hover:bg-slate-50 text-slate-500 font-bold py-3.5 px-5 rounded-2xl transition-colors text-sm border border-slate-200"
                        >
                            تحويل ملف آخر
                        </button>
                    </div>

                    {/* Extracted text preview */}
                    <div className="text-right pt-4 border-t border-slate-100">
                        <p className="text-xs font-bold text-slate-500 mb-2">معاينة النص المستخرج:</p>
                        <div className="max-h-48 overflow-y-auto bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-700 leading-relaxed font-sans whitespace-pre-wrap select-all">
                            {extractedText.slice(0, 1000)}
                            {extractedText.length > 1000 ? '...' : ''}
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto text-center space-y-6">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto">
                    <DocumentTextIcon className="w-8 h-8" />
                </div>
                <div>
                    <h3 className="text-xl font-black text-slate-800">الملف جاهز للتحويل</h3>
                    <p className="text-slate-500 text-sm mt-1 font-mono">{file?.name}</p>
                </div>
                <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 text-xs text-slate-600 leading-relaxed">
                    ✨ سيتم إنشاء ملف Word رسمي بصيغة <span className="font-bold text-blue-700">.docx</span> يدعم اللغة العربية واتجاه اليمين لليسار، قابل للتعديل الفوري في كافة إصدارات Microsoft Word و Google Docs.
                </div>
                <div className="pt-2 flex justify-center gap-3">
                    <button
                        onClick={resetState}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-2xl text-sm transition-colors"
                    >
                        تغيير الملف
                    </button>
                    <button
                        onClick={handleInitialCheck}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 px-8 rounded-2xl hover:opacity-95 shadow-lg shadow-blue-500/25 transition-all text-sm flex items-center gap-2"
                    >
                        <SparklesIcon className="w-5 h-5" />
                        بدء التحويل إلى Word
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {!file ? (
                <FileUploader onFilesSelected={onFilesSelected} multiple={false} accept=".pdf" />
            ) : (
                renderContent()
            )}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-center text-sm font-bold max-w-xl mx-auto">
                    {error}
                </div>
            )}
        </div>
    );
};

export default PdfToWord;
