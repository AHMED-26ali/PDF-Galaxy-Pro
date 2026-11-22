import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { DocumentTextIcon, ArrowDownTrayIcon, ClipboardIcon, CheckIcon, SparklesIcon } from '../components/icons';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';

import { OcrStartupError, readDocumentText } from './ocrRuntime';
import { downloadFile as download, pdfError } from './pdfRuntime';
import { convertPdfLayoutToWord } from './pdfToWordLayout';

const wordMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ocrSetupMessages: Partial<Record<string, string>> = {
    'loading tesseract core': 'جاري تحميل محرّك التعرّف الضوئي…',
    'initializing tesseract': 'جاري تشغيل محرّك التعرّف الضوئي…',
    'loading language traineddata': 'جاري تحميل ملفات اللغة العربية والإنجليزية…',
    'initializing api': 'جاري تجهيز التعرّف على النص…',
};
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
    const [mode, setMode] = useState<'layout' | 'text'>('layout');

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
        setMode('layout');
    };

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            resetState();
            setFile(selectedFiles[0]);
        }
    }, []);

    const convert = async (useOcrFallback: boolean) => {
        if (!file) return;
        setNeedsOcr(false);
        setError(null);
        setIsLoading(true);
        setStatus('جاري فتح الملف…');
        try {
            if (mode === 'layout') {
                const blob = await convertPdfLayoutToWord(file, (page, count) => {
                    setStatus(`جاري تجهيز الصفحة ${page} من ${count}…`);
                    setOcrProgress(Math.round(((page - 1) / count) * 100));
                });
                setDocxBlob(blob);
                download(blob, file.name.replace(/\.pdf$/i, '') + '.docx', wordMime);
                return;
            }
            const pages = await readDocumentText(file, useOcrFallback, setStatus, message => {
                const setupStatus = ocrSetupMessages[message.status];
                if (setupStatus) setStatus(setupStatus);
                if (message.status === 'recognizing text') setOcrProgress(Math.round(message.progress * 100));
            });
            if (!pages) {
                setNeedsOcr(true);
                return;
            }
            if (!pages.some(Boolean)) {
                setError('لم يتم العثور على نص مقروء لتحويله إلى Word.');
                return;
            }

            setStatus('جاري إنشاء مستند Word…');
            const paragraphs = pages.flatMap((page, pageIndex) => page.split('\n').map((text, lineIndex) => {
                const rightToLeft = /[\u0600-\u08ff]/.test(text);
                return new Paragraph({
                    pageBreakBefore: pageIndex > 0 && lineIndex === 0,
                    alignment: rightToLeft ? AlignmentType.RIGHT : AlignmentType.LEFT,
                    bidirectional: rightToLeft,
                    children: [new TextRun({ text, font: 'Arial', rightToLeft })],
                });
            }));
            const blob = await Packer.toBlob(new Document({ sections: [{ children: paragraphs }] }));
            setDocxBlob(blob);
            setExtractedText(pages.join('\n\n'));
            download(blob, file.name.replace(/\.pdf$/i, '') + '.docx', wordMime);
        } catch (error) {
            if (error instanceof OcrStartupError) {
                setError(error.message);
                if (useOcrFallback) setNeedsOcr(true);
            } else {
                setError(pdfError(error, 'تعذّر تحويل الملف إلى Word. تأكد من سلامة ملف PDF.'));
            }
        } finally {
            setIsLoading(false);
            setStatus('');
            setOcrProgress(0);
        }
    };

    const handleCopy = async () => {
        if (!extractedText) return;
        try {
            await navigator.clipboard.writeText(extractedText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setError('تعذّر النسخ إلى الحافظة. يمكنك تنزيل مستند Word.');
        }
    };

    const handleManualDownload = () => {
        if (!docxBlob || !file) return;
        const cleanName = file.name.replace(/\.pdf$/i, '') + '.docx';
        download(docxBlob, cleanName, wordMime);
    };

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col items-center justify-center p-8 bg-white rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto">
                    <LoadingSpinner />
                    <p role="status" className="text-base font-bold text-slate-800 mt-4">{status}</p>
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
                        <button onClick={() => { setNeedsOcr(false); setError(null); }} className="bg-white text-slate-700 font-bold py-2.5 px-6 rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors text-sm">
                            تغيير طريقة التحويل
                        </button>
                        <button onClick={() => convert(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-2.5 px-7 rounded-2xl shadow-md shadow-blue-500/20 hover:opacity-95 transition-opacity text-sm flex items-center gap-2">
                            <SparklesIcon className="w-4 h-4" />
                            بدء المسح الضوئي والتحويل لـ Word
                        </button>
                    </div>
                </div>
            );
        }

        if (docxBlob) {
            return (
                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-emerald-200 shadow-sm max-w-2xl mx-auto text-center space-y-6 animate-fade-in">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto text-3xl">
                        ✓
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-800">تم التحويل بنجاح إلى مستند Word!</h3>
                        <p className="text-slate-500 text-sm mt-1">
                            ملف <span className="font-bold text-slate-700">{file?.name}</span> جاهز بصيغة <span className="font-mono font-bold text-emerald-600">.docx</span>
                        </p>
                        {mode === 'layout' && <p className="mt-2 text-sm text-slate-600">تم إدراج كل صفحة كصورة عالية الدقة بنفس ترتيب الملف الأصلي.</p>}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                        <button
                            onClick={handleManualDownload}
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 px-8 rounded-2xl shadow-lg shadow-blue-500/25 hover:opacity-95 transition-all text-sm flex items-center gap-2"
                        >
                            <ArrowDownTrayIcon className="w-5 h-5" />
                            تحميل ملف Word (.docx)
                        </button>
                        {extractedText && <button
                            onClick={handleCopy}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-6 rounded-2xl transition-colors text-sm flex items-center gap-2 border border-slate-200"
                        >
                            {copied ? <CheckIcon className="w-5 h-5 text-emerald-600" /> : <ClipboardIcon className="w-5 h-5" />}
                            {copied ? 'تم النسخ!' : 'نسخ النص'}
                        </button>}
                        <button
                            type="button"
                            onClick={() => { setDocxBlob(null); setExtractedText(null); setCopied(false); setError(null); }}
                            className="rounded-2xl border border-slate-200 px-5 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                        >
                            تغيير طريقة التحويل
                        </button>
                        <button
                            onClick={resetState}
                            className="bg-white hover:bg-slate-50 text-slate-500 font-bold py-3.5 px-5 rounded-2xl transition-colors text-sm border border-slate-200"
                        >
                            تحويل ملف آخر
                        </button>
                    </div>

                    {/* Extracted text preview */}
                    {extractedText && <div className="text-right pt-4 border-t border-slate-100">
                        <p className="text-xs font-bold text-slate-500 mb-2">معاينة النص المستخرج:</p>
                        <div className="max-h-48 overflow-y-auto bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-700 leading-relaxed font-sans whitespace-pre-wrap select-all">
                            {extractedText.slice(0, 1000)}
                            {extractedText.length > 1000 ? '...' : ''}
                        </div>
                    </div>}
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
                <fieldset className="space-y-2 text-start">
                    <legend className="mb-2 text-sm font-bold text-slate-800">طريقة التحويل</legend>
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50">
                        <input type="radio" name="pdf-to-word-mode" checked={mode === 'layout'} onChange={() => setMode('layout')} className="mt-1 accent-blue-600" />
                        <span>
                            <span className="block text-sm font-bold text-slate-800">الحفاظ على شكل الصفحة</span>
                            <span className="mt-1 block text-xs leading-relaxed text-slate-600">تظهر الجداول والصور والأختام في مكانها. تُدرج كل صفحة كصورة عالية الدقة، ويظل النص جزءًا من الصورة.</span>
                        </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50">
                        <input type="radio" name="pdf-to-word-mode" checked={mode === 'text'} onChange={() => setMode('text')} className="mt-1 accent-blue-600" />
                        <span>
                            <span className="block text-sm font-bold text-slate-800">استخراج نص قابل للتعديل</span>
                            <span className="mt-1 block text-xs leading-relaxed text-slate-600">يُحوّل النص إلى فقرات Word، مع إمكانية التعرف الضوئي على الملفات الممسوحة.</span>
                        </span>
                    </label>
                </fieldset>
                <div className="flex flex-wrap justify-center gap-3 pt-2">
                    <button
                        onClick={resetState}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-2xl text-sm transition-colors"
                    >
                        تغيير الملف
                    </button>
                    <button
                        onClick={() => convert(false)}
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
