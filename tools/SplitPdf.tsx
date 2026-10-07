import React, { useState, useCallback, useRef } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { ArrowDownTrayIcon, PlusIcon, XMarkIcon, CheckIcon, ArchiveBoxArrowDownIcon, DocumentDuplicateIcon } from '../components/icons';

declare const PDFLib: any;
declare const JSZip: any;
declare const download: any;

interface SplitPageResult {
    id: string;
    fileName: string;
    sourceFileName: string;
    pageNumber: number;
    totalDocumentPages: number;
    bytes: Uint8Array;
    size: number;
}

interface DocumentSplitGroup {
    documentName: string;
    totalPages: number;
    pages: SplitPageResult[];
}

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * Robust download helper using downloadjs with native Blob fallback
 */
const triggerDownload = (data: Blob | Uint8Array, fileName: string, mimeType: string) => {
    try {
        if (typeof download === 'function') {
            download(data, fileName, mimeType);
            return;
        }
    } catch (e) {
        console.warn('Native download fallback triggered:', e);
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 250);
};

const SplitPdf: React.FC = () => {
    const [files, setFiles] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isZipping, setIsZipping] = useState(false);
    const [zippingGroupId, setZippingGroupId] = useState<string | null>(null);
    const [isDownloadingAllSequential, setIsDownloadingAllSequential] = useState(false);
    const [sequentialStatus, setSequentialStatus] = useState<string>('');
    const [progressStatus, setProgressStatus] = useState<string>('');
    const [progressPercent, setProgressPercent] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    const [groups, setGroups] = useState<DocumentSplitGroup[]>([]);
    const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

    const fileInputRef = useRef<HTMLInputElement>(null);

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            setFiles(prev => {
                const existingNames = new Set(prev.map(f => f.name));
                const newUnique = selectedFiles.filter(f => !existingNames.has(f.name));
                return [...prev, ...newUnique];
            });
            setError(null);
            setGroups([]);
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

    const handleBatchSplit = async () => {
        if (files.length === 0) {
            setError("يرجى اختيار ملف PDF واحد على الأقل.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setGroups([]);
        setDownloadedIds(new Set());
        setProgressPercent(0);

        const newGroups: DocumentSplitGroup[] = [];
        const totalFiles = files.length;

        try {
            const { PDFDocument } = PDFLib;

            for (let fIdx = 0; fIdx < totalFiles; fIdx++) {
                const currentFile = files[fIdx];
                const cleanDocName = currentFile.name.replace(/\.pdf$/i, '');
                setProgressStatus(`جاري قراءة ملف (${fIdx + 1} من ${totalFiles}): ${currentFile.name}...`);

                const arrayBuffer = await currentFile.arrayBuffer();
                const originalPdf = await PDFDocument.load(arrayBuffer);
                const pageCount = originalPdf.getPageCount();

                const documentPages: SplitPageResult[] = [];

                for (let pIdx = 0; pIdx < pageCount; pIdx++) {
                    const currentOverallProgress = Math.round(
                        ((fIdx / totalFiles) * 100) + ((pIdx / pageCount) * (100 / totalFiles))
                    );
                    setProgressPercent(currentOverallProgress);
                    setProgressStatus(`جاري استخراج (${fIdx + 1}/${totalFiles}) ${currentFile.name}: صفحة ${pIdx + 1} من ${pageCount}`);

                    const newPdf = await PDFDocument.create();
                    const [copiedPage] = await newPdf.copyPages(originalPdf, [pIdx]);
                    newPdf.addPage(copiedPage);
                    const pdfBytes = await newPdf.save();

                    documentPages.push({
                        id: `${currentFile.name}-p${pIdx + 1}-${Date.now()}-${Math.random()}`,
                        fileName: `${cleanDocName}_صفحة_${pIdx + 1}.pdf`,
                        sourceFileName: currentFile.name,
                        pageNumber: pIdx + 1,
                        totalDocumentPages: pageCount,
                        bytes: pdfBytes,
                        size: pdfBytes.length,
                    });
                }

                newGroups.push({
                    documentName: currentFile.name,
                    totalPages: pageCount,
                    pages: documentPages,
                });
            }

            setProgressPercent(100);
            setGroups(newGroups);
        } catch (e: any) {
            console.error(e);
            setError("حدث خطأ أثناء تقسيم بعض الملفات. يرجى التأكد من أن الملفات غير محمية أو تالفة.");
            if (newGroups.length > 0) {
                setGroups(newGroups);
            }
        } finally {
            setIsLoading(false);
            setProgressStatus('');
        }
    };

    const handleDownloadSinglePage = (pageItem: SplitPageResult) => {
        triggerDownload(pageItem.bytes, pageItem.fileName, "application/pdf");
        setDownloadedIds(prev => new Set(prev).add(pageItem.id));
    };

    // Download ALL split pages from all files as a single ZIP archive
    const handleDownloadAllZip = async () => {
        if (groups.length === 0) return;
        setIsZipping(true);
        try {
            const zip = new JSZip();
            groups.forEach(group => {
                const folderName = groups.length > 1 ? group.documentName.replace(/\.pdf$/i, '') : null;
                group.pages.forEach(p => {
                    if (folderName) {
                        zip.folder(folderName).file(p.fileName, p.bytes);
                    } else {
                        zip.file(p.fileName, p.bytes);
                    }
                    setDownloadedIds(prev => new Set(prev).add(p.id));
                });
            });

            const zipContent = await zip.generateAsync({ type: 'blob' });
            triggerDownload(zipContent, `جميع_الصفحات_المقسمة_${Date.now()}.zip`, 'application/zip');
        } catch (err) {
            console.error('Error generating zip:', err);
            setError('حدث خطأ أثناء تجميع الملفات في ملف ZIP.');
        } finally {
            setIsZipping(false);
        }
    };

    // Download ALL split pages sequentially as individual PDF files
    const handleDownloadAllSequentialPdf = async () => {
        const allPages: SplitPageResult[] = groups.flatMap(g => g.pages);
        if (allPages.length === 0) return;
        
        setIsDownloadingAllSequential(true);
        try {
            for (let i = 0; i < allPages.length; i++) {
                const pageItem = allPages[i];
                setSequentialStatus(`جاري تحميل (${i + 1} من ${allPages.length}): ${pageItem.fileName}`);
                triggerDownload(pageItem.bytes, pageItem.fileName, "application/pdf");
                setDownloadedIds(prev => new Set(prev).add(pageItem.id));
                if (i < allPages.length - 1) {
                    await new Promise(res => setTimeout(res, 260));
                }
            }
        } finally {
            setIsDownloadingAllSequential(false);
            setSequentialStatus('');
        }
    };

    // Download pages for a specific document group in a ZIP archive
    const handleDownloadGroupZip = async (group: DocumentSplitGroup) => {
        setZippingGroupId(group.documentName);
        try {
            const zip = new JSZip();
            group.pages.forEach(p => {
                zip.file(p.fileName, p.bytes);
                setDownloadedIds(prev => new Set(prev).add(p.id));
            });
            const zipContent = await zip.generateAsync({ type: 'blob' });
            const cleanName = group.documentName.replace(/\.pdf$/i, '');
            triggerDownload(zipContent, `${cleanName}_جميع_الصفحات.zip`, 'application/zip');
        } catch (err) {
            console.error('Error generating group zip:', err);
        } finally {
            setZippingGroupId(null);
        }
    };

    // Download pages for a specific document group sequentially as individual PDFs
    const handleDownloadGroupSequentialPdf = async (group: DocumentSplitGroup) => {
        for (let i = 0; i < group.pages.length; i++) {
            const p = group.pages[i];
            triggerDownload(p.bytes, p.fileName, "application/pdf");
            setDownloadedIds(prev => new Set(prev).add(p.id));
            if (i < group.pages.length - 1) {
                await new Promise(res => setTimeout(res, 250));
            }
        }
    };

    const totalExtractedPages = groups.reduce((acc, g) => acc + g.pages.length, 0);

    return (
        <div className="space-y-8 animate-fade-in relative pb-12">
            {/* Initial Upload State */}
            {files.length === 0 && groups.length === 0 && (
                <FileUploader 
                    onFilesSelected={onFilesSelected} 
                    multiple={true} 
                    accept=".pdf" 
                />
            )}

            {/* Loading State with Progress Bar */}
            {isLoading && (
                <div className="text-center p-8 bg-blue-50/70 rounded-3xl border border-blue-200 space-y-4">
                    <LoadingSpinner />
                    <h3 className="text-lg font-black text-slate-800">{progressStatus || 'جاري تقسيم الملفات واستخراج الصفحات...'}</h3>
                    <div className="w-full max-w-md mx-auto bg-slate-200 rounded-full h-3 overflow-hidden shadow-inner">
                        <div 
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-200"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <p className="text-xs font-bold font-mono text-blue-700">{progressPercent}% مكتمل</p>
                </div>
            )}

            {/* Files Selected - Ready to Split */}
            {!isLoading && files.length > 0 && groups.length === 0 && (
                <div className="space-y-6">
                    {/* Header Summary */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl">
                        <div>
                            <h3 className="text-base sm:text-lg font-black text-slate-900">
                                الملفات المحددة للتقسيم: <span className="text-blue-600">({files.length} ملفات)</span>
                            </h3>
                            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
                                سيتم تقسيم واستخراج كل صفحة إلى ملف PDF مستقل، مع توفير زر لتحميل كل ما تم تقسيمه دفعة واحدة أو التحميل المفرد.
                            </p>
                        </div>

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-blue-700 font-bold border border-blue-200 hover:bg-blue-50 shadow-xs text-xs sm:text-sm transition-colors shrink-0"
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

                    {/* Files Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {files.map((f, index) => (
                            <div 
                                key={`${f.name}-${index}`}
                                className="relative flex items-center justify-between p-3.5 bg-slate-50 hover:bg-white rounded-2xl border border-slate-200/90 shadow-xs transition-all group"
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
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

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 border-t border-slate-100">
                        <button
                            onClick={() => { setFiles([]); setError(null); }}
                            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-200 transition-colors text-sm"
                        >
                            إلغاء وتفريغ القائمة
                        </button>
                        <button 
                            onClick={handleBatchSplit}
                            className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-extrabold py-3.5 px-10 rounded-2xl hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 transition-all text-base flex items-center justify-center gap-2"
                        >
                            <span>بدء تقسيم {files.length} ملفات الآن</span>
                            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-mono">✂️</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Results View: Dedicated Buttons to Download Everything That Was Split */}
            {!isLoading && groups.length > 0 && (
                <div className="space-y-8 animate-fade-in">
                    
                    {/* PRIMARY HERO CARD FOR DOWNLOADING EVERYTHING */}
                    <div className="p-6 sm:p-8 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 rounded-3xl text-white shadow-xl shadow-blue-500/20 relative overflow-hidden">
                        {/* Decorative background shape */}
                        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-44 h-44 bg-purple-500/20 rounded-full blur-2xl pointer-events-none" />
                        
                        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                            <div className="space-y-2">
                                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-black">
                                    <CheckIcon className="w-4 h-4 text-emerald-300 stroke-[3]" />
                                    <span>تم الانتهاء بنجاح</span>
                                </div>
                                <h3 className="text-2xl sm:text-3xl font-black tracking-tight">
                                    تم تقسيم {groups.length} مستندات إلى {totalExtractedPages} صفحات!
                                </h3>
                                <p className="text-blue-100 text-sm sm:text-base max-w-2xl font-medium">
                                    استخدم الأزرار أدناه لتحميل كل ما تم تقسيمه دفعة واحدة، أو تصفح القائمة لتحميل الصفحات مفردة.
                                </p>
                            </div>

                            {/* PROMINENT "DOWNLOAD ALL" BUTTONS */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0">
                                {/* 1. Download ALL as ZIP */}
                                <button
                                    onClick={handleDownloadAllZip}
                                    disabled={isZipping || isDownloadingAllSequential}
                                    className="inline-flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-white hover:bg-slate-50 text-blue-700 font-black text-sm sm:text-base shadow-lg hover:shadow-xl transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                                    title="تحميل كافة الصفحات المقسمة في ملف مضغوط ZIP واحد"
                                >
                                    {isZipping ? (
                                        <>
                                            <LoadingSpinner />
                                            <span>جاري تجهيز ملف ZIP...</span>
                                        </>
                                    ) : (
                                        <>
                                            <ArchiveBoxArrowDownIcon className="w-5 h-5 text-blue-600" />
                                            <span>تحميل كل ما تم تقسيمه (ZIP)</span>
                                        </>
                                    )}
                                </button>

                                {/* 2. Download ALL directly as PDF files */}
                                <button
                                    onClick={handleDownloadAllSequentialPdf}
                                    disabled={isZipping || isDownloadingAllSequential}
                                    className="inline-flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-blue-500/40 hover:bg-blue-500/60 border border-white/30 text-white font-bold text-sm sm:text-base backdrop-blur-md transition-all cursor-pointer disabled:opacity-60"
                                    title="تحميل كل الصفحات المقسمة كملفات PDF مفردة مباشرة إلى مجلد التنزيلات"
                                >
                                    {isDownloadingAllSequential ? (
                                        <>
                                            <LoadingSpinner />
                                            <span className="text-xs">{sequentialStatus || 'جاري التنزيل...'}</span>
                                        </>
                                    ) : (
                                        <>
                                            <ArrowDownTrayIcon className="w-5 h-5" />
                                            <span>تحميل الكل كـ PDFs مباشرة</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Status bar */}
                        <div className="mt-6 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-3 text-xs text-blue-100">
                            <div className="flex items-center gap-4">
                                <span>📄 إجمالي الصفحات المستخرجة: <b className="text-white font-mono">{totalExtractedPages}</b></span>
                                <span>·</span>
                                <span>✅ تم تنزيل: <b className="text-emerald-300 font-mono">{downloadedIds.size}</b> من <b className="text-white font-mono">{totalExtractedPages}</b></span>
                            </div>
                            <span className="bg-white/10 px-3 py-1 rounded-full text-[11px]">
                                يمكنك أيضاً تنزيل أي صفحة بشكل مفرد من القائمة أدناه 👇
                            </span>
                        </div>
                    </div>

                    {/* Groups by Document */}
                    {groups.map((group, gIdx) => {
                        const isGroupZipping = zippingGroupId === group.documentName;
                        return (
                            <div 
                                key={`${group.documentName}-${gIdx}`}
                                className="bg-slate-50/80 p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-5"
                            >
                                {/* Document Header with Group Download Actions */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                                    <div className="flex items-center gap-3">
                                        <span className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center">
                                            #{gIdx + 1}
                                        </span>
                                        <div>
                                            <h4 className="text-base font-extrabold text-slate-900" title={group.documentName}>
                                                {group.documentName}
                                            </h4>
                                            <span className="text-xs text-slate-500 font-medium">
                                                عدد صفحات هذا الملف: <b className="text-blue-600">{group.totalPages}</b> صفحة
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action to download this document's pages in one ZIP or PDFs */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            onClick={() => handleDownloadGroupZip(group)}
                                            disabled={isGroupZipping}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200 shadow-xs transition-colors cursor-pointer"
                                            title="تحميل كل صفحات هذا المستند في ملف ZIP"
                                        >
                                            <ArchiveBoxArrowDownIcon className="w-4 h-4 text-blue-600" />
                                            <span>{isGroupZipping ? 'جاري التحميل...' : `تحميل صفحات الملف (${group.pages.length}) كـ ZIP`}</span>
                                        </button>

                                        <button
                                            onClick={() => handleDownloadGroupSequentialPdf(group)}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 shadow-xs transition-colors cursor-pointer"
                                            title="تحميل صفحات هذا المستند كملفات PDF مفردة مباشرة"
                                        >
                                            <ArrowDownTrayIcon className="w-4 h-4" />
                                            <span>تنزيل صفحاته كـ PDFs</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Individual Pages Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                    {group.pages.map((pItem) => {
                                        const isDownloaded = downloadedIds.has(pItem.id);
                                        return (
                                            <div 
                                                key={pItem.id}
                                                className="p-3.5 bg-white hover:bg-slate-50 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3 transition-all"
                                            >
                                                <div className="overflow-hidden">
                                                    <p className="text-sm font-bold text-slate-800 truncate" title={pItem.fileName}>
                                                        صفحة {pItem.pageNumber} من {pItem.totalDocumentPages}
                                                    </p>
                                                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                                                        {formatBytes(pItem.size)}
                                                    </p>
                                                </div>

                                                <button
                                                    onClick={() => handleDownloadSinglePage(pItem)}
                                                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                                        isDownloaded
                                                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                                                    }`}
                                                    title="تنزيل هذه الصفحة بشكل مفرد كملف PDF"
                                                >
                                                    {isDownloaded ? (
                                                        <>
                                                            <CheckIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                                                            <span>تم التحميل</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                                                            <span>تحميل</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {/* SECONDARY BOTTOM ACTION BLOCK WITH DOWNLOAD ALL & RESET BUTTONS */}
                    <div className="p-6 bg-gradient-to-r from-slate-100 to-blue-50/50 rounded-3xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                            <h4 className="text-base font-extrabold text-slate-800">
                                هل انتهيت من استعراض الصفحات؟
                            </h4>
                            <p className="text-xs text-slate-500 font-medium">
                                يمكنك بنقرة واحدة تحميل كل ما تم تقسيمه ({totalExtractedPages} صفحة)
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
                            {/* DOWNLOAD ALL ZIP (BOTTOM) */}
                            <button
                                onClick={handleDownloadAllZip}
                                disabled={isZipping || isDownloadingAllSequential}
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-sm shadow-md shadow-blue-500/25 transition-all cursor-pointer disabled:opacity-60"
                                title="تحميل كافة الصفحات المقسمة في ملف مضغوط واحد"
                            >
                                <ArchiveBoxArrowDownIcon className="w-4 h-4" />
                                <span>تحميل كل المقسم في ملف ZIP</span>
                            </button>

                            {/* DOWNLOAD ALL INDIVIDUAL PDFS (BOTTOM) */}
                            <button
                                onClick={handleDownloadAllSequentialPdf}
                                disabled={isZipping || isDownloadingAllSequential}
                                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm border border-slate-200 shadow-xs transition-all cursor-pointer disabled:opacity-60"
                                title="تحميل كل الصفحات المقسمة كملفات PDF مستقلة دفعة واحدة"
                            >
                                <ArrowDownTrayIcon className="w-4 h-4 text-blue-600" />
                                <span>تحميل الكل كـ PDFs</span>
                            </button>

                            {/* RESET / NEW SPLIT */}
                            <button
                                onClick={() => {
                                    setFiles([]);
                                    setGroups([]);
                                    setDownloadedIds(new Set());
                                    setError(null);
                                }}
                                className="px-5 py-3 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm transition-all"
                            >
                                تقسيم ملفات أخرى
                            </button>
                        </div>
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

export default SplitPdf;
