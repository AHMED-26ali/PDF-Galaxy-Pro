import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { ListBulletIcon, ArrowDownTrayIcon, SparklesIcon } from '../components/icons';

import { canvasToBlob, downloadFile as download, pdfError } from './pdfRuntime';
import { getVisiblePage } from './pdf-pages/pdfOperations';

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

    async function createNumberImage(text: string, size: number) {
        const scale = 3;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        const font = `bold ${size * scale}px Arial, sans-serif`;
        context.font = font;
        canvas.width = Math.ceil(context.measureText(text).width + 6);
        canvas.height = Math.ceil(size * scale * 1.4);
        context.font = font;
        context.fillStyle = '#334155';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.direction = 'rtl';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        return (await canvasToBlob(canvas)).arrayBuffer();
    }

    const handleAddNumbers = async () => {
        if (!file) return;
        if (!Number.isSafeInteger(startFrom) || startFrom < 1 || startFrom > 999999) {
            setError('اكتب رقماً صحيحاً لبدء الترقيم من 1 إلى 999999.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const { PDFDocument, StandardFonts, degrees, rgb } = await import('pdf-lib');
            const pdf = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
            const pages = pdf.getPages();
            const font = await pdf.embedFont(StandardFonts.HelveticaBold);
            for (const [index, page] of pages.entries()) {
                const view = getVisiblePage(page);
                const text = formatNumberText(startFrom + index, startFrom + pages.length - 1);
                const image = format === 'arabic-text' ? await pdf.embedPng(await createNumberImage(text, fontSize)) : null;
                const naturalWidth = image ? image.width / 3 : font.widthOfTextAtSize(text, fontSize);
                const naturalHeight = image ? image.height / 3 : font.heightAtSize(fontSize);
                const inset = Math.min(margin, view.width / 4, view.height / 4);
                const factor = Math.min(1, (view.width - 2 * inset) / naturalWidth, (view.height - 2 * inset) / naturalHeight);
                const width = naturalWidth * factor;
                const height = naturalHeight * factor;
                const x = position.endsWith('left') ? inset : position.endsWith('right') ? view.width - inset - width : (view.width - width) / 2;
                const top = position.startsWith('top') ? inset : view.height - inset - height;
                const start = view.toPdfPoint(x, top + height);
                const rotate = degrees(view.rotation);
                if (image) {
                    page.drawImage(image, { ...start, width, height, rotate });
                } else {
                    page.drawText(text, { ...start, font, size: fontSize * factor, rotate, color: rgb(0.2, 0.25, 0.33) });
                }
            }
            download(await pdf.save(), file.name.replace(/\.pdf$/i, '') + '_numbered.pdf', 'application/pdf');
        } catch (error) {
            setError(pdfError(error, 'تعذّر إضافة أرقام الصفحات. تأكد من سلامة الملف.'));
        } finally {
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
                            disabled={isLoading}
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
                                    حجم الخط ({fontSize} نقطة)
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
                                    الهامش من الحافة ({margin} نقطة)
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

                        <label className="block space-y-1 text-sm font-bold text-slate-700">
                            <span>بدء الترقيم من</span>
                            <input type="number" min="1" max="999999" step="1" value={startFrom || ''} onChange={event => setStartFrom(Number(event.currentTarget.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900" />
                        </label>

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
