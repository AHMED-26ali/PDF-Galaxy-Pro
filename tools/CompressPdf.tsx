import React, { useState, useCallback, useRef } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { ArrowDownTrayIcon, PlusIcon, XMarkIcon } from '../components/icons';

declare const PDFLib: any;
declare const pdfjsLib: any;
declare const JSZip: any;
declare const download: any;

type CompressionLevel = 'low' | 'medium' | 'high';

interface CompressedResult {
    id: string;
    name: string;
    originalSize: number;
    newSize: number;
    newFile: Uint8Array;
    reductionPercentage: number;
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
    const [results, setResults] = useState<CompressedResult[]>([]);
    const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
    const [isZipping, setIsZipping] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            setFiles(prev => {
                const existingNames = new Set(prev.map(f => f.name));
                const newUnique = selectedFiles.filter(f => !existingNames.has(f.name));
                return [...prev, ...newUnique];
            });
            setError(null);
            setResults([]);
        }
    }, []);

    const handleRemoveFile = (indexToRemove: number) => {
        setFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
    };

    const handleAddMoreFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const addedFiles = Array.from(e.target.files || []);
        if (addedFiles.length > 0) {
            onFilesSelected(addedFiles);
        }
        e.target.value = '';
    };

    const compressSinglePdf = async (
        file: File, 
        level: CompressionLevel,
        onPageProgress: (page: number, total: number) => void
    ): Promise<Uint8Array> => {
        const qualityMap = {
            low: 0.92,
            medium: 0.75,
            high: 0.5,
        };
        const scale = 1.5;
        const jpegQuality = qualityMap[level];

        const { PDFDocument } = PDFLib;
        const newPdfDoc = await PDFDocument.create();
        
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdfDoc.numPages;

        for (let i = 1; i <= numPages; i++) {
            onPageProgress(i, numPages);
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            if (!context) {
                throw new Error(`تعذر معالجة الصفحة ${i}`);
            }

            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({ canvasContext: context, viewport }).promise;

            const imageDataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
            const imageBytes = await fetch(imageDataUrl).then(res => res.arrayBuffer());
            const image = await newPdfDoc.embedJpg(imageBytes);

            const newPage = newPdfDoc.addPage([viewport.width / scale, viewport.height / scale]);
            newPage.drawImage(image, {
                x: 0,
                y: 0,
                width: newPage.getWidth(),
                height: newPage.getHeight(),
            });
        }

        return await newPdfDoc.save();
    };

    const handleBatchCompression = async () => {
        if (files.length === 0) return;
        
        setIsLoading(true);
        setError(null);
        setResults([]);
        setDownloadedIds(new Set());
        setProgressPercent(0);

        const newResults: CompressedResult[] = [];
        const totalFiles = files.length;

        try {
            for (let fIdx = 0; fIdx < totalFiles; fIdx++) {
                const currentFile = files[fIdx];
                setProgressStatus(`جاري ضغط الملف (${fIdx + 1} من ${totalFiles}): ${currentFile.name}...`);

                const pdfBytes = await compressSinglePdf(
                    currentFile, 
                    compressionLevel,
                    (page, numPages) => {
                        const fileBasePercent = (fIdx / totalFiles) * 100;
                        const fileProgress = (page / numPages) * (100 / totalFiles);
                        setProgressPercent(Math.round(fileBasePercent + fileProgress));
                        setProgressStatus(`جاري ضغط (${fIdx + 1}/${totalFiles}) ${currentFile.name}: صفحة ${page} من ${numPages}`);
                    }
                );

                const reduction = Math.max(0, (((currentFile.size - pdfBytes.length) / currentFile.size) * 100));

                newResults.push({
                    id: `${currentFile.name}-${Date.now()}-${fIdx}`,
                    name: currentFile.name,
                    originalSize: currentFile.size,
                    newSize: pdfBytes.length,
                    newFile: pdfBytes,
                    reductionPercentage: parseFloat(reduction.toFixed(1)),
                });
            }

            setProgressPercent(100);
            setResults(newResults);
        } catch (e: any) {
            console.error(e);
            setError("حدث خطأ أثناء ضغط بعض الملفات. يرجى التأكد من أن الملفات غير تالفة أو محمية بكلمة سر.");
            if (newResults.length > 0) {
                setResults(newResults);
            }
        } finally {
            setIsLoading(false);
            setProgressStatus('');
        }
    };

    const handleDownloadIndividual = (item: CompressedResult) => {
        const cleanName = item.name.replace(/\.pdf$/i, '');
        download(item.newFile, `${cleanName}_compressed.pdf`, "application/pdf");
        setDownloadedIds(prev => new Set(prev).add(item.id));
    };

    const handleDownloadAllZip = async () => {
        if (results.length === 0) return;
        setIsZipping(true);
        try {
            const zip = new JSZip();
            results.forEach(res => {
                const cleanName = res.name.replace(/\.pdf$/i, '');
                zip.file(`${cleanName}_compressed.pdf`, res.newFile);
                setDownloadedIds(prev => new Set(prev).add(res.id));
            });
            const zipContent = await zip.generateAsync({ type: 'blob' });
            download(zipContent, `جميع_الملفات_المضغوطة_${Date.now()}.zip`, 'application/zip');
        } catch (err) {
            console.error('Error creating zip:', err);
        } finally {
            setIsZipping(false);
        }
    };

    const totalOriginal = results.reduce((acc, r) => acc + r.originalSize, 0);
    const totalNew = results.reduce((acc, r) => acc + r.newSize, 0);
    const totalReduction = totalOriginal > 0 
        ? (((totalOriginal - totalNew) / totalOriginal) * 100).toFixed(1) 
        : '0';

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
                        <h4 className="text-sm font-bold text-slate-800">اختر مستوى الضغط لجميع الملفات:</h4>
                        <div className="grid grid-cols-3 gap-2.5">
                            {(['low', 'medium', 'high'] as CompressionLevel[]).map(level => (
                                <button 
                                    key={level} 
                                    onClick={() => setCompressionLevel(level)} 
                                    className={`py-3 px-3 rounded-2xl font-bold text-xs sm:text-sm transition-all ${
                                        compressionLevel === level 
                                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 scale-[1.02]' 
                                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                    }`}
                                >
                                    {level === 'low' ? 'خفيف (أعلى جودة)' : level === 'medium' ? 'متوازن (موصى به)' : 'أقصى ضغط'}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-slate-500">
                            {compressionLevel === 'low' && 'يحافظ على أعلى دقة للصور مع تقليل مناسب للحجم.'}
                            {compressionLevel === 'medium' && 'توازن مثالي بين وضوح النصوص وتوفير كبير في الحجم.'}
                            {compressionLevel === 'high' && 'أقصى تخفيض ممكن لحجم الملف، مناسب للمشاركة السريعة.'}
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

            {/* Results View: Individual Download per file */}
            {!isLoading && results.length > 0 && (
                <div className="space-y-6 animate-fade-in">
                    {/* Overall Success Summary */}
                    <div className="p-6 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 rounded-3xl border border-emerald-200 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-4 text-right">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-3xl shadow-lg shadow-emerald-500/25 shrink-0">
                                ✓
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-emerald-900">
                                    تم ضغط {results.length} ملفات بنجاح!
                                </h3>
                                <p className="text-xs sm:text-sm text-emerald-800 font-medium mt-0.5">
                                    يمكنك الآن تنزيل كل ملف بشكل مفرد ومستقل عبر الزر المخصص لكل ملف أدناه.
                                </p>
                            </div>
                        </div>

                        {/* Total Stats & Download All */}
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="bg-white p-3 rounded-2xl border border-emerald-200 shadow-xs text-center min-w-[100px]">
                                <span className="text-[10px] text-slate-500 block">الإجمالي السابق</span>
                                <span className="text-sm font-bold font-mono text-slate-700">{formatBytes(totalOriginal)}</span>
                            </div>
                            <div className="bg-white p-3 rounded-2xl border border-emerald-200 shadow-xs text-center min-w-[100px]">
                                <span className="text-[10px] text-emerald-600 block">الإجمالي الجديد</span>
                                <span className="text-sm font-bold font-mono text-emerald-700">{formatBytes(totalNew)}</span>
                            </div>
                            <div className="bg-emerald-600 text-white p-3 rounded-2xl shadow-xs text-center min-w-[90px]">
                                <span className="text-[10px] text-emerald-100 block">التوفير الإجمالي</span>
                                <span className="text-sm font-black font-mono">%{totalReduction}</span>
                            </div>
                            
                            <button
                                onClick={handleDownloadAllZip}
                                disabled={isZipping}
                                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-500/25 transition-all cursor-pointer disabled:opacity-60"
                                title="تحميل كافة الملفات المضغوطة في ملف ZIP واحد"
                            >
                                <ArrowDownTrayIcon className="w-4 h-4" />
                                <span>{isZipping ? 'جاري تجهيز ZIP...' : 'تحميل الكل (ZIP)'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Files List with Individual Download Buttons */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                            <h4 className="text-sm font-black text-slate-800">
                                قائمة الملفات المضغوطة (التحميل المفرد):
                            </h4>
                            <span className="text-xs text-slate-500 font-medium">
                                تم تنزيل {downloadedIds.size} من {results.length}
                            </span>
                        </div>

                        {results.map((res, index) => {
                            const isDownloaded = downloadedIds.has(res.id);
                            return (
                                <div 
                                    key={res.id}
                                    className="p-4 bg-white hover:bg-slate-50/70 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
                                >
                                    {/* File Info & Stats */}
                                    <div className="flex items-center gap-3.5 overflow-hidden w-full sm:w-auto">
                                        <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                                            #{index + 1}
                                        </div>

                                        <div className="overflow-hidden">
                                            <p className="text-sm sm:text-base font-bold text-slate-900 truncate" title={res.name}>
                                                {res.name}
                                            </p>
                                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                                <span>قبل: <b className="font-mono text-slate-700">{formatBytes(res.originalSize)}</b></span>
                                                <span>·</span>
                                                <span>بعد: <b className="font-mono text-emerald-700">{formatBytes(res.newSize)}</b></span>
                                                <span>·</span>
                                                <span className="font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-mono text-[11px]">
                                                    توفير {res.reductionPercentage}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Individual Download Action Button */}
                                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                        <button
                                            onClick={() => handleDownloadIndividual(res)}
                                            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-xs transition-all duration-200 ${
                                                isDownloaded
                                                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20'
                                            }`}
                                        >
                                            <ArrowDownTrayIcon className="w-4 h-4" />
                                            <span>{isDownloaded ? 'تم التنزيل (إعادة التحميل)' : 'تحميل هذا الملف'}</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6 border-t border-slate-100">
                        <button
                            onClick={handleDownloadAllZip}
                            disabled={isZipping}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm shadow-md shadow-emerald-500/25 transition-all cursor-pointer disabled:opacity-60"
                        >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                            <span>{isZipping ? 'جاري تجهيز ZIP...' : 'تحميل جميع الملفات المضغوطة (ZIP)'}</span>
                        </button>

                        <button
                            onClick={() => {
                                setFiles([]);
                                setResults([]);
                                setDownloadedIds(new Set());
                                setError(null);
                            }}
                            className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-8 rounded-2xl border border-slate-200 transition-all text-sm"
                        >
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
