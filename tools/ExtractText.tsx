import React, { useState, useCallback, useMemo } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { ArrowDownTrayIcon, ClipboardIcon, CheckIcon, MagnifyingGlassIcon, DocumentTextIcon, SparklesIcon } from '../components/icons';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

declare const pdfjsLib: any;
declare const download: any;
declare const Tesseract: any;

interface ExtractedPage {
    pageNumber: number;
    text: string;
    wordCount: number;
}

const ExtractText: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pagesData, setPagesData] = useState<ExtractedPage[]>([]);
    const [selectedPageFilter, setSelectedPageFilter] = useState<number | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [copied, setCopied] = useState(false);
    const [needsOcr, setNeedsOcr] = useState(false);
    const [ocrProgress, setOcrProgress] = useState(0);

    const resetState = useCallback(() => {
        setFile(null);
        setIsLoading(false);
        setStatus('');
        setError(null);
        setPagesData([]);
        setSelectedPageFilter('all');
        setSearchQuery('');
        setCopied(false);
        setNeedsOcr(false);
        setOcrProgress(0);
    }, []);

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            resetState();
            setFile(selectedFiles[0]);
        }
    }, [resetState]);

    const runExtraction = async (useOcrFallback = false) => {
        if (!file) return;
        setIsLoading(true);
        setError(null);
        setNeedsOcr(false);
        setStatus("جاري قراءة واستخراج النصوص...");

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            const numPages = pdfDoc.numPages;
            const extracted: ExtractedPage[] = [];

            let totalExtractedLength = 0;

            for (let i = 1; i <= numPages; i++) {
                setStatus(`تحليل صفحة ${i} من ${numPages}...`);
                const page = await pdfDoc.getPage(i);
                const textContent = await page.getTextContent();

                if (textContent.items.length > 0) {
                    // Group text by Y coordinate to preserve lines
                    const lineMap = new Map<number, any[]>();
                    for (const item of textContent.items) {
                        const y = Math.round(item.transform[5]);
                        if (!lineMap.has(y)) {
                            lineMap.set(y, []);
                        }
                        lineMap.get(y)!.push(item);
                    }

                    // Sort lines top to bottom
                    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);
                    const pageLines: string[] = [];

                    for (const y of sortedY) {
                        const items = lineMap.get(y)!;
                        items.sort((a, b) => a.transform[4] - b.transform[4]);
                        const lineStr = items.map(it => it.str).join(' ').trim();
                        if (lineStr) {
                            pageLines.push(lineStr);
                        }
                    }

                    const pageText = pageLines.join('\n');
                    totalExtractedLength += pageText.trim().length;

                    extracted.push({
                        pageNumber: i,
                        text: pageText,
                        wordCount: pageText.trim() ? pageText.trim().split(/\s+/).length : 0,
                    });
                } else {
                    extracted.push({
                        pageNumber: i,
                        text: '',
                        wordCount: 0,
                    });
                }
            }

            // If no embedded text found and OCR wasn't requested yet
            if (totalExtractedLength === 0 && !useOcrFallback) {
                setNeedsOcr(true);
                setIsLoading(false);
                setStatus('');
                return;
            }

            // If OCR fallback requested
            if (useOcrFallback) {
                setStatus('جاري تهيئة التعرف الضوئي (OCR)...');
                const worker = await Tesseract.createWorker('ara+eng', 1, {
                    logger: (m: any) => {
                        if (m.status === 'recognizing text') {
                            setOcrProgress(Math.round(m.progress * 100));
                        }
                    }
                });

                for (let i = 1; i <= numPages; i++) {
                    setStatus(`مسح ضوئي لصفحة ${i} من ${numPages}...`);
                    const page = await pdfDoc.getPage(i);
                    const viewport = page.getViewport({ scale: 2.0 });
                    const canvas = document.createElement("canvas");
                    const context = canvas.getContext("2d");
                    if (!context) continue;

                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    await page.render({ canvasContext: context, viewport }).promise;

                    const { data } = await worker.recognize(canvas);
                    const recognized = data.text || '';

                    extracted[i - 1] = {
                        pageNumber: i,
                        text: recognized,
                        wordCount: recognized.trim() ? recognized.trim().split(/\s+/).length : 0,
                    };
                }

                await worker.terminate();
            }

            setPagesData(extracted);
            setIsLoading(false);
            setStatus('');
        } catch (e: any) {
            console.error(e);
            setError(e.message || "فشل استخراج النصوص من الملف.");
            setIsLoading(false);
            setStatus('');
        }
    };

    // Filtered text based on page selector
    const displayText = useMemo(() => {
        if (selectedPageFilter === 'all') {
            return pagesData
                .map(p => `--- صفحة [${p.pageNumber}] ---\n\n${p.text}`)
                .join('\n\n\n');
        }
        const page = pagesData.find(p => p.pageNumber === selectedPageFilter);
        return page ? page.text : '';
    }, [pagesData, selectedPageFilter]);

    // Statistics
    const stats = useMemo(() => {
        const full = pagesData.map(p => p.text).join(' ');
        const totalWords = full.trim() ? full.trim().split(/\s+/).length : 0;
        const totalChars = full.length;
        return { totalWords, totalChars, totalPages: pagesData.length };
    }, [pagesData]);

    const handleCopy = () => {
        if (!displayText) return;
        navigator.clipboard.writeText(displayText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadTxt = () => {
        if (!displayText || !file) return;
        const blob = new Blob([displayText], { type: 'text/plain;charset=utf-8' });
        const cleanName = file.name.replace(/\.pdf$/i, '') + '_extracted.txt';
        download(blob, cleanName, 'text/plain');
    };

    const handleDownloadDocx = async () => {
        if (!displayText || !file) return;
        try {
            const paragraphs = displayText.split(/\r?\n/).map(line => {
                const trimmed = line.trim();
                const isPageDivider = trimmed.startsWith('--- صفحة');
                return new Paragraph({
                    children: [
                        new TextRun({
                            text: trimmed,
                            bold: isPageDivider,
                            size: isPageDivider ? 28 : 24,
                            color: isPageDivider ? '2563EB' : '1E293B',
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
            const cleanName = file.name.replace(/\.pdf$/i, '') + '_extracted.docx';
            download(blob, cleanName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        } catch (err) {
            console.error(err);
            handleDownloadTxt();
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {!file ? (
                <FileUploader onFilesSelected={onFilesSelected} multiple={false} accept=".pdf" />
            ) : (
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                                📝
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm">{file.name}</h3>
                                <p className="text-xs text-slate-500">استخراج كامل النصوص بدقة وتنسيق منظم</p>
                            </div>
                        </div>
                        <button
                            onClick={resetState}
                            className="text-xs text-slate-500 hover:text-slate-800 font-bold px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                            تغيير الملف
                        </button>
                    </div>

                    {/* Needs OCR Prompt */}
                    {needsOcr && (
                        <div className="text-center p-8 bg-amber-50/70 border border-amber-200 rounded-3xl max-w-xl mx-auto space-y-4">
                            <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto text-2xl">
                                🔍
                            </div>
                            <h3 className="text-xl font-black text-amber-900">المستند لا يحتوي على نصوص عادية (ممسوح ضوئياً)</h3>
                            <p className="text-slate-600 text-xs leading-relaxed max-w-md mx-auto">
                                يبدو أن المستند عبارة عن صور ممسوحة. هل ترغب في استخدام الذكاء الاصطناعي والتعرف الضوئي (OCR) لقراءة النصوص واستخراجها؟
                            </p>
                            <div className="flex justify-center gap-3 pt-2">
                                <button
                                    onClick={resetState}
                                    className="bg-white text-slate-700 font-bold py-2.5 px-6 rounded-2xl border border-slate-200 hover:bg-slate-50 text-xs"
                                >
                                    إلغاء
                                </button>
                                <button
                                    onClick={() => runExtraction(true)}
                                    className="bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold py-2.5 px-7 rounded-2xl shadow-md shadow-amber-500/20 hover:opacity-95 text-xs flex items-center gap-2"
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    بدء المسح الضوئي الذكي (OCR)
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Initial Extract Prompt if not extracted yet */}
                    {!isLoading && pagesData.length === 0 && !needsOcr && (
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto text-center space-y-6">
                            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto text-3xl">
                                📋
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-800">الملف جاهز للاستخراج</h3>
                                <p className="text-slate-500 text-xs mt-1">سيتم استخراج كافة الكلمات والجمل مع الحفاظ على الترتيب والفقرات</p>
                            </div>
                            <button
                                onClick={() => runExtraction(false)}
                                className="bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold py-3.5 px-8 rounded-2xl hover:opacity-95 shadow-lg shadow-amber-500/25 transition-all text-sm flex items-center justify-center gap-2 mx-auto"
                            >
                                <DocumentTextIcon className="w-5 h-5" />
                                استخراج كافة النصوص الآن
                            </button>
                        </div>
                    )}

                    {/* Loading State */}
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto text-center">
                            <LoadingSpinner />
                            <p className="text-base font-bold text-slate-800 mt-4">{status}</p>
                            {ocrProgress > 0 && (
                                <div className="w-full bg-slate-100 rounded-full h-3 mt-4 overflow-hidden border border-slate-200">
                                    <div className="bg-amber-500 h-full rounded-full transition-all duration-300" style={{ width: `${ocrProgress}%` }}></div>
                                    <p className="text-xs font-bold text-amber-600 mt-2">{ocrProgress}%</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Extracted Results View */}
                    {pagesData.length > 0 && (
                        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6 animate-fade-in">
                            {/* Stats Cards */}
                            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                                <div>
                                    <p className="text-xs text-slate-500">إجمالي الصفحات</p>
                                    <p className="text-lg font-black text-slate-800 font-mono">{stats.totalPages}</p>
                                </div>
                                <div className="border-x border-slate-200">
                                    <p className="text-xs text-slate-500">عدد الكلمات</p>
                                    <p className="text-lg font-black text-amber-600 font-mono">{stats.totalWords.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">عدد الحروف</p>
                                    <p className="text-lg font-black text-slate-800 font-mono">{stats.totalChars.toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Toolbar (Search & Page selector) */}
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                {/* Page Tabs */}
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                                    <button
                                        onClick={() => setSelectedPageFilter('all')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                                            selectedPageFilter === 'all'
                                                ? 'bg-amber-600 text-white shadow-xs'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        كل الصفحات ({stats.totalPages})
                                    </button>
                                    {pagesData.map(p => (
                                        <button
                                            key={p.pageNumber}
                                            onClick={() => setSelectedPageFilter(p.pageNumber)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                                                selectedPageFilter === p.pageNumber
                                                    ? 'bg-amber-600 text-white shadow-xs'
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                        >
                                            صفحة {p.pageNumber}
                                        </button>
                                    ))}
                                </div>

                                {/* Download & Copy Actions */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleCopy}
                                        className="bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold py-2 px-3.5 rounded-xl transition-colors text-xs flex items-center gap-1.5 border border-amber-200"
                                    >
                                        {copied ? <CheckIcon className="w-4 h-4 text-emerald-600" /> : <ClipboardIcon className="w-4 h-4" />}
                                        <span>{copied ? 'تم النسخ!' : 'نسخ النص'}</span>
                                    </button>
                                    <button
                                        onClick={handleDownloadDocx}
                                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-2 px-3.5 rounded-xl transition-colors text-xs flex items-center gap-1.5 border border-blue-200"
                                    >
                                        <DocumentTextIcon className="w-4 h-4" />
                                        <span>Word (.docx)</span>
                                    </button>
                                    <button
                                        onClick={handleDownloadTxt}
                                        className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-3.5 rounded-xl transition-colors text-xs flex items-center gap-1.5"
                                    >
                                        <ArrowDownTrayIcon className="w-4 h-4" />
                                        <span>ملف نصي (.txt)</span>
                                    </button>
                                </div>
                            </div>

                            {/* Text Area */}
                            <div className="relative">
                                <textarea
                                    readOnly
                                    value={displayText}
                                    className="w-full h-96 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-800 font-sans text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500/20 select-all"
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

export default ExtractText;
