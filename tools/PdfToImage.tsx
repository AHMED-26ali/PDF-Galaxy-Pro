import React, { useState, useEffect } from 'react';
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

import { canvasToBlob, clearCanvas, downloadFile as download, parsePageRange, pdfError, renderPdfPage, withPdf } from './pdfRuntime';

type ImageFormat = 'png' | 'jpeg' | 'webp';
type QualityScale = 1 | 2 | 3;

interface ExtractedPage {
    id: string;
    pageNumber: number;
    url: string;
    format: ImageFormat;
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

    useEffect(() => () => {
        extractedPages.forEach(page => URL.revokeObjectURL(page.url));
    }, [extractedPages]);

    const outputFormat = extractedPages[0]?.format ?? imageFormat;
    const baseName = file?.name.replace(/\.pdf$/i, '').trim() || 'document';

    async function onFilesSelected(files: File[]) {
        const selectedPdf = files[0];
        if (!selectedPdf) return;
        resetState();
        setFile(selectedPdf);
        setIsLoading(true);
        setLoadingMessage('جاري قراءة عدد الصفحات…');
        try {
            setTotalPages(await withPdf(selectedPdf, async pdf => pdf.numPages));
        } catch (error) {
            setError(pdfError(error, 'تعذّر قراءة ملف PDF. اختر ملفاً سليماً.'));
        } finally {
            setIsLoading(false);
        }
    }

