import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { ListBulletIcon, ArrowDownTrayIcon, SparklesIcon } from '../components/icons';

declare const PDFLib: any;
declare const download: any;

type Position = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
type NumberFormat = 'simple' | 'slash' | 'arabic-text' | 'dash';

const AddPageNumbersPdf: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [position, setPosition] = useState<Position>('bottom-center');
    const [format, setFormat] = useState<NumberFormat>('slash');
    const [fontSize, setFontSize] = useState(12);
    const [margin, setMargin] = useState(25);
    const [startFrom, setStartFrom] = useState(1);

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            setFile(selectedFiles[0]);
            setError(null);
        }
    }, []);

    const formatNumberText = (current: number, total: number): string => {
        switch (format) {
            case 'simple':
                return `${current}`;
            case 'slash':
                return `${current} / ${total}`;
            case 'dash':
                return `- ${current} -`;
            case 'arabic-text':
                return `صفحة ${current} من ${total}`;
            default:
                return `${current}`;
        }
    };

    // Helper to render text to small PNG image so Arabic text ("صفحة 1 من 10") is always 100% supported without fontkit crashes
    const createNumberImage = (text: string, size: number): Promise<Uint8Array> => {
        const scale = 2;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Canvas context failed");

        ctx.font = `bold ${size * scale}px 'Cairo', 'Arial', sans-serif`;
        const textMetrics = ctx.measureText(text);
        const width = Math.ceil(textMetrics.width) + 16;
        const height = Math.ceil(size * scale * 1.5) + 8;

        canvas.width = width;
        canvas.height = height;

        ctx.font = `bold ${size * scale}px 'Cairo', 'Arial', sans-serif`;
        ctx.fillStyle = '#334155'; // Slate-700
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, width / 2, height / 2);

        return new Promise<Uint8Array>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) return reject(new Error("Blob error"));
                const reader = new FileReader();
                reader.onloadend = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
                reader.readAsArrayBuffer(blob);
            }, 'image/png');
        });
    };

    const handleAddNumbers = async () => {
        if (!file) return;
        setIsLoading(true);
        setError(null);

        try {
            const { PDFDocument } = PDFLib;
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const pages = pdfDoc.getPages();
            const total = pages.length;

            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const { width, height } = page.getSize();
                const currentNumber = i + startFrom;
                const textStr = formatNumberText(currentNumber, total);

                const pngBytes = await createNumberImage(textStr, fontSize);
                const embeddedImage = await pdfDoc.embedPng(pngBytes);
                const imgWidth = embeddedImage.width / 2;
                const imgHeight = embeddedImage.height / 2;

                let x = 0;
                let y = 0;

                // Vertical
                if (position.startsWith('bottom')) {
                    y = margin;
                } else {
                    y = height - imgHeight - margin;
                }

                // Horizontal
                if (position.endsWith('left')) {
                    x = margin;
                } else if (position.endsWith('center')) {
                    x = (width - imgWidth) / 2;
                } else {
                    x = width - imgWidth - margin;
                }

                page.drawImage(embeddedImage, {
                    x,
                    y,
                    width: imgWidth,
                    height: imgHeight,
                });
            }

            const pdfBytes = await pdfDoc.save();
            const cleanName = file.name.replace(/\.pdf$/i, '') + '_numbered.pdf';
            download(pdfBytes, cleanName, "application/pdf");

            setIsLoading(false);
        } catch (e: any) {
            console.error(e);
            setError("حدث خطأ أثناء إضافة أرقام الصفحات.");
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {!file ? (
                <FileUploader onFilesSelected={onFilesSelected} multiple={false} accept=".pdf" />
            ) : (
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                                🔢
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm">{file.name}</h3>
                                <p className="text-xs text-slate-500">ترقيم صفحات منظم مع موضع وتنسيق مخصص</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setFile(null)}
                            className="text-xs text-slate-500 hover:text-slate-800 font-bold px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                            تغيير الملف
                        </button>
                    </div>

                    {/* Options Card */}
                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto space-y-6">
                        <div className="text-center">
                            <h3 className="text-xl font-black text-slate-800">إعدادات ترقيم الصفحات</h3>
                            <p className="text-xs text-slate-500 mt-1">خصص التنسيق والموقع لترقيم احترافي</p>
                        </div>

                        {/* Format selector */}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">شكل الترقيم</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'slash', label: '1 / 10 (رقم والكل)' },
                                    { id: 'simple', label: '1 (رقم فقط)' },
                                    { id: 'arabic-text', label: 'صفحة 1 من 10' },
                                    { id: 'dash', label: '- 1 - (بين شرطات)' },
                                ].map(f => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => setFormat(f.id as NumberFormat)}
                                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center ${
                                            format === f.id
                                                ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Position Grid */}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">موضع الرقم على الصفحة</label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: 'top-left', label: 'أعلى اليسار' },
                                    { id: 'top-center', label: 'أعلى الوسط' },
                                    { id: 'top-right', label: 'أعلى اليمين' },
                                    { id: 'bottom-left', label: 'أسفل اليسار' },
                                    { id: 'bottom-center', label: 'أسفل الوسط' },
                                    { id: 'bottom-right', label: 'أسفل اليمين' },
                                ].map(pos => (
                                    <button
                                        key={pos.id}
                                        type="button"
                                        onClick={() => setPosition(pos.id as Position)}
                                        className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center ${
                                            position === pos.id
                                                ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        {pos.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Sliders */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                    حجم الخط ({fontSize}px)
                                </label>
                                <input
                                    type="range"
                                    min="9"
                                    max="24"
                                    value={fontSize}
                                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                                    className="w-full accent-blue-600"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                    الهامش من الحافة ({margin}px)
                                </label>
                                <input
                                    type="range"
                                    min="10"
                                    max="60"
                                    value={margin}
                                    onChange={(e) => setMargin(parseInt(e.target.value))}
                                    className="w-full accent-blue-600"
                                />
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            onClick={handleAddNumbers}
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 px-6 rounded-2xl hover:opacity-95 shadow-lg shadow-blue-500/25 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isLoading ? (
                                <>
                                    <LoadingSpinner />
                                    <span>جاري ترقيم الصفحات...</span>
                                </>
                            ) : (
                                <>
                                    <SparklesIcon className="w-5 h-5" />
                                    <span>ترقيم الصفحات وتنزيل الملف</span>
                                </>
                            )}
                        </button>
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

export default AddPageNumbersPdf;
