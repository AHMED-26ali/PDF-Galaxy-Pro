import React, { useState, useCallback, useEffect, useRef } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { TagIcon, ArrowDownTrayIcon, PhotoIcon, SparklesIcon } from '../components/icons';

import { canvasToBlob, clearCanvas, downloadFile as download, pdfError, renderPdfPage, withPdf } from './pdfRuntime';
import { getVisiblePage } from './pdf-pages/pdfOperations';

type WatermarkType = 'text' | 'image';
type WatermarkLayout = 'center-diagonal' | 'grid-repeat' | 'top-header' | 'bottom-footer';

const AddWatermarkPdf: React.FC = () => {
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [watermarkType, setWatermarkType] = useState<WatermarkType>('text');
    const [layout, setLayout] = useState<WatermarkLayout>('center-diagonal');

    // Text options
    const [text, setText] = useState('سري للغاية - نسخة محمية');
    const [textColor, setTextColor] = useState('#dc2626'); // Red-600
    const [textOpacity, setTextOpacity] = useState(0.4);
    const [textSize, setTextSize] = useState(48);
    const [rotationAngle, setRotationAngle] = useState(45);

    // Image options
    const [imageOpacity, setImageOpacity] = useState(0.4);
    const [imageScale, setImageScale] = useState(40); // 10% to 100%

    const [previewLoading, setPreviewLoading] = useState(false);
    const [preview, setPreview] = useState<{ canvas: HTMLCanvasElement; width: number; height: number } | null>(null);
    const [logo, setLogo] = useState<HTMLImageElement | null>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const onPdfSelected = useCallback((files: File[]) => {
        if (!files[0]) return;
        setPdfFile(files[0]);
        setError(null);
        setPreview(null);
    }, []);

    function onImageSelected(files: File[]) {
        setError(null);
        setLogo(null);
        setImageFile(files[0] ?? null);
    }

    useEffect(() => {
        if (!imageFile) return;
        const url = URL.createObjectURL(imageFile);
        setImagePreviewUrl(url);
        let active = true;
        const image = new Image();
        image.src = url;
        image.decode().then(() => {
            if (active) setLogo(image);
        }).catch(() => {
            if (active) setError('تعذّر قراءة الشعار. اختر ملف PNG أو JPG أو WebP سليماً.');
        });
        return () => {
            active = false;
            URL.revokeObjectURL(url);
            setImagePreviewUrl(null);
        };
    }, [imageFile]);

    useEffect(() => {
        if (!pdfFile) return;
        let active = true;
        let canvas: HTMLCanvasElement | undefined;
        setPreviewLoading(true);
        withPdf(pdfFile, async doc => {
            const page = await doc.getPage(1);
            const size = page.getViewport({ scale: 1 });
            canvas = await renderPdfPage(page, 1.5, 1000);
            if (active) setPreview({ canvas, width: size.width, height: size.height });
            else clearCanvas(canvas);
        }).catch(error => {
            if (active) setError(pdfError(error, 'تعذّر عرض المعاينة. تأكد من سلامة ملف PDF.'));
        }).finally(() => {
            if (active) setPreviewLoading(false);
        });
        return () => {
            active = false;
            if (canvas) clearCanvas(canvas);
        };
    }, [pdfFile]);

    const paintWatermark = useCallback((context: CanvasRenderingContext2D, width: number, height: number) => {
        context.save();
        context.globalAlpha = watermarkType === 'text' ? textOpacity : imageOpacity;
        if (watermarkType === 'image') {
            if (logo) {
                const scale = Math.min(width * imageScale / 100 / logo.naturalWidth, height * 0.9 / logo.naturalHeight);
                const imageWidth = logo.naturalWidth * scale;
                const imageHeight = logo.naturalHeight * scale;
                context.drawImage(logo, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
            }
        } else {
            context.fillStyle = textColor;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.direction = /[\u0600-\u08ff]/.test(text) ? 'rtl' : 'ltr';
            const size = Math.min(textSize, height / 4);
            context.font = `bold ${size}px Arial, sans-serif`;
            const angle = -rotationAngle * Math.PI / 180;
            function stamp(x: number, y: number, rotation: number, maxWidth: number) {
                context.save();
                context.translate(x, y);
                context.rotate(rotation);
                context.fillText(text, 0, 0, maxWidth);
                context.restore();
            }
            if (layout === 'grid-repeat') {
                const columns = Math.max(1, Math.min(12, Math.floor(width / 240)));
                const rows = Math.max(1, Math.min(16, Math.floor(height / 140)));
                for (let row = 0; row < rows; row++) {
                    for (let column = 0; column < columns; column++) {
                        stamp((column + 0.5) * width / columns, (row + 0.5) * height / rows, angle, width / columns * 0.85);
                    }
                }
            } else {
                const edge = Math.min(height / 4, size / 2 + 14);
                const y = layout === 'top-header' ? edge : layout === 'bottom-footer' ? height - edge : height / 2;
                stamp(width / 2, y, layout === 'center-diagonal' ? angle : 0, width * 0.88);
            }
        }
        context.restore();
    }, [watermarkType, textOpacity, imageOpacity, logo, imageScale, textColor, text, textSize, rotationAngle, layout]);

    useEffect(() => {
        const canvas = previewCanvasRef.current;
        if (!canvas || !preview || previewLoading || !preview.canvas.width) return;
        canvas.width = preview.canvas.width;
        canvas.height = preview.canvas.height;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(preview.canvas, 0, 0);
        context.scale(canvas.width / preview.width, canvas.height / preview.height);
        paintWatermark(context, preview.width, preview.height);
    }, [preview, previewLoading, paintWatermark]);

    const handleApplyWatermark = async () => {
        if (!pdfFile) return;
        if (watermarkType === 'image' ? !logo : !text.trim()) {
            setError(watermarkType === 'image' ? 'اختر صورة صالحة للعلامة المائية.' : 'اكتب نص العلامة المائية.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const { PDFDocument, degrees } = await import('pdf-lib');
            const pdf = await PDFDocument.load(await pdfFile.arrayBuffer(), { updateMetadata: false });
            const overlayCache = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
            for (const page of pdf.getPages()) {
                const view = getVisiblePage(page);
                const { width, height } = view;
                const key = `${width}x${height}`;
                let overlay = overlayCache.get(key);
                if (!overlay) {
                    const scale = Math.min(2, 3600 / Math.max(width, height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.ceil(width * scale));
                    canvas.height = Math.max(1, Math.ceil(height * scale));
                    const context = canvas.getContext('2d');
                    if (!context) throw new Error('Canvas unavailable');
                    context.scale(canvas.width / width, canvas.height / height);
                    paintWatermark(context, width, height);
                    try {
                        overlay = await pdf.embedPng(await (await canvasToBlob(canvas)).arrayBuffer());
                    } finally {
                        clearCanvas(canvas);
                    }
                    overlayCache.set(key, overlay);
                }
                page.drawImage(overlay, { ...view.toPdfPoint(0, height), width, height, rotate: degrees(view.rotation) });
            }
            download(await pdf.save(), pdfFile.name.replace(/\.pdf$/i, '') + '_watermarked.pdf', 'application/pdf');
        } catch (error) {
            setError(pdfError(error, 'تعذّر إضافة العلامة المائية إلى ملف PDF.'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            {!pdfFile ? (
                <FileUploader onFilesSelected={onPdfSelected} multiple={false} accept=".pdf" />
            ) : (
                <div className="space-y-6">
                    {/* Header info */}
                    <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                                🔖
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm">{pdfFile.name}</h3>
                                <p className="text-xs text-slate-500">جاهز لإضافة العلامة المائية وحماية الملكية</p>
                            </div>
                        </div>
                        <button
                            onClick={() => { setPdfFile(null); setImageFile(null); }}
                            className="text-xs text-slate-500 hover:text-slate-800 font-bold px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                            تغيير الملف
                        </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        {/* Settings Controls (Left/Main in RTL) */}
                        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                            {/* Type Switcher */}
                            <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl">
                                <button
                                    onClick={() => setWatermarkType('text')}
                                    className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                                        watermarkType === 'text'
                                            ? 'bg-white text-blue-600 shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    نص علامة مائية
                                </button>
                                <button
                                    onClick={() => setWatermarkType('image')}
                                    className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                                        watermarkType === 'image'
                                            ? 'bg-white text-blue-600 shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    شعار أو صورة
                                </button>
                            </div>

                            {/* Text Controls */}
                            {watermarkType === 'text' ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                            نص العلامة المائية (عربي أو إنجليزي)
                                        </label>
                                        <input
                                            type="text"
                                            value={text}
                                            onChange={(e) => setText(e.target.value)}
                                            placeholder="اكتب النص هنا (مثلاً: سري للغاية، نموذج...)"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-medium"
                                        />
                                    </div>

                                    {/* Layout Options */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1.5">نمط التوزيع والموضع</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'center-diagonal', label: 'في المنتصف (مائل)' },
                                                { id: 'grid-repeat', label: 'شبكة مكررة (أمان)' },
                                                { id: 'top-header', label: 'رأس الصفحة' },
                                                { id: 'bottom-footer', label: 'تذييل الصفحة' },
                                            ].map((m) => (
                                                <button
                                                    key={m.id}
                                                    type="button"
                                                    onClick={() => setLayout(m.id as WatermarkLayout)}
                                                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all text-center ${
                                                        layout === m.id
                                                            ? 'border-blue-500 bg-blue-50/60 text-blue-700'
                                                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    {m.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Color & Size */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1.5">لون النص</label>
                                            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-1.5">
                                                <input
                                                    type="color"
                                                    value={textColor}
                                                    onChange={(e) => setTextColor(e.target.value)}
                                                    className="w-8 h-8 rounded-xl cursor-pointer border-0 bg-transparent"
                                                />
                                                <span className="text-xs font-mono font-bold text-slate-600 uppercase">{textColor}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1.5">حجم الخط ({textSize}px)</label>
                                            <input
                                                type="range"
                                                min="18"
                                                max="90"
                                                value={textSize}
                                                onChange={(e) => setTextSize(parseInt(e.target.value))}
                                                className="w-full accent-blue-600 mt-2"
                                            />
                                        </div>
                                    </div>

                                    {/* Opacity & Rotation */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                                الشفافية ({Math.round(textOpacity * 100)}%)
                                            </label>
                                            <input
                                                type="range"
                                                min="0.1"
                                                max="1"
                                                step="0.05"
                                                value={textOpacity}
                                                onChange={(e) => setTextOpacity(parseFloat(e.target.value))}
                                                className="w-full accent-blue-600 mt-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                                زاوية الميل ({rotationAngle}°)
                                            </label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="90"
                                                step="5"
                                                value={rotationAngle}
                                                onChange={(e) => setRotationAngle(parseInt(e.target.value))}
                                                className="w-full accent-blue-600 mt-2"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* Image Controls */
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1.5">اختر صورة الشعار</label>
                                        <input
                                            type="file"
                                            accept="image/png, image/jpeg, image/webp"
                                            onChange={event => {
                                                if (event.currentTarget.files?.length) onImageSelected(Array.from(event.currentTarget.files));
                                                event.currentTarget.value = '';
                                            }}
                                            className="w-full text-xs text-slate-500 file:mr-0 file:ml-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                                        />
                                    </div>

                                    {imagePreviewUrl && (
                                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3">
                                            <img src={imagePreviewUrl} alt="Logo preview" className="w-12 h-12 object-contain bg-white rounded-xl border border-slate-200" />
                                            <div className="text-xs">
                                                <p className="font-bold text-slate-800">{imageFile?.name}</p>
                                                <p className="text-slate-500">{((imageFile?.size || 0) / 1024).toFixed(1)} KB</p>
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                            حجم الشعار ({imageScale}%)
                                        </label>
                                        <input
                                            type="range"
                                            min="10"
                                            max="90"
                                            value={imageScale}
                                            onChange={(e) => setImageScale(parseInt(e.target.value))}
                                            className="w-full accent-blue-600"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                            الشفافية ({Math.round(imageOpacity * 100)}%)
                                        </label>
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="1"
                                            step="0.05"
                                            value={imageOpacity}
                                            onChange={(e) => setImageOpacity(parseFloat(e.target.value))}
                                            className="w-full accent-blue-600"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Submit Button */}
                            <div className="pt-2">
                                <button
                                    onClick={handleApplyWatermark}
                                    disabled={isLoading || (watermarkType === 'image' && !logo)}
                                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 px-6 rounded-2xl hover:opacity-95 shadow-lg shadow-blue-500/25 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isLoading ? (
                                        <>
                                            <LoadingSpinner />
                                            <span>جاري تطبيق العلامة المائية...</span>
                                        </>
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-5 h-5" />
                                            <span>تطبيق العلامة المائية وتنزيل الـ PDF</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Live Preview Panel (Right in RTL) */}
                        <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center">
                            <div className="w-full flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                                <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                                    <span>👁️</span>
                                    <span>معاينة حية فورية (الصفحة 1)</span>
                                </span>
                                <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2.5 py-1 rounded-full">
                                    تحديث تلقائي
                                </span>
                            </div>

                            <div className="relative max-h-[580px] max-w-full overflow-auto rounded-2xl border border-slate-200 bg-slate-100 p-3 shadow-inner flex items-center justify-center">
                                {previewLoading ? (
                                    <div className="py-24 text-center">
                                        <LoadingSpinner />
                                        <p className="text-xs text-slate-500 mt-2 font-medium">جاري تحميل المعاينة...</p>
                                    </div>
                                ) : (
                                    <canvas
                                        ref={previewCanvasRef}
                                        className="max-w-full h-auto object-contain rounded-lg shadow-md bg-white"
                                    />
                                )}
                            </div>
                        </div>
                    </div>
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

export default AddWatermarkPdf;
