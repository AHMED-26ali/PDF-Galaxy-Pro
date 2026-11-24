import React, { useEffect, useState, useRef } from 'react';
import JSZip from 'jszip';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { ArrowDownTrayIcon, PlusIcon, XMarkIcon } from '../components/icons';

import { compressDocument, compressionError, type CompressionLevel } from './compressDocument';
import PdfPagePreview from './pdf-pages/PdfPagePreview';
import { downloadFile } from './pdfRuntime';

type BatchResult = {
    id: number;
    source: File;
} & (Awaited<ReturnType<typeof compressDocument>> | { kind: 'failed'; message: string });

const compressionLabels: Record<CompressionLevel, string> = {
    low: 'خفيف (أعلى جودة)',
    medium: 'متوازن (موصى به)',
    high: 'أقصى ضغط',
};

function downloadName(result: Extract<BatchResult, { file: Blob }>) {
    return result.kind === 'compressed' ? result.source.name.replace(/\.pdf$/i, '') + '_compressed.pdf' : result.source.name;
}

function CompressionPreview({ source, file, pages }: { source: File; file: Blob; pages: number }) {
    const [page, setPage] = useState(1);
    const [preview, setPreview] = useState<{ source: Uint8Array; output?: Uint8Array } | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;
        Promise.all([source.arrayBuffer(), file === source ? null : file.arrayBuffer()])
            .then(([before, after]) => {
                if (active) setPreview({ source: new Uint8Array(before), output: after ? new Uint8Array(after) : undefined });
            })
            .catch(() => { if (active) setFailed(true); });
        return () => { active = false; };
    }, [source, file]);

    return (
        <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-center gap-3 text-sm">
                <button type="button" onClick={() => setPage(page - 1)} disabled={page === 1} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40">السابقة</button>
                <span>صفحة {page} من {pages}</span>
                <button type="button" onClick={() => setPage(page + 1)} disabled={page === pages} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40">التالية</button>
            </div>
            {failed ? <p role="status" className="text-center text-sm text-slate-600">تعذّر فتح المعاينة.</p> : preview ? (
                <div className={preview.output ? 'grid gap-3 sm:grid-cols-2' : ''}>
                    <div>
                        <p className="mb-2 text-center text-sm font-bold text-slate-700">الأصل</p>
                        <PdfPagePreview bytes={preview.source} pageNumber={page} />
                    </div>
                    {preview.output && (
                        <div>
                            <p className="mb-2 text-center text-sm font-bold text-slate-700">بعد الضغط</p>
                            <PdfPagePreview bytes={preview.output} pageNumber={page} />
                        </div>
                    )}
                </div>
            ) : <p role="status" className="py-4 text-center text-sm text-slate-600">جاري تجهيز المعاينة…</p>}
        </div>
    );
}

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const CompressPdf: React.FC = () => {
    const [files, setFiles] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [progressStatus, setProgressStatus] = useState<string>('');
    const [progressPercent, setProgressPercent] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    const [compressionLevel, setCompressionLevel] = useState<CompressionLevel>('medium');
    const [results, setResults] = useState<BatchResult[]>([]);
    const [downloadedIds, setDownloadedIds] = useState<Set<number>>(new Set());
    const [isZipping, setIsZipping] = useState(false);
    const [previewId, setPreviewId] = useState<number | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const onFilesSelected = (selectedFiles: File[]) => {
        if (selectedFiles.length === 0) return;
        setFiles(prev => [...prev, ...selectedFiles]);
        setError(null);
        setResults([]);
    };

    const handleRemoveFile = (indexToRemove: number) => {
        setFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
    };

    const handleAddMoreFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const input: HTMLInputElement = e.currentTarget;
        onFilesSelected(Array.from(input.files ?? []));
        input.value = '';
    };

    const handleBatchCompression = async () => {
        if (files.length === 0 || isLoading) return;
        setIsLoading(true);
        setError(null);
        setResults([]);
        setPreviewId(null);
        setDownloadedIds(new Set());
        setProgressPercent(0);

        const newResults: BatchResult[] = [];
        try {
            for (const [index, file] of files.entries()) {
                setProgressStatus(`جاري معالجة الملف (${index + 1} من ${files.length}): ${file.name}`);
                const onProgress = (fraction: number) => {
                    setProgressPercent(Math.round(((index + fraction) / files.length) * 100));
                };
                try {
                    const result = await compressDocument(file, compressionLevel, onProgress);
                    newResults.push({ id: index, source: file, ...result });
                } catch (error) {
                    newResults.push({ id: index, source: file, kind: 'failed', message: compressionError(error) });
                }
                onProgress(1);
            }
            setResults(newResults);
        } finally {
            setIsLoading(false);
            setProgressStatus('');
        }
    };

    const available = results.filter(result => result.kind !== 'failed');
    const compressedCount = available.filter(result => result.kind === 'compressed').length;
    const keptCount = available.length - compressedCount;
    const failedCount = results.length - available.length;
    const totalOriginal = available.reduce((total, result) => total + result.source.size, 0);
    const totalOutput = available.reduce((total, result) => total + result.file.size, 0);
    const totalSaved = totalOriginal - totalOutput;

    const handleDownloadIndividual = (result: (typeof available)[number]) => {
        downloadFile(result.file, downloadName(result), 'application/pdf');
        setDownloadedIds(prev => new Set(prev).add(result.id));
    };

    const handleDownloadAllZip = async () => {
        if (available.length === 0 || isZipping) return;
        setIsZipping(true);
        setError(null);
        try {
            const zip = new JSZip();
            const usedNames = new Set<string>();
            for (const result of available) {
                const requested = downloadName(result).replace(/[\\/:*?"<>|]/g, '_');
                const name = requested.replace(/\.pdf$/i, '');
                let uniqueName = requested;
                for (let suffix = 2; usedNames.has(uniqueName.toLowerCase()); suffix++) {
                    uniqueName = `${name} (${suffix}).pdf`;
                }
                usedNames.add(uniqueName.toLowerCase());
                zip.file(uniqueName, await result.file.arrayBuffer());
            }
            const content = await zip.generateAsync({ type: 'blob' });
            downloadFile(content, 'ملفات_PDF.zip', 'application/zip');
            setDownloadedIds(new Set(available.map(result => result.id)));
        } catch {
            setError('تعذّر تجهيز ملف ZIP. الملفات المتاحة قابلة للتنزيل منفردة.');
        } finally {
            setIsZipping(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Initial Upload State */}
            {files.length === 0 && results.length === 0 && (
                <FileUploader 
                    onFilesSelected={onFilesSelected} 
                    multiple={true} 
                    accept=".pdf" 
                />
            )}

            {/* Loading State with Progress Bar */}
            {isLoading && (
                <div className="text-center p-8 bg-blue-50/60 rounded-3xl border border-blue-200 space-y-4">
                    <LoadingSpinner />
                    <h3 className="text-lg font-black text-slate-800">{progressStatus || 'جاري معالجة وضغط الملفات...'}</h3>
                    <div className="w-full max-w-md mx-auto bg-slate-200 rounded-full h-3 overflow-hidden shadow-inner">
                        <div 
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-200"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <p className="text-xs font-bold font-mono text-blue-700">{progressPercent}% مكتمل</p>
                </div>
            )}

            {/* Selected Files Ready for Compression */}
            {!isLoading && files.length > 0 && results.length === 0 && (
                <div className="space-y-6">
                    {/* Header Summary */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-blue-50/70 border border-blue-200 rounded-2xl">
                        <div>
                            <h3 className="text-base font-black text-slate-900">
                                الملفات المحددة للضغط: <span className="text-blue-600">({files.length} ملفات)</span>
                            </h3>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                                يمكنك إضافة المزيد من الملفات أو اختيار مستوى الضغط قبل البدء
                            </p>
                        </div>

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-blue-700 font-bold border border-blue-200 hover:bg-blue-50 shadow-xs text-xs transition-colors"
                        >
                            <PlusIcon className="w-4 h-4" />
                            <span>إضافة ملفات أخرى</span>
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            multiple
                            accept=".pdf"
                            onChange={handleAddMoreFiles}
                        />
                    </div>

                    {/* Files List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {files.map((f, index) => (
                            <div 
                                key={`${f.name}-${index}`}
                                className="relative flex items-center justify-between p-3.5 bg-slate-50 hover:bg-white rounded-2xl border border-slate-200/90 shadow-xs transition-all group"
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs shrink-0">
                                        PDF
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="text-sm font-bold text-slate-800 truncate" title={f.name}>
                                            {f.name}
                                        </p>
                                        <p className="text-xs text-slate-500 font-mono mt-0.5">
                                            {formatBytes(f.size)}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleRemoveFile(index)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                    title="حذف هذا الملف"
                                >
                                    <XMarkIcon className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Compression Level Selector */}
                    <div className="p-6 bg-slate-50/80 rounded-3xl border border-slate-200/90 max-w-lg mx-auto text-center space-y-3">
                        <h4 id="compression-level-label" className="text-sm font-bold text-slate-800">اختر مستوى الضغط لجميع الملفات</h4>
                        <div role="group" aria-labelledby="compression-level-label" className="grid grid-cols-3 gap-2.5">
                            {(Object.keys(compressionLabels) as CompressionLevel[]).map(level => (
                                <button 
                                    type="button"
                                    key={level} 
                                    aria-pressed={compressionLevel === level}
                                    onClick={() => setCompressionLevel(level)} 
                                    className={`py-3 px-3 rounded-2xl font-bold text-xs sm:text-sm transition-all ${
                                        compressionLevel === level 
                                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 scale-[1.02]' 
                                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                    }`}
                                >
                                    {compressionLabels[level]}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-slate-600">
                            {compressionLevel === 'high'
                                ? 'يقلّل دقة الصور داخل الملف بدرجة أكبر. عاين وضوح الكتابة الصغيرة والأختام المصوّرة قبل التنزيل.'
                                : compressionLevel === 'medium'
                                    ? 'يقلّل حجم الصور داخل الملف مع الحفاظ على وضوحها. يمكنك مقارنة النتيجة بالأصل في المعاينة.'
                                    : 'يحافظ على جودة أعلى لصور المستند.'}
                            {' '}يبقى النص المضمّن قابلًا للبحث، وتُحفظ النسخة الأصلية إذا لم يقل الحجم.
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 border-t border-slate-100">
                        <button
                            onClick={() => { setFiles([]); setError(null); }}
                            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-200 transition-colors"
                        >
                            إلغاء وتفريغ القائمة
                        </button>
                        <button 
                            onClick={handleBatchCompression}
                            className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-extrabold py-3.5 px-10 rounded-2xl hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 transition-all text-base flex items-center justify-center gap-2"
                        >
                            <span>بدء ضغط {files.length} ملفات دفعة واحدة</span>
                            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-mono">⚡</span>
                        </button>
                    </div>
                </div>
            )}

            {!isLoading && results.length > 0 && (
                <div className="space-y-5 animate-fade-in">
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                        <div role="status">
                            <h3 className="text-lg font-black text-slate-900">نتائج ضغط الملفات</h3>
                            <p className="mt-1 text-xs text-slate-600">مستوى الضغط · {compressionLabels[compressionLevel]}</p>
                            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-700">
                                {compressedCount > 0 && <span>تم ضغط {compressedCount}</span>}
                                {keptCount > 0 && <span>النسخة الأصلية {keptCount}</span>}
                                {failedCount > 0 && <span className="text-red-700">تعذّر الضغط {failedCount}</span>}
                                {available.length > 0 && <span>التوفير الإجمالي <b dir="ltr">{formatBytes(totalSaved)}</b></span>}
                            </p>
                        </div>
                        {available.length > 0 && (
                            <button type="button" onClick={handleDownloadAllZip} disabled={isZipping} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60">
                                <ArrowDownTrayIcon className="h-4 w-4" />
                                {isZipping ? 'جاري تجهيز ZIP…' : 'تحميل الكل (ZIP)'}
                            </button>
                        )}
                    </div>

                    <div className="space-y-3">
                        {results.map(result => (
                            <div key={result.id} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="min-w-0 space-y-1">
                                        <p className="break-all text-sm font-bold text-slate-900" dir="auto">{result.source.name}</p>
                                        {result.kind === 'failed' ? (
                                            <p className="text-sm text-red-700">{result.message}</p>
                                        ) : (
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                                <span>قبل <b dir="ltr">{formatBytes(result.source.size)}</b></span>
                                                <span>بعد <b dir="ltr">{formatBytes(result.file.size)}</b></span>
                                                {result.kind === 'compressed' ? (
                                                    <>
                                                        <span className="rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-800">توفير <b dir="ltr">{new Intl.NumberFormat('ar', { style: 'percent', maximumFractionDigits: 2 }).format((result.source.size - result.file.size) / result.source.size)}</b></span>
                                                        {result.rasterized && <span className="rounded-full bg-amber-50 px-2 py-1 font-bold text-amber-800">ضغط مصوّر: قد يفقد النص إمكانية البحث والنسخ</span>}
                                                    </>
                                                ) : (
                                                    <span className="rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-700">
                                                        {result.kind === 'signed' ? 'ملف موقّع رقميًا · تم الاحتفاظ بالأصل' : 'الحجم لم يقل · تم الاحتفاظ بالأصل'}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {result.kind !== 'failed' && (
                                        <div className="flex flex-wrap gap-2 text-sm">
                                            <button type="button" aria-expanded={previewId === result.id} onClick={() => setPreviewId(previewId === result.id ? null : result.id)} className="rounded-xl border border-slate-200 px-3 py-2 font-bold text-slate-700 hover:bg-slate-50">
                                                {previewId === result.id ? 'إغلاق المعاينة' : 'معاينة'}
                                            </button>
                                            <button type="button" onClick={() => handleDownloadIndividual(result)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 font-bold text-white hover:bg-emerald-800">
                                                <ArrowDownTrayIcon className="h-4 w-4" />
                                                {downloadedIds.has(result.id) ? 'إعادة التحميل' : result.kind === 'compressed' ? 'تحميل النسخة المضغوطة' : 'تحميل الأصل'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {previewId === result.id && result.kind !== 'failed' && <CompressionPreview source={result.source} file={result.file} pages={result.pages} />}
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-wrap justify-center gap-3 pt-2">
                        <button type="button" disabled={isZipping} onClick={() => { setResults([]); setPreviewId(null); setError(null); }} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                            تعديل القائمة أو مستوى الضغط
                        </button>
                        <button type="button" disabled={isZipping} onClick={() => { setFiles([]); setResults([]); setPreviewId(null); setError(null); }} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                            ضغط ملفات PDF جديدة
                        </button>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <p className="text-red-700 text-center bg-red-50 p-4 rounded-2xl border border-red-200 font-medium text-sm">
                    {error}
                </p>
            )}
        </div>
    );
};

export default CompressPdf;
