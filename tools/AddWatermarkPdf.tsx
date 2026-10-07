import React, { useState, useCallback, useEffect, useRef } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { TagIcon, ArrowDownTrayIcon, PhotoIcon, SparklesIcon } from '../components/icons';

declare const PDFLib: any;
declare const pdfjsLib: any;
declare const download: any;

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

    // Preview
    const [previewLoading, setPreviewLoading] = useState(false);
    const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const pdfPageImageRef = useRef<HTMLImageElement | null>(null);

    const onPdfSelected = useCallback((files: File[]) => {
        if (files.length > 0) {
            setPdfFile(files[0]);
            setError(null);
            pdfPageImageRef.current = null;
        }
    }, []);

    const onImageSelected = useCallback((files: File[]) => {
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            setImageFile(files[0]);
            const url = URL.createObjectURL(files[0]);
            setImagePreviewUrl(url);
            setError(null);
        } else {
            setError('يرجى اختيار ملف صورة صالح (PNG أو JPG).');
        }
    }, []);

    // Render first page of PDF for preview
    useEffect(() => {
        if (!pdfFile) return;
        let isMounted = true;

        const loadFirstPage = async () => {
            setPreviewLoading(true);
            try {
                const arrayBuffer = await pdfFile.arrayBuffer();
                const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
                const page = await doc.getPage(1);
                const viewport = page.getViewport({ scale: 1.2 });

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = viewport.width;
                tempCanvas.height = viewport.height;
                const ctx = tempCanvas.getContext('2d');
                if (ctx) {
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    const img = new Image();
                    img.src = tempCanvas.toDataURL();
                    img.onload = () => {
                        if (isMounted) {
                            pdfPageImageRef.current = img;
                            drawLivePreview();
                            setPreviewLoading(false);
                        }
                    };
                }
            } catch (err) {
                console.error(err);
                if (isMounted) setPreviewLoading(false);
            }
        };

        loadFirstPage();

        return () => {
            isMounted = false;
        };
    }, [pdfFile]);

    // Redraw live preview whenever watermark settings change
    const drawLivePreview = useCallback(() => {
        const canvas = previewCanvasRef.current;
        const baseImg = pdfPageImageRef.current;
        if (!canvas || !baseImg) return;

        canvas.width = baseImg.width;
        canvas.height = baseImg.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw PDF page base
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(baseImg, 0, 0);

        // Draw watermark overlay
        ctx.save();
        ctx.globalAlpha = watermarkType === 'text' ? textOpacity : imageOpacity;

        if (watermarkType === 'text') {
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${textSize}px 'Cairo', 'Arial', sans-serif`;

            if (layout === 'center-diagonal') {
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((-rotationAngle * Math.PI) / 180);
                ctx.fillText(text, 0, 0);
            } else if (layout === 'grid-repeat') {
                const stepX = 260;
                const stepY = 180;
                for (let x = -canvas.width; x < canvas.width * 2; x += stepX) {
                    for (let y = -canvas.height; y < canvas.height * 2; y += stepY) {
                        ctx.save();
                        ctx.translate(x, y);
                        ctx.rotate((-rotationAngle * Math.PI) / 180);
                        ctx.fillText(text, 0, 0);
                        ctx.restore();
                    }
                }
            } else if (layout === 'top-header') {
                ctx.fillText(text, canvas.width / 2, 50);
            } else if (layout === 'bottom-footer') {
                ctx.fillText(text, canvas.width / 2, canvas.height - 40);
            }
        } else if (watermarkType === 'image' && imagePreviewUrl) {
            const logoImg = new Image();
            logoImg.src = imagePreviewUrl;
            if (logoImg.complete) {
                const targetWidth = (canvas.width * (imageScale / 100));
                const targetHeight = (logoImg.height / logoImg.width) * targetWidth;
                const x = (canvas.width - targetWidth) / 2;
                const y = (canvas.height - targetHeight) / 2;
                ctx.drawImage(logoImg, x, y, targetWidth, targetHeight);
            } else {
                logoImg.onload = () => drawLivePreview();
            }
        }

        ctx.restore();
    }, [watermarkType, layout, text, textColor, textOpacity, textSize, rotationAngle, imageOpacity, imageScale, imagePreviewUrl]);

    useEffect(() => {
        drawLivePreview();
    }, [drawLivePreview]);

    // Create high-resolution watermark image overlay for a specific PDF page size
    const createWatermarkOverlayPng = async (pageWidth: number, pageHeight: number): Promise<Uint8Array> => {
        const scale = 2.0; // High resolution
        const canvas = document.createElement('canvas');
        canvas.width = pageWidth * scale;
        canvas.height = pageHeight * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not create canvas context");

        ctx.save();
        ctx.scale(scale, scale);
        ctx.globalAlpha = watermarkType === 'text' ? textOpacity : imageOpacity;

        if (watermarkType === 'text') {
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${textSize}px 'Cairo', 'Arial', sans-serif`;

            if (layout === 'center-diagonal') {
                ctx.translate(pageWidth / 2, pageHeight / 2);
                ctx.rotate((-rotationAngle * Math.PI) / 180);
                ctx.fillText(text, 0, 0);
            } else if (layout === 'grid-repeat') {
                const stepX = 260;
                const stepY = 180;
                for (let x = -pageWidth; x < pageWidth * 2; x += stepX) {
                    for (let y = -pageHeight; y < pageHeight * 2; y += stepY) {
                        ctx.save();
                        ctx.translate(x, y);
                        ctx.rotate((-rotationAngle * Math.PI) / 180);
                        ctx.fillText(text, 0, 0);
                        ctx.restore();
                    }
                }
            } else if (layout === 'top-header') {
                ctx.fillText(text, pageWidth / 2, 40);
            } else if (layout === 'bottom-footer') {
                ctx.fillText(text, pageWidth / 2, pageHeight - 30);
            }
        } else if (watermarkType === 'image' && imageFile) {
            const imgBitmap = await createImageBitmap(imageFile);
            const targetWidth = (pageWidth * (imageScale / 100));
            const targetHeight = (imgBitmap.height / imgBitmap.width) * targetWidth;
            const x = (pageWidth - targetWidth) / 2;
            const y = (pageHeight - targetHeight) / 2;
            ctx.drawImage(imgBitmap, x, y, targetWidth, targetHeight);
        }

        ctx.restore();

        return new Promise<Uint8Array>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) return reject(new Error("Failed to create watermark blob"));
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(new Uint8Array(reader.result as ArrayBuffer));
                };
                reader.readAsArrayBuffer(blob);
            }, 'image/png');
        });
    };

    const handleApplyWatermark = async () => {
        if (!pdfFile) return;
        if (watermarkType === 'image' && !imageFile) {
            setError("يرجى اختيار ملف صورة للعلامة المائية.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const { PDFDocument } = PDFLib;
            const arrayBuffer = await pdfFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const pages = pdfDoc.getPages();

            // Cache watermark overlays by dimensions to avoid regenerating for same-sized pages
            const overlayCache = new Map<string, any>();

            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const { width, height } = page.getSize();
                const key = `${Math.round(width)}x${Math.round(height)}`;

                let embeddedOverlay = overlayCache.get(key);
                if (!embeddedOverlay) {
                    const pngBytes = await createWatermarkOverlayPng(width, height);
                    embeddedOverlay = await pdfDoc.embedPng(pngBytes);
                    overlayCache.set(key, embeddedOverlay);
                }

                page.drawImage(embeddedOverlay, {
                    x: 0,
                    y: 0,
                    width,
                    height,
                });
            }

            const pdfBytes = await pdfDoc.save();
            const cleanName = pdfFile.name.replace(/\.pdf$/i, '') + '_watermarked.pdf';
            download(pdfBytes, cleanName, "application/pdf");

            setIsLoading(false);
        } catch (e: any) {
            console.error(e);
            setError(e.message || "حدث خطأ أثناء إضافة العلامة المائية.");
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
                                            onChange={(e) => e.target.files && onImageSelected(Array.from(e.target.files))}
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
                                    disabled={isLoading}
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

                            <div className="relative max-h-[580px] overflow-auto rounded-2xl border border-slate-200 bg-slate-100 p-3 shadow-inner flex items-center justify-center">
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
