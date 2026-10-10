import React, { useState, useCallback, useRef } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import JSZip from 'jszip';
import { 
    PhotoIcon, 
    ArrowDownTrayIcon, 
    ArchiveBoxArrowDownIcon, 
    DocumentDuplicateIcon, 
    XMarkIcon, 
    PlusIcon, 
    SparklesIcon, 
    CheckIcon,
    ChevronUpIcon,
    ChevronDownIcon
} from '../components/icons';

declare const PDFLib: any;
declare const download: any;

type PageSize = 'A4' | 'Letter' | 'Auto' | 'A3' | 'A5';
type Orientation = 'auto' | 'portrait' | 'landscape';
type MarginOption = 'none' | 'small' | 'normal';
type FitOption = 'contain' | 'fill';

const PAGE_SIZES: { [key in PageSize]: [number, number] } = {
    A4: [595.28, 841.89],
    Letter: [612, 792],
    A3: [841.89, 1190.55],
    A5: [419.53, 595.28],
    Auto: [0, 0] // Dynamic according to image size
};

const MARGIN_VALUES: { [key in MarginOption]: number } = {
    none: 0,
    small: 15,
    normal: 30
};

interface ImageItem {
    id: string;
    file: File;
    name: string;
    sizeFormatted: string;
    previewUrl: string;
    width: number;
    height: number;
}

interface ProcessedImageBuffer {
    buffer: ArrayBuffer;
    isPng: boolean;
    width: number;
    height: number;
}