    async function handleExtractPages() {
        if (!file || !totalPages) return;
        let targets: number[];
        try {
            targets = pageRangeMode === 'all'
                ? Array.from({ length: totalPages }, (_, index) => index + 1)
                : parsePageRange(customRangeText, totalPages);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'نطاق الصفحات غير صالح.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setExtractedPages([]);
        setSelectedPageForModal(null);
        setLoadingMessage('جاري تحويل صفحات الملف…');
        setProgressPercent(0);
        const results: ExtractedPage[] = [];
        try {
            await withPdf(file, async pdf => {
                for (const [index, number] of targets.entries()) {
                    setLoadingMessage(`تحويل صفحة ${number} (${index + 1} من ${targets.length})…`);
                    const page = await pdf.getPage(number);
                    const canvas = await renderPdfPage(page, qualityScale);
                    try {
                        const blob = await canvasToBlob(canvas, `image/${imageFormat}`, 0.92);
                        results.push({
                            id: String(number),
                            pageNumber: number,
                            url: URL.createObjectURL(blob),
                            format: imageFormat,
                            blob,
                            width: canvas.width,
                            height: canvas.height,
                            sizeFormatted: formatBytes(blob.size),
                        });
                        setProgressPercent(Math.round((index + 1) / targets.length * 100));
                    } finally {
                        clearCanvas(canvas);
                        page.cleanup();
                    }
                }
            });
            setExtractedPages(results);
            setSuccessMessage(`تم تحويل ${results.length} صفحة. اختر طريقة التنزيل.`);
        } catch (error) {
            results.forEach(page => URL.revokeObjectURL(page.url));
            setError(pdfError(error, 'تعذّر تحويل الصفحات إلى صور. جرّب دقة أقل أو صيغة أخرى.'));
        } finally {
            setIsLoading(false);
            setProgressPercent(null);
        }
    }

    async function handleDownloadZip() {
        if (!extractedPages.length) return;
        setIsLoading(true);
        setError(null);
        setLoadingMessage('جاري تجهيز ملف ZIP…');
        try {
            const zip = new JSZip();
            for (const page of extractedPages) {
                zip.file(`${baseName}_page_${String(page.pageNumber).padStart(2, '0')}.${page.format}`, await page.blob.arrayBuffer());
            }
            const blob = await zip.generateAsync({ type: 'blob' }, update => setProgressPercent(Math.round(update.percent)));
            download(blob, `${baseName}_images.zip`, 'application/zip');
        } catch {
            setError('تعذّر تجهيز أرشيف ZIP.');
        } finally {
            setIsLoading(false);
            setProgressPercent(null);
        }
    }

    async function handleDownloadCombinedStitchedImage() {
        if (!extractedPages.length) return;
        setIsLoading(true);
        setError(null);
        setLoadingMessage('جاري جمع الصفحات في صورة واحدة…');
        const canvas = document.createElement('canvas');
        try {
            const maxWidth = Math.max(...extractedPages.map(page => page.width));
            const totalHeight = extractedPages.reduce((sum, page) => sum + page.height, 0);
            const scale = Math.min(1, 8192 / Math.max(maxWidth, totalHeight), Math.sqrt(12_000_000 / (maxWidth * totalHeight)));
            if (scale < 0.2) throw new Error('حجم الصورة المدمجة كبير. نزّل الصفحات في ZIP أو اختر عدداً أقل.');
            canvas.width = Math.ceil(maxWidth * scale);
            canvas.height = Math.ceil(totalHeight * scale);
            const context = canvas.getContext('2d');
            if (!context) throw new Error('تعذّر تجهيز الصورة المدمجة.');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            let y = 0;
            for (const [index, page] of extractedPages.entries()) {
                const image = new Image();
                image.src = page.url;
                await image.decode();
                context.drawImage(image, (maxWidth - page.width) * scale / 2, y, page.width * scale, page.height * scale);
                y += page.height * scale;
                setProgressPercent(Math.round((index + 1) / extractedPages.length * 100));
            }
            const mime = `image/${outputFormat}`;
            download(await canvasToBlob(canvas, mime, 0.92), `${baseName}_combined.${outputFormat}`, mime);
            setSuccessMessage(scale < 1 ? 'تم تنزيل الصورة المدمجة بأبعاد مناسبة للمتصفح.' : 'تم تنزيل الصورة المدمجة.');
        } catch (error) {
            setError(error instanceof Error ? error.message : 'تعذّر تجهيز الصورة المدمجة.');
        } finally {
            clearCanvas(canvas);
            setIsLoading(false);
            setProgressPercent(null);
        }
    }

    function handleDownloadSingleImage(page: ExtractedPage) {
        download(page.blob, `${baseName}_page_${page.pageNumber}.${page.format}`, page.blob.type);
    }

    async function handleDownloadAllIndividual() {
        if (!extractedPages.length) return;
        setIsLoading(true);
        setError(null);
        try {
            for (const [index, page] of extractedPages.entries()) {
                setLoadingMessage(`تنزيل الصورة ${index + 1} من ${extractedPages.length}…`);
                handleDownloadSingleImage(page);
                if (index < extractedPages.length - 1) await new Promise(resolve => setTimeout(resolve, 300));
            }
            setSuccessMessage('أُرسلت طلبات تنزيل الصور. إذا أوقفها المتصفح، استخدم ZIP.');
        } finally {
            setIsLoading(false);
        }
    }

    async function handleCopyImageToClipboard(page: ExtractedPage, index: number) {
        try {
            const clipboardBlob = page.blob.type === 'image/png' ? page.blob : (async () => {
                const image = new Image();
                image.src = page.url;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = page.width;
                canvas.height = page.height;
                try {
                    const context = canvas.getContext('2d');
                    if (!context) throw new Error('Canvas unavailable');
                    context.drawImage(image, 0, 0);
                    return await canvasToBlob(canvas);
                } finally {
                    clearCanvas(canvas);
                }
            })();
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': clipboardBlob })]);
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2500);
        } catch {
            setError('تعذّر النسخ إلى الحافظة. استخدم زر تنزيل الصورة.');
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
                <div role="alert" className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-center gap-3 animate-fade-in">
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
                                disabled={isLoading}
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
                                        aria-label="نطاق الصفحات"
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
                                disabled={isLoading || !totalPages}
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
                                                يجمع جميع الصور بصيغة {outputFormat.toUpperCase()} داخل أرشيف ZIP مضغوط بنقرة واحدة.
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
                                                تنزيل كل صفحة كملف صورة منفصل ({outputFormat.toUpperCase()}) بالتتابع.
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
                                        الصيغة: {outputFormat.toUpperCase()}
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
                                                    src={page.url}
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
                                                    title={`تحميل صفحة ${page.pageNumber} (${outputFormat.toUpperCase()})`}
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
                                src={selectedPageForModal.url}
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