import React, { useState, useCallback, useRef } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import JSZip from 'jszip';
import { 
    RectangleStackIcon, 
    ArrowDownTrayIcon, 
    ArchiveBoxArrowDownIcon, 
    PhotoIcon, 
    DocumentDuplicateIcon, 
    ClipboardIcon, 
    CheckIcon, 
    SparklesIcon, 
    XMarkIcon,
    EyeIcon
} from '../components/icons';

declare const pdfjsLib: any;
declare const download: any;

type ImageFormat = 'png' | 'jpeg' | 'webp';
type QualityScale = 1 | 2 | 3;

interface ExtractedPage {
    id: string;
    pageNumber: number;
    pdfFileName: string;
    dataUrl: string;
    blob: Blob;
    width: number;
    height: number;
    sizeFormatted: string;
}

const PdfToImage: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [progressPercent, setProgressPercent] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Settings
    const [imageFormat, setImageFormat] = useState<ImageFormat>('png');
    const [qualityScale, setQualityScale] = useState<QualityScale>(2);
    const [pageRangeMode, setPageRangeMode] = useState<'all' | 'custom'>('all');
    const [customRangeText, setCustomRangeText] = useState<string>('');

    // Extracted pages state
    const [extractedPages, setExtractedPages] = useState<ExtractedPage[]>([]);
    const [selectedPageForModal, setSelectedPageForModal] = useState<ExtractedPage | null>(null);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const resetState = () => {
        setFile(null);
        setTotalPages(0);
        setIsLoading(false);
        setLoadingMessage('');
        setProgressPercent(null);
        setError(null);
        setSuccessMessage(null);
        setExtractedPages([]);
        setSelectedPageForModal(null);
        setCopiedIndex(null);
        setCustomRangeText('');
    };

    const onFilesSelected = useCallback(async (selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            const selectedPdf = selectedFiles[0];
            resetState();
            setFile(selectedPdf);

            // Peek at page count
            try {
                const arrayBuffer = await selectedPdf.arrayBuffer();
                const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
                setTotalPages(pdfDoc.numPages);
            } catch (err: any) {
                console.error(err);
                setError('تعذر قراءة ملف PDF. تأكد من أن الملف سليم وغير محمي بكلمة مرور.');
            }
        }
    }, []);

    // Parse custom page ranges (e.g. "1, 3-5, 8")
    const getTargetPagesList = (maxPages: number): number[] => {
        if (pageRangeMode === 'all' || !customRangeText.trim()) {
            return Array.from({ length: maxPages }, (_, i) => i + 1);
        }

        const pagesSet = new Set<number>();
        const parts = customRangeText.split(/[,،]/);

        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.includes('-')) {
                const [startStr, endStr] = trimmed.split('-');
                const start = parseInt(startStr, 10);
                const end = parseInt(endStr, 10);
                if (!isNaN(start) && !isNaN(end)) {
                    const min = Math.max(1, Math.min(start, end));
                    const max = Math.min(maxPages, Math.max(start, end));
                    for (let p = min; p <= max; p++) {
                        pagesSet.add(p);
                    }
                }
            } else {
                const pageNum = parseInt(trimmed, 10);
                if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
                    pagesSet.add(pageNum);
                }
            }
        }

        const sorted = Array.from(pagesSet).sort((a, b) => a - b);
        return sorted.length > 0 ? sorted : Array.from({ length: maxPages }, (_, i) => i + 1);
    };

    // Main conversion routine: extracts pages into images
    const handleExtractPages = async () => {
        if (!file) {
            setError('يرجى اختيار ملف PDF أولاً.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setExtractedPages([]);
        setLoadingMessage('جاري تحميل وقراءة صفحات مستند PDF...');
        setProgressPercent(5);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            const numPages = pdfDoc.numPages;
            setTotalPages(numPages);

            const targetPages = getTargetPagesList(numPages);
            const extractedResults: ExtractedPage[] = [];

            const mimeType = imageFormat === 'jpeg' ? 'image/jpeg' : imageFormat === 'webp' ? 'image/webp' : 'image/png';
            const qualityRatio = imageFormat === 'jpeg' || imageFormat === 'webp' ? 0.92 : undefined;

            for (let idx = 0; idx < targetPages.length; idx++) {
                const pageNum = targetPages[idx];
                const currentPercent = Math.round(10 + ((idx + 1) / targetPages.length) * 80);
                setLoadingMessage(`جاري تحويل الصفحة ${pageNum} من ${numPages} (${idx + 1} من ${targetPages.length})...`);
                setProgressPercent(currentPercent);

                const page = await pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: qualityScale });

                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const context = canvas.getContext('2d');

                if (!context) {
                    throw new Error('فشل إنشاء سياق الرسم للصفحة.');
                }

                // White background for JPEG / standard readability
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, canvas.width, canvas.height);

                await page.render({ canvasContext: context, viewport }).promise;

                const dataUrl = canvas.toDataURL(mimeType, qualityRatio);
                const blob = await (await fetch(dataUrl)).blob();

                extractedResults.push({
                    id: `page-${pageNum}-${Date.now()}-${Math.random()}`,
                    pageNumber: pageNum,
                    pdfFileName: file.name,
                    dataUrl,
                    blob,
                    width: Math.round(viewport.width),
                    height: Math.round(viewport.height),
                    sizeFormatted: formatBytes(blob.size)
                });
            }

            setExtractedPages(extractedResults);
            setProgressPercent(100);
            setSuccessMessage(`تم تحويل ${extractedResults.length} صفحة بنجاح إلى صور فائقة الدقة! يمكنك الآن اختيار طريقة التحميل.`);
        } catch (err: any) {
            console.error(err);
            setError(`حدث خطأ أثناء تحويل الملف: ${err?.message || 'تأكد من أن الملف سليم'}`);
        } finally {
            setIsLoading(false);
            setProgressPercent(null);
        }
    };

    // Action 1: Download all extracted images packed in a ZIP archive (.zip)
    const handleDownloadZip = async () => {
        if (extractedPages.length === 0) return;
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setLoadingMessage('جاري ضغط الصور وحفظها في أرشيف ZIP...');
        setProgressPercent(15);

        try {
            const zip = new JSZip();
            const baseDocName = file ? file.name.replace(/\.pdf$/i, '').trim() : 'document_pages';

            for (let i = 0; i < extractedPages.length; i++) {
                const page = extractedPages[i];
                const pageFileName = `${baseDocName}_page_${String(page.pageNumber).padStart(2, '0')}.${imageFormat}`;
                zip.file(pageFileName, page.blob);
                setProgressPercent(Math.round(20 + ((i + 1) / extractedPages.length) * 60));
            }

            setLoadingMessage('جاري إنشاء ملف ZIP المضغوط للتحميل...');
            const zipBlob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });

            download(zipBlob, `${baseDocName}_images_bundle.zip`, 'application/zip');
            setProgressPercent(100);
            setSuccessMessage(`تم إنشاء وتحميل ملف الـ ZIP المضغوط (${extractedPages.length} صورة) بنجاح!`);
        } catch (err: any) {
            console.error(err);
            setError(`فشل في إنشاء ملف ZIP: ${err?.message || 'خطأ'}`);
        } finally {
            setIsLoading(false);
            setProgressPercent(null);
        }
    };

    // Action 2: Download as ONE combined merged image (Stitched vertical strip)
    const handleDownloadCombinedStitchedImage = async () => {
        if (extractedPages.length === 0) return;
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setLoadingMessage('جاري دمج جميع صفحات الصور في صورة مدمجة واحدة فائقة الطول...');
        setProgressPercent(20);

        try {
            // Calculate total height and max width
            const maxWidth = Math.max(...extractedPages.map(p => p.width));
            const totalHeight = extractedPages.reduce((sum, p) => sum + p.height, 0);

            const canvas = document.createElement('canvas');
            canvas.width = maxWidth;
            canvas.height = totalHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                throw new Error('تعذر إنشاء سياق رسم للصورة المدمجة.');
            }

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            let currentY = 0;
            for (let i = 0; i < extractedPages.length; i++) {
                const page = extractedPages[i];
                setLoadingMessage(`جاري دمج صفحة ${page.pageNumber} (${i + 1} من ${extractedPages.length})...`);
                
                // Load image into HTMLImageElement
                const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const el = new Image();
                    el.onload = () => resolve(el);
                    el.onerror = reject;
                    el.src = page.dataUrl;
                });

                // Center if width is less than maxWidth
                const xOffset = Math.round((maxWidth - page.width) / 2);
                ctx.drawImage(img, xOffset, currentY, page.width, page.height);
                currentY += page.height;

                setProgressPercent(Math.round(25 + ((i + 1) / extractedPages.length) * 65));
            }

            const mimeType = imageFormat === 'jpeg' ? 'image/jpeg' : imageFormat === 'webp' ? 'image/webp' : 'image/png';
            const combinedDataUrl = canvas.toDataURL(mimeType, 0.92);
            const combinedBlob = await (await fetch(combinedDataUrl)).blob();

            const baseDocName = file ? file.name.replace(/\.pdf$/i, '').trim() : 'document';
            download(combinedBlob, `${baseDocName}_combined_merged_image.${imageFormat}`, mimeType);

            setProgressPercent(100);
            setSuccessMessage(`تم دمج جميع الصور في ملف صورة واحدة مدمجة (${extractedPages.length} صفحة) بنجاح!`);
        } catch (err: any) {
            console.error(err);
            setError(`فشل في إنشاء الصورة المدمجة: ${err?.message || 'خطأ'}`);
        } finally {
            setIsLoading(false);
            setProgressPercent(null);
        }
    };

    // Action 3: Download a single page image
    const handleDownloadSingleImage = (page: ExtractedPage) => {
        const baseDocName = file ? file.name.replace(/\.pdf$/i, '').trim() : 'page';
        const mimeType = imageFormat === 'jpeg' ? 'image/jpeg' : imageFormat === 'webp' ? 'image/webp' : 'image/png';
        download(page.blob, `${baseDocName}_page_${page.pageNumber}.${imageFormat}`, mimeType);
        setSuccessMessage(`تم تحميل صورة الصفحة ${page.pageNumber} بنجاح!`);
    };

    // Action 4: Download all individual images one by one
    const handleDownloadAllIndividual = async () => {
        if (extractedPages.length === 0) return;
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const baseDocName = file ? file.name.replace(/\.pdf$/i, '').trim() : 'page';
            const mimeType = imageFormat === 'jpeg' ? 'image/jpeg' : imageFormat === 'webp' ? 'image/webp' : 'image/png';

            for (let i = 0; i < extractedPages.length; i++) {
                const page = extractedPages[i];
                setLoadingMessage(`جاري تنزيل الصورة ${i + 1} من ${extractedPages.length} (صفحة ${page.pageNumber})...`);
                download(page.blob, `${baseDocName}_page_${page.pageNumber}.${imageFormat}`, mimeType);
                await new Promise(r => setTimeout(r, 450));
            }

            setSuccessMessage(`تم تحميل جميع الصور المنفردة (${extractedPages.length} صورة) بنجاح!`);
        } catch (err: any) {
            console.error(err);
            setError(`حدث خطأ أثناء تنزيل الصور: ${err?.message || 'خطأ'}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Copy image to clipboard
    const handleCopyImageToClipboard = async (page: ExtractedPage, index: number) => {
        try {
            // PNG blobs are supported by navigator.clipboard.write
            let blobToCopy = page.blob;
            if (blobToCopy.type !== 'image/png') {
                const canvas = document.createElement('canvas');
                canvas.width = page.width;
                canvas.height = page.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const img = new Image();
                    img.src = page.dataUrl;
                    await new Promise(r => { img.onload = r; });
                    ctx.drawImage(img, 0, 0);
                    blobToCopy = await new Promise(r => canvas.toBlob(b => r(b!), 'image/png'));
                }
            }

            if (navigator.clipboard && (window as any).ClipboardItem) {
                await navigator.clipboard.write([
                    new (window as any).ClipboardItem({ 'image/png': blobToCopy })
                ]);
                setCopiedIndex(index);
                setTimeout(() => setCopiedIndex(null), 2500);
            } else {
                handleDownloadSingleImage(page);
            }
        } catch (err) {
            console.warn('Clipboard write failed, fallback to download:', err);
            handleDownloadSingleImage(page);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header info */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 mb-4 ring-8 ring-indigo-50/50">
                    <RectangleStackIcon className="w-8 h-8" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-800 mb-2">
                    تحويل صفحات PDF إلى صور
                </h2>
                <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
                    استخرج صفحات أي ملف PDF بجودة فائقة (PNG, JPG, WebP) مع إمكانية التحميل <span className="font-bold text-indigo-600">مدمجة في صورة واحدة</span>، أو <span className="font-bold text-emerald-600">مفردة لكل صفحة</span>، أو كحزمة في <span className="font-bold text-purple-600">ملف مضغوط ZIP</span>.
                </p>
            </div>

            {/* Error & Success Messages */}
            {error && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-center gap-3 animate-fade-in">
                    <span className="text-lg">⚠️</span>
                    <p className="flex-1">{error}</p>
                    <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 text-xs">إغلاق</button>
                </div>
            )}

            {successMessage && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold flex items-center gap-3 animate-fade-in">
                    <CheckIcon className="w-5 h-5 text-emerald-600 shrink-0" />
                    <p className="flex-1">{successMessage}</p>
                    <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 text-xs">إغلاق</button>
                </div>
            )}

            {!file ? (
                <div className="bg-white p-6 sm:p-10 rounded-3xl border border-slate-200/80 shadow-sm">
                    <FileUploader 
                        onFilesSelected={onFilesSelected} 
                        multiple={false} 
                        accept=".pdf,application/pdf" 
                    />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* File info and conversion settings */}
                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                            <div>
                                <span className="text-xs font-bold text-indigo-600 px-2.5 py-1 bg-indigo-50 rounded-lg">
                                    الملف المحدد
                                </span>
                                <h3 className="text-lg font-black text-slate-800 mt-1 truncate max-w-md">
                                    {file.name}
                                </h3>
                                <p className="text-xs text-slate-500">
                                    الحجم: {formatBytes(file.size)} • إجمالي الصفحات: {totalPages || '...'} صفحة
                                </p>
                            </div>
                            <button
                                onClick={resetState}
                                className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition self-start sm:self-center"
                            >
                                تغيير الملف
                            </button>
                        </div>

                        {/* Options Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                            {/* Format selection */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-2">
                                    صيغة الصورة المطلوبة
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['png', 'jpeg', 'webp'] as ImageFormat[]).map(fmt => (
                                        <button
                                            key={fmt}
                                            type="button"
                                            onClick={() => setImageFormat(fmt)}
                                            className={`py-2 px-3 rounded-xl font-bold text-xs uppercase transition border ${
                                                imageFormat === fmt
                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                            }`}
                                        >
                                            {fmt}
                                        </button>
                                    ))}
                                </div>
                                <span className="text-[11px] text-slate-400 mt-1.5 block">
                                    {imageFormat === 'png' ? 'PNG: نقاوة ودقة عالية' : imageFormat === 'jpeg' ? 'JPG: حجم صغير ومتوافق' : 'WebP: صيغة عصرية مضغوطة'}
                                </span>
                            </div>

                            {/* Resolution / Scale */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-2">
                                    دقة وجودة الاستخراج (DPI)
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setQualityScale(1)}
                                        className={`py-2 px-2 rounded-xl font-bold text-xs transition border ${
                                            qualityScale === 1
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        عادية (1x)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setQualityScale(2)}
                                        className={`py-2 px-2 rounded-xl font-bold text-xs transition border ${
                                            qualityScale === 2
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        عالية (2x)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setQualityScale(3)}
                                        className={`py-2 px-2 rounded-xl font-bold text-xs transition border ${
                                            qualityScale === 3
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        فائقة (3x)
                                    </button>
                                </div>
                                <span className="text-[11px] text-slate-400 mt-1.5 block">
                                    {qualityScale === 2 ? 'مستحسن (150 DPI - مثالي للشاشات)' : qualityScale === 3 ? 'فائق (300 DPI - جودة طباعة)' : 'قياسي سريع (72 DPI)'}
                                </span>
                            </div>

                            {/* Page Range Selection */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-2">
                                    نطاق الصفحات المستهدفة
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPageRangeMode('all')}
                                        className={`flex-1 py-2 px-2.5 rounded-xl font-bold text-xs transition border ${
                                            pageRangeMode === 'all'
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        كل الصفحات ({totalPages || '...'})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPageRangeMode('custom')}
                                        className={`flex-1 py-2 px-2.5 rounded-xl font-bold text-xs transition border ${
                                            pageRangeMode === 'custom'
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        تحديد مخصص
                                    </button>
                                </div>
                                {pageRangeMode === 'custom' && (
                                    <input 
                                        type="text" 
                                        placeholder="مثال: 1, 3-5, 8"
                                        value={customRangeText}
                                        onChange={(e) => setCustomRangeText(e.target.value)}
                                        className="mt-2 w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl p-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Conversion Trigger Button */}
                        <div className="pt-2">
                            <button
                                onClick={handleExtractPages}
                                disabled={isLoading}
                                className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <SparklesIcon className="w-5 h-5" />
                                <span>تحويل الصفحات إلى صور الآن</span>
                            </button>
                        </div>

                        {/* Progress Bar */}
                        {isLoading && (
                            <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 space-y-2 animate-fade-in">
                                <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                                    <span>{loadingMessage}</span>
                                    {progressPercent !== null && <span>{progressPercent}%</span>}
                                </div>
                                <div className="w-full bg-indigo-200 rounded-full h-2 overflow-hidden">
                                    <div 
                                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${progressPercent || 50}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Results & The 3 Main Download Modes (Displayed once pages are extracted) */}
                    {extractedPages.length > 0 && (
                        <div className="space-y-6 animate-fade-in">
                            {/* Action Cards Bar */}
                            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                                    <div>
                                        <span className="inline-block px-3 py-1 bg-white/15 rounded-full text-xs font-bold text-indigo-200 mb-1.5">
                                            جاهز للتنزيل
                                        </span>
                                        <h3 className="text-xl font-black">
                                            خيارات تحميل الصور المحولة ({extractedPages.length} صفحة)
                                        </h3>
                                    </div>
                                    <div className="text-xs text-indigo-300 font-medium">
                                        اختر صيغة التحميل المفضلة لديك:
                                    </div>
                                </div>

                                {/* 3 Main Action Buttons Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Option 1: ZIP Archive */}
                                    <button
                                        onClick={handleDownloadZip}
                                        disabled={isLoading}
                                        className="group p-5 rounded-2xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 hover:border-purple-300 text-right transition flex flex-col justify-between space-y-4 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="w-12 h-12 rounded-xl bg-purple-500/30 flex items-center justify-center text-purple-200 group-hover:bg-purple-500 group-hover:text-white transition">
                                                <ArchiveBoxArrowDownIcon className="w-6 h-6" />
                                            </div>
                                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-400/20 text-purple-200 border border-purple-400/30">
                                                حزمة ZIP
                                            </span>
                                        </div>
                                        <div>
                                            <h4 className="text-base font-black text-white mb-1">
                                                تحميل الكل كملف ZIP
                                            </h4>
                                            <p className="text-xs text-purple-200 leading-relaxed">
                                                يجمع جميع الصور بصيغة {imageFormat.toUpperCase()} داخل أرشيف ZIP مضغوط بنقرة واحدة.
                                            </p>
                                        </div>
                                        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-bold text-purple-100 group-hover:text-white">
                                            <span>تنزيل أرشيف .ZIP</span>
                                            <ArrowDownTrayIcon className="w-4 h-4" />
                                        </div>
                                    </button>

                                    {/* Option 2: Combined Stitched Image */}
                                    <button
                                        onClick={handleDownloadCombinedStitchedImage}
                                        disabled={isLoading}
                                        className="group p-5 rounded-2xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 hover:border-indigo-300 text-right transition flex flex-col justify-between space-y-4 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="w-12 h-12 rounded-xl bg-indigo-500/30 flex items-center justify-center text-indigo-200 group-hover:bg-indigo-500 group-hover:text-white transition">
                                                <PhotoIcon className="w-6 h-6" />
                                            </div>
                                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-400/20 text-indigo-200 border border-indigo-400/30">
                                                ملف مدمج
                                            </span>
                                        </div>
                                        <div>
                                            <h4 className="text-base font-black text-white mb-1">
                                                تحميل كصورة مدمجة واحدة
                                            </h4>
                                            <p className="text-xs text-indigo-200 leading-relaxed">
                                                يدمج كافة الصفحات رأسياً في ملف صورة ممتدة واحدة لعرض المستند كاملاً.
                                            </p>
                                        </div>
                                        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-bold text-indigo-100 group-hover:text-white">
                                            <span>تنزيل الصورة المدمجة</span>
                                            <ArrowDownTrayIcon className="w-4 h-4" />
                                        </div>
                                    </button>

                                    {/* Option 3: Individual Downloads */}
                                    <button
                                        onClick={handleDownloadAllIndividual}
                                        disabled={isLoading}
                                        className="group p-5 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 hover:border-emerald-300 text-right transition flex flex-col justify-between space-y-4 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="w-12 h-12 rounded-xl bg-emerald-500/30 flex items-center justify-center text-emerald-200 group-hover:bg-emerald-500 group-hover:text-white transition">
                                                <ArrowDownTrayIcon className="w-6 h-6" />
                                            </div>
                                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                                                تنزيل مفرد
                                            </span>
                                        </div>
                                        <div>
                                            <h4 className="text-base font-black text-white mb-1">
                                                تحميل جميع الصور مفردة
                                            </h4>
                                            <p className="text-xs text-emerald-200 leading-relaxed">
                                                تنزيل كل صفحة كملف صورة منفصل ({imageFormat.toUpperCase()}) بالتتابع.
                                            </p>
                                        </div>
                                        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-bold text-emerald-100 group-hover:text-white">
                                            <span>تنزيل الصور منفصلة</span>
                                            <ArrowDownTrayIcon className="w-4 h-4" />
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Gallery of Extracted Pages */}
                            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
                                <div className="flex items-center justify-between flex-wrap gap-2 pb-4 border-b border-slate-100">
                                    <div>
                                        <h3 className="text-lg font-black text-slate-800">
                                            معرض الصفحات المحولة ({extractedPages.length} صفحة)
                                        </h3>
                                        <p className="text-xs text-slate-500">
                                            يمكنك تكبير أي صفحة، نسخها للحافظة، أو تنزيلها مباشرة كصورة منفصلة
                                        </p>
                                    </div>
                                    <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg">
                                        الصيغة: {imageFormat.toUpperCase()}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {extractedPages.map((page, index) => (
                                        <div
                                            key={page.id}
                                            className="bg-slate-50 hover:bg-white p-3 rounded-2xl border border-slate-200 hover:border-indigo-300 transition-all shadow-sm hover:shadow-md flex flex-col justify-between space-y-3 group"
                                        >
                                            {/* Thumbnail with overlay controls */}
                                            <div className="relative aspect-[3/4] bg-white rounded-xl overflow-hidden border border-slate-200 shadow-inner flex items-center justify-center">
                                                <img 
                                                    src={page.dataUrl} 
                                                    alt={`الصفحة ${page.pageNumber}`} 
                                                    className="w-full h-full object-contain cursor-pointer"
                                                    onClick={() => setSelectedPageForModal(page)}
                                                />
                                                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/80 backdrop-blur-sm text-white text-[11px] font-bold">
                                                    صفحة {page.pageNumber}
                                                </div>
                                                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-slate-900/70 backdrop-blur-sm text-white text-[10px] font-mono">
                                                    {page.width}×{page.height}
                                                </div>
                                                <button
                                                    onClick={() => setSelectedPageForModal(page)}
                                                    className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                                                    title="تكبير ومعاينة"
                                                >
                                                    <div className="p-2.5 rounded-full bg-white/20 backdrop-blur-md">
                                                        <EyeIcon className="w-5 h-5" />
                                                    </div>
                                                </button>
                                            </div>

                                            {/* Details */}
                                            <div className="text-[11px] text-slate-500 flex items-center justify-between">
                                                <span>الحجم: {page.sizeFormatted}</span>
                                                <span className="font-mono text-slate-400">P.{page.pageNumber}</span>
                                            </div>

                                            {/* Action Buttons for this single page */}
                                            <div className="pt-2 border-t border-slate-200/80 flex items-center gap-1.5">
                                                <button
                                                    onClick={() => handleDownloadSingleImage(page)}
                                                    title={`تحميل صفحة ${page.pageNumber} (${imageFormat.toUpperCase()})`}
                                                    className="flex-1 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"
                                                >
                                                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                                                    <span>تحميل مفرد</span>
                                                </button>
                                                <button
                                                    onClick={() => handleCopyImageToClipboard(page, index)}
                                                    title="نسخ الصورة للحافظة"
                                                    className="p-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 transition"
                                                >
                                                    {copiedIndex === index ? (
                                                        <CheckIcon className="w-4 h-4 text-emerald-600" />
                                                    ) : (
                                                        <ClipboardIcon className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Modal for full screen preview of an image */}
            {selectedPageForModal && (
                <div 
                    className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setSelectedPageForModal(null)}
                >
                    <div 
                        className="bg-white rounded-3xl max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-black text-slate-800">
                                    معاينة الصفحة {selectedPageForModal.pageNumber}
                                </h4>
                                <p className="text-xs text-slate-400">
                                    الأبعاد: {selectedPageForModal.width} × {selectedPageForModal.height} بكسل • الحجم: {selectedPageForModal.sizeFormatted}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleDownloadSingleImage(selectedPageForModal)}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                                >
                                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                                    <span>تحميل</span>
                                </button>
                                <button
                                    onClick={() => setSelectedPageForModal(null)}
                                    className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
                                >
                                    <XMarkIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="p-4 overflow-auto max-h-[75vh] flex items-center justify-center bg-slate-100">
                            <img 
                                src={selectedPageForModal.dataUrl} 
                                alt={`الصفحة ${selectedPageForModal.pageNumber}`}
                                className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PdfToImage;