const ImageToPdf: React.FC = () => {
    const [images, setImages] = useState<ImageItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [progressPercent, setProgressPercent] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Conversion Options
    const [pageSize, setPageSize] = useState<PageSize>('A4');
    const [orientation, setOrientation] = useState<Orientation>('auto');
    const [marginOption, setMarginOption] = useState<MarginOption>('none');
    const [fitMode, setFitMode] = useState<FitOption>('contain');

    const additionalInputRef = useRef<HTMLInputElement>(null);

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // Helper: inspect image dimensions
    const readImageMetadata = (file: File): Promise<{ width: number; height: number; previewUrl: string }> => {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                resolve({
                    width: img.naturalWidth || img.width || 800,
                    height: img.naturalHeight || img.height || 600,
                    previewUrl: url
                });
            };
            img.onerror = () => {
                resolve({ width: 800, height: 600, previewUrl: url });
            };
            img.src = url;
        });
    };

    const onFilesSelected = useCallback(async (selectedFiles: File[]) => {
        const imageFiles = selectedFiles.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) {
            setError('يرجى اختيار ملفات صور صالحة (PNG, JPG, WebP, GIF, SVG).');
            return;
        }

        setError(null);
        setSuccessMessage(null);

        const newItems: ImageItem[] = [];
        for (const file of imageFiles) {
            const meta = await readImageMetadata(file);
            newItems.push({
                id: `${file.name}-${Date.now()}-${Math.random()}`,
                file,
                name: file.name,
                sizeFormatted: formatBytes(file.size),
                previewUrl: meta.previewUrl,
                width: meta.width,
                height: meta.height
            });
        }

        setImages(prev => [...prev, ...newItems]);
    }, []);

    const handleRemoveImage = (index: number) => {
        setImages(prev => {
            const item = prev[index];
            if (item?.previewUrl) {
                URL.revokeObjectURL(item.previewUrl);
            }
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleClearAll = () => {
        images.forEach(img => URL.revokeObjectURL(img.previewUrl));
        setImages([]);
        setError(null);
        setSuccessMessage(null);
    };

    const moveImage = (index: number, direction: 'up' | 'down') => {
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === images.length - 1)) {
            return;
        }
        const newImages = [...images];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        const temp = newImages[index];
        newImages[index] = newImages[targetIndex];
        newImages[targetIndex] = temp;
        setImages(newImages);
    };

    // Helper: convert any image file to standard JPEG or PNG ArrayBuffer via canvas
    const prepareImageBuffer = (file: File): Promise<ProcessedImageBuffer> => {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width;
                    canvas.height = img.naturalHeight || img.height;
                    const ctx = canvas.getContext('2d');

                    if (!ctx) {
                        URL.revokeObjectURL(url);
                        reject(new Error('تعذر إنشاء سياق رسم للصورة.'));
                        return;
                    }

                    // Background fill for transparency if needed
                    const isPngType = file.type === 'image/png';
                    if (!isPngType) {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    }
                    ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(url);

                    const mimeType = isPngType ? 'image/png' : 'image/jpeg';
                    canvas.toBlob(async (blob) => {
                        if (!blob) {
                            reject(new Error('تعذر تحويل بيانات الصورة.'));
                            return;
                        }
                        const buffer = await blob.arrayBuffer();
                        resolve({
                            buffer,
                            isPng: isPngType,
                            width: canvas.width,
                            height: canvas.height
                        });
                    }, mimeType, 0.95);
                } catch (err) {
                    URL.revokeObjectURL(url);
                    reject(err);
                }
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error(`فشل في قراءة الصورة ${file.name}`));
            };

            img.src = url;
        });
    };

    // Helper: build a single-page PDF document
    const createSinglePdfDocument = async (imgData: ProcessedImageBuffer): Promise<Uint8Array> => {
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.create();

        let embeddedImage;
        if (imgData.isPng) {
            embeddedImage = await pdfDoc.embedPng(imgData.buffer);
        } else {
            embeddedImage = await pdfDoc.embedJpg(imgData.buffer);
        }

        let pageWidth: number;
        let pageHeight: number;

        if (pageSize === 'Auto') {
            pageWidth = imgData.width;
            pageHeight = imgData.height;
        } else {
            const standardDims = PAGE_SIZES[pageSize];
            const isLandscape = orientation === 'landscape' || (orientation === 'auto' && imgData.width > imgData.height);
            pageWidth = isLandscape ? standardDims[1] : standardDims[0];
            pageHeight = isLandscape ? standardDims[0] : standardDims[1];
        }

        const margin = pageSize === 'Auto' ? 0 : MARGIN_VALUES[marginOption];
        const availWidth = Math.max(10, pageWidth - margin * 2);
        const availHeight = Math.max(10, pageHeight - margin * 2);

        let drawWidth = availWidth;
        let drawHeight = availHeight;
        const imgAspect = imgData.width / imgData.height;
        const availAspect = availWidth / availHeight;

        if (fitMode === 'contain') {
            if (imgAspect > availAspect) {
                drawWidth = availWidth;
                drawHeight = availWidth / imgAspect;
            } else {
                drawHeight = availHeight;
                drawWidth = availHeight * imgAspect;
            }
        }

        const x = margin + (availWidth - drawWidth) / 2;
        const y = margin + (availHeight - drawHeight) / 2;

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawImage(embeddedImage, {
            x,
            y,
            width: drawWidth,
            height: drawHeight
        });

        return await pdfDoc.save();
    };

    // Action 1: Download all images as ONE merged/combined PDF file
    const handleDownloadCombinedPdf = async () => {
        if (images.length === 0) return;
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setLoadingMessage('جاري إعداد وتجميع الصور في ملف PDF مدمج واحد...');
        setProgressPercent(10);

        try {
            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.create();

            for (let i = 0; i < images.length; i++) {
                const item = images[i];
                setLoadingMessage(`جاري معالجة الصورة ${i + 1} من ${images.length}: ${item.name}...`);
                setProgressPercent(Math.round(15 + ((i + 1) / images.length) * 75));

                const imgData = await prepareImageBuffer(item.file);
                let embeddedImage;
                if (imgData.isPng) {
                    embeddedImage = await pdfDoc.embedPng(imgData.buffer);
                } else {
                    embeddedImage = await pdfDoc.embedJpg(imgData.buffer);
                }

                let pageWidth: number;
                let pageHeight: number;

                if (pageSize === 'Auto') {
                    pageWidth = imgData.width;
                    pageHeight = imgData.height;
                } else {
                    const standardDims = PAGE_SIZES[pageSize];
                    const isLandscape = orientation === 'landscape' || (orientation === 'auto' && imgData.width > imgData.height);
                    pageWidth = isLandscape ? standardDims[1] : standardDims[0];
                    pageHeight = isLandscape ? standardDims[0] : standardDims[1];
                }

                const margin = pageSize === 'Auto' ? 0 : MARGIN_VALUES[marginOption];
                const availWidth = Math.max(10, pageWidth - margin * 2);
                const availHeight = Math.max(10, pageHeight - margin * 2);

                let drawWidth = availWidth;
                let drawHeight = availHeight;
                const imgAspect = imgData.width / imgData.height;
                const availAspect = availWidth / availHeight;

                if (fitMode === 'contain') {
                    if (imgAspect > availAspect) {
                        drawWidth = availWidth;
                        drawHeight = availWidth / imgAspect;
                    } else {
                        drawHeight = availHeight;
                        drawWidth = availHeight * imgAspect;
                    }
                }

                const x = margin + (availWidth - drawWidth) / 2;
                const y = margin + (availHeight - drawHeight) / 2;

                const page = pdfDoc.addPage([pageWidth, pageHeight]);
                page.drawImage(embeddedImage, {
                    x,
                    y,
                    width: drawWidth,
                    height: drawHeight
                });
            }

            setLoadingMessage('جاري حفظ ملف PDF المدمج...');
            setProgressPercent(95);

            const pdfBytes = await pdfDoc.save();
            const filename = `combined_images_${images.length}_pages.pdf`;
            download(pdfBytes, filename, 'application/pdf');

            setProgressPercent(100);
            setSuccessMessage(`تم دمج جميع الصور (${images.length}) بنجاح في ملف PDF مدمج وتحميله!`);
        } catch (err: any) {
            console.error(err);
            setError(`حدث خطأ أثناء دمج الصور: ${err?.message || 'خطأ غير معروف'}`);
        } finally {
            setIsLoading(false);
            setProgressPercent(null);
        }
    };

    // Action 2: Download each image as an individual PDF inside a compressed ZIP archive (.zip)
    const handleDownloadZip = async () => {
        if (images.length === 0) return;
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setLoadingMessage('جاري تحويل كل صورة إلى ملف PDF وحفظها في أرشيف ZIP...');
        setProgressPercent(10);

        try {
            const zip = new JSZip();

            for (let i = 0; i < images.length; i++) {
                const item = images[i];
                setLoadingMessage(`جاري تحويل الصورة ${i + 1} من ${images.length} إلى PDF: ${item.name}...`);
                setProgressPercent(Math.round(15 + ((i + 1) / images.length) * 70));

                const imgData = await prepareImageBuffer(item.file);
                const pdfBytes = await createSinglePdfDocument(imgData);

                const cleanBaseName = item.name.replace(/\.[^/.]+$/, '').trim() || `image_${i + 1}`;
                const pdfFileName = `${String(i + 1).padStart(2, '0')}_${cleanBaseName}.pdf`;
                zip.file(pdfFileName, pdfBytes);
            }

            setLoadingMessage('جاري ضغط الأرشيف وإنشاء ملف الـ ZIP...');
            setProgressPercent(90);

            const zipBlob = await zip.generateAsync({ 
                type: 'blob', 
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });

            const zipFilename = `converted_images_bundle_${images.length}_files.zip`;
            download(zipBlob, zipFilename, 'application/zip');

            setProgressPercent(100);
            setSuccessMessage(`تم إنشاء ملف الـ ZIP المضغوط بنجاح ويحتوي على ${images.length} ملف PDF مفرد!`);
        } catch (err: any) {
            console.error(err);
            setError(`حدث خطأ أثناء إنشاء ملف ZIP: ${err?.message || 'خطأ غير معروف'}`);
        } finally {
            setIsLoading(false);
            setProgressPercent(null);
        }
    };

    // Action 3: Download a single individual image as PDF
    const handleDownloadSingleImagePdf = async (index: number) => {
        const item = images[index];
        if (!item) return;

        setIsLoading(true);
        setError(null);
        setLoadingMessage(`جاري إنشاء ملف PDF للصورة: ${item.name}...`);

        try {
            const imgData = await prepareImageBuffer(item.file);
            const pdfBytes = await createSinglePdfDocument(imgData);

            const cleanBaseName = item.name.replace(/\.[^/.]+$/, '').trim() || 'converted_image';
            download(pdfBytes, `${cleanBaseName}.pdf`, 'application/pdf');
            setSuccessMessage(`تم تحميل مستند PDF للصورة "${item.name}" بنجاح!`);
        } catch (err: any) {
            console.error(err);
            setError(`فشل في تحويل الصورة "${item.name}": ${err?.message || 'خطأ'}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Action 4: Download all individual PDFs one by one sequentially
    const handleDownloadAllIndividualPdfs = async () => {
        if (images.length === 0) return;
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        try {
            for (let i = 0; i < images.length; i++) {
                const item = images[i];
                setLoadingMessage(`جاري تنزيل ملف PDF مفرد (${i + 1} من ${images.length}): ${item.name}...`);
                const imgData = await prepareImageBuffer(item.file);
                const pdfBytes = await createSinglePdfDocument(imgData);

                const cleanBaseName = item.name.replace(/\.[^/.]+$/, '').trim() || `image_${i + 1}`;
                download(pdfBytes, `${cleanBaseName}.pdf`, 'application/pdf');

                // Small pause to allow browser download pipeline
                await new Promise(r => setTimeout(r, 450));
            }
            setSuccessMessage(`تم تحميل جميع ملفات الـ PDF المنفردة (${images.length} ملف) بنجاح!`);
        } catch (err: any) {
            console.error(err);
            setError(`حدث خطأ أثناء التنزيل: ${err?.message || 'خطأ'}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header info */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 mb-4 ring-8 ring-indigo-50/50">
                    <PhotoIcon className="w-8 h-8" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-800 mb-2">
                    تحويل الصور إلى مستندات PDF
                </h2>
                <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
                    حوّل صورك بأعلى جودة مع مرونة تامة في التنزيل: اختر بين <span className="font-bold text-indigo-600">ملف PDF مدمج يجمع كل الصور</span>، أو <span className="font-bold text-emerald-600">تحميل الصور مفردة</span>، أو حزمة كاملة في <span className="font-bold text-purple-600">ملف مضغوط ZIP</span>.
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

            {/* Uploader or Image Grid */}
            {images.length === 0 ? (
                <div className="bg-white p-6 sm:p-10 rounded-3xl border border-slate-200/80 shadow-sm">
                    <FileUploader 
                        onFilesSelected={onFilesSelected} 
                        multiple={true} 
                        accept="image/*" 
                    />
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
                        <span>يدعم الصيغ:</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md text-slate-600 font-mono">JPG / JPEG</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md text-slate-600 font-mono">PNG</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md text-slate-600 font-mono">WebP</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md text-slate-600 font-mono">GIF</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md text-slate-600 font-mono">SVG</span>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Settings bar */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="w-5 h-5 text-indigo-500" />
                                <h3 className="text-base font-bold text-slate-800">إعدادات مقاس وتخطيط الصفحة</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="file" 
                                    ref={additionalInputRef} 
                                    onChange={(e) => {
                                        if (e.target.files) onFilesSelected(Array.from(e.target.files));
                                    }} 
                                    multiple 
                                    accept="image/*" 
                                    className="hidden" 
                                />
                                <button
                                    onClick={() => additionalInputRef.current?.click()}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition"
                                >
                                    <PlusIcon className="w-4 h-4" />
                                    إضافة المزيد من الصور
                                </button>
                                <button
                                    onClick={handleClearAll}
                                    className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition"
                                >
                                    مسح الكل
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Page size */}
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">حجم الصفحة</label>
                                <select
                                    value={pageSize}
                                    onChange={(e) => setPageSize(e.target.value as PageSize)}
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-semibold rounded-xl p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                >
                                    <option value="A4">A4 (قياسي)</option>
                                    <option value="Letter">Letter (رسالة)</option>
                                    <option value="Auto">Auto (نفس مقاس الصورة تماماً)</option>
                                    <option value="A3">A3 (كبير)</option>
                                    <option value="A5">A5 (صغير)</option>
                                </select>
                            </div>

                            {/* Orientation */}
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">اتجاه الصفحة</label>
                                <select
                                    value={orientation}
                                    onChange={(e) => setOrientation(e.target.value as Orientation)}
                                    disabled={pageSize === 'Auto'}
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-semibold rounded-xl p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
                                >
                                    <option value="auto">تلقائي (حسب أبعاد الصورة)</option>
                                    <option value="portrait">طولي (Portrait)</option>
                                    <option value="landscape">عرضي (Landscape)</option>
                                </select>
                            </div>

                            {/* Margins */}
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">الهوامش</label>
                                <select
                                    value={marginOption}
                                    onChange={(e) => setMarginOption(e.target.value as MarginOption)}
                                    disabled={pageSize === 'Auto'}
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-semibold rounded-xl p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
                                >
                                    <option value="none">بدون هوامش (ملء الصفحة 100%)</option>
                                    <option value="small">هوامش صغيرة (15pt)</option>
                                    <option value="normal">هوامش قياسية (30pt)</option>
                                </select>
                            </div>

                            {/* Fit Mode */}
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">طريقة ملاءمة الصورة</label>
                                <select
                                    value={fitMode}
                                    onChange={(e) => setFitMode(e.target.value as FitOption)}
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-semibold rounded-xl p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                >
                                    <option value="contain">ملاءمة كاملة (حفظ النسبة بدون قص)</option>
                                    <option value="fill">ملء الإطار (Fill / Stretch)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Prominent Download Actions Card (The 3 modes requested) */}
                    <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                            <div>
                                <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-xs font-bold text-white mb-1.5">
                                    خيارات التحميل والتصدير
                                </span>
                                <h3 className="text-xl font-black">
                                    اختر طريقة تحميل الصور ({images.length} صورة جاهزة)
                                </h3>
                            </div>
                            <div className="text-xs text-indigo-200 font-medium">
                                معالجة محلية وفورية داخل المتصفح
                            </div>
                        </div>

                        {/* 3 Main Action Buttons Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Option 1: Combined / Merged PDF */}
                            <button
                                onClick={handleDownloadCombinedPdf}
                                disabled={isLoading}
                                className="group p-5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 text-right transition flex flex-col justify-between space-y-4 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="w-12 h-12 rounded-xl bg-indigo-500/30 flex items-center justify-center text-indigo-200 group-hover:bg-indigo-500 group-hover:text-white transition">
                                        <DocumentDuplicateIcon className="w-6 h-6" />
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-400/20 text-indigo-200 border border-indigo-400/30">
                                        الأكثر طلباً
                                    </span>
                                </div>
                                <div>
                                    <h4 className="text-base font-black text-white mb-1">
                                        تحميل PDF مدمج
                                    </h4>
                                    <p className="text-xs text-indigo-200 leading-relaxed">
                                        يجمع كافة الصور في ملف PDF واحد متكامل ومرتب بالصفحات.
                                    </p>
                                </div>
                                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-bold text-indigo-100 group-hover:text-white">
                                    <span>تحميل الملف المدمج</span>
                                    <ArrowDownTrayIcon className="w-4 h-4" />
                                </div>
                            </button>

                            {/* Option 2: ZIP Archive */}
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
                                        أرشيف ZIP
                                    </span>
                                </div>
                                <div>
                                    <h4 className="text-base font-black text-white mb-1">
                                        تحميل كملف مضغوط (ZIP)
                                    </h4>
                                    <p className="text-xs text-purple-200 leading-relaxed">
                                        يحفظ كل صورة كملف PDF مفرد ومستقل، مجمعة داخل أرشيف ZIP واحد.
                                    </p>
                                </div>
                                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-bold text-purple-100 group-hover:text-white">
                                    <span>تنزيل أرشيف .ZIP</span>
                                    <ArrowDownTrayIcon className="w-4 h-4" />
                                </div>
                            </button>

                            {/* Option 3: Individual Downloads */}
                            <button
                                onClick={handleDownloadAllIndividualPdfs}
                                disabled={isLoading}
                                className="group p-5 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 hover:border-emerald-300 text-right transition flex flex-col justify-between space-y-4 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-500/30 flex items-center justify-center text-emerald-200 group-hover:bg-emerald-500 group-hover:text-white transition">
                                        <ArrowDownTrayIcon className="w-6 h-6" />
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                                        تحميل مفرد
                                    </span>
                                </div>
                                <div>
                                    <h4 className="text-base font-black text-white mb-1">
                                        تحميل جميع الملفات مفردة
                                    </h4>
                                    <p className="text-xs text-emerald-200 leading-relaxed">
                                        تنزيل كل صورة كملف PDF مستقل تلقائياً واحداً تلو الآخر.
                                    </p>
                                </div>
                                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-bold text-emerald-100 group-hover:text-white">
                                    <span>تنزيل كل ملف على حدة</span>
                                    <ArrowDownTrayIcon className="w-4 h-4" />
                                </div>
                            </button>
                        </div>

                        {/* Progress Bar during execution */}
                        {isLoading && (
                            <div className="p-4 rounded-2xl bg-white/10 border border-white/20 space-y-2 animate-fade-in">
                                <div className="flex items-center justify-between text-xs font-bold text-white">
                                    <span>{loadingMessage}</span>
                                    {progressPercent !== null && <span>{progressPercent}%</span>}
                                </div>
                                <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
                                    <div 
                                        className="bg-indigo-300 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${progressPercent || 50}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Image Cards & Individual Downloads Gallery */}
                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
                        <div className="flex items-center justify-between flex-wrap gap-2 pb-4 border-b border-slate-100">
                            <div>
                                <h3 className="text-lg font-black text-slate-800">
                                    معرض الصور المحددة ({images.length} صورة)
                                </h3>
                                <p className="text-xs text-slate-500">
                                    يمكنك إعادة ترتيب الصور أو تنزيل أي صورة مباشرة كملف PDF مفرد
                                </p>
                            </div>
                            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 rounded-lg text-slate-600">
                                استخدم الأسهم لإعادة ترتيب الصفحات
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {images.map((img, index) => (
                                <div 
                                    key={img.id}
                                    className="p-3.5 bg-slate-50 hover:bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 transition-all shadow-sm hover:shadow-md flex flex-col justify-between space-y-3 group"
                                >
                                    {/* Thumbnail Preview */}
                                    <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-200 border border-slate-200 flex items-center justify-center">
                                        <img 
                                            src={img.previewUrl} 
                                            alt={img.name} 
                                            className="w-full h-full object-contain"
                                        />
                                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/80 backdrop-blur-sm text-white text-[11px] font-bold">
                                            صفحة {index + 1}
                                        </div>
                                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-slate-900/70 backdrop-blur-sm text-white text-[10px] font-mono">
                                            {img.width}×{img.height}
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-800 truncate" title={img.name}>
                                            {img.name}
                                        </h4>
                                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                                            <span>الحجم: {img.sizeFormatted}</span>
                                            <span className="text-indigo-600 font-semibold">{pageSize}</span>
                                        </div>
                                    </div>

                                    {/* Controls & Individual Download */}
                                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-1.5">
                                        {/* Reorder Buttons */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => moveImage(index, 'up')}
                                                disabled={index === 0}
                                                title="تحريك للأمام"
                                                className="p-1.5 rounded-lg bg-slate-200/80 hover:bg-indigo-100 hover:text-indigo-600 text-slate-600 disabled:opacity-30 disabled:hover:bg-slate-200 transition"
                                            >
                                                <ChevronUpIcon className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => moveImage(index, 'down')}
                                                disabled={index === images.length - 1}
                                                title="تحريك للخلف"
                                                className="p-1.5 rounded-lg bg-slate-200/80 hover:bg-indigo-100 hover:text-indigo-600 text-slate-600 disabled:opacity-30 disabled:hover:bg-slate-200 transition"
                                            >
                                                <ChevronDownIcon className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleRemoveImage(index)}
                                                title="حذف الصورة"
                                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
                                            >
                                                <XMarkIcon className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        {/* Single PDF Download Button */}
                                        <button
                                            onClick={() => handleDownloadSingleImagePdf(index)}
                                            disabled={isLoading}
                                            title="تحميل هذه الصورة وحدها كملف PDF"
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white text-xs font-bold transition shadow-sm"
                                        >
                                            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                                            <span>تحميل PDF مفرد</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImageToPdf;