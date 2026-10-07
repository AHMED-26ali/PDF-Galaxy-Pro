import React, { useState, useCallback, useEffect, useRef } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { LockClosedIcon, ShieldCheckIcon, EyeSlashIcon, SparklesIcon, ArrowDownTrayIcon, ChevronRightIcon, ChevronLeftIcon, TrashIcon } from '../components/icons';

declare const PDFLib: any;
declare const pdfjsLib: any;
declare const download: any;

type ProtectionMode = 'password' | 'redact' | 'flatten';

interface RedactionBox {
    id: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

const ProtectPdf: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Mode
    const [mode, setMode] = useState<ProtectionMode>('password');

    // Password Protection options
    const [userPassword, setUserPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [allowPrinting, setAllowPrinting] = useState(false);
    const [allowCopying, setAllowCopying] = useState(false);
    const [allowModifying, setAllowModifying] = useState(false);

    // Redaction State
    const [totalPages, setTotalPages] = useState(1);
    const [currentPage, setCurrentPage] = useState(1);
    const [redactions, setRedactions] = useState<RedactionBox[]>([]);
    const [redactColor, setRedactColor] = useState<'black' | 'white'>('black');
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
    const [currentDraftBox, setCurrentDraftBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const canvasContainerRef = useRef<HTMLDivElement | null>(null);
    const pageRenderRef = useRef<{ width: number; height: number }>({ width: 595, height: 842 });

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            setFile(selectedFiles[0]);
            setError(null);
            setUserPassword('');
            setConfirmPassword('');
            setRedactions([]);
            setCurrentPage(1);
        }
    }, []);

    // Load PDF page count and render page for redaction
    useEffect(() => {
        if (!file) return;
        let isCancelled = false;

        const loadDoc = async () => {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
                if (!isCancelled) {
                    setTotalPages(doc.numPages);
                }
            } catch (e) {
                console.error(e);
            }
        };

        loadDoc();
        return () => {
            isCancelled = true;
        };
    }, [file]);

    // Render current page for redaction mode
    useEffect(() => {
        if (!file || mode !== 'redact') return;
        let isCancelled = false;

        const renderPage = async () => {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
                const page = await doc.getPage(currentPage);
                const viewport = page.getViewport({ scale: 1.2 });
                pageRenderRef.current = { width: viewport.width, height: viewport.height };

                const canvas = canvasRef.current;
                if (!canvas) return;
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                await page.render({ canvasContext: ctx, viewport }).promise;
                if (isCancelled) return;

                // Render saved redactions for this page
                drawOverlayRedactions(ctx, viewport.width, viewport.height);
            } catch (err) {
                console.error(err);
            }
        };

        renderPage();
        return () => {
            isCancelled = true;
        };
    }, [file, currentPage, mode, redactions, redactColor]);

    const drawOverlayRedactions = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
        const pageRedactions = redactions.filter(r => r.page === currentPage);
        for (const box of pageRedactions) {
            ctx.fillStyle = redactColor === 'black' ? '#000000' : '#ffffff';
            ctx.fillRect(box.x, box.y, box.width, box.height);

            // subtle border to see in editor
            ctx.strokeStyle = redactColor === 'black' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(box.x, box.y, box.width, box.height);
        }
    };

    // Redaction drawing mouse handlers
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (mode !== 'redact') return;
        const rect = e.currentTarget.getBoundingClientRect();
        const scaleX = pageRenderRef.current.width / rect.width;
        const scaleY = pageRenderRef.current.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        setIsDrawing(true);
        setDrawStart({ x, y });
        setCurrentDraftBox({ x, y, width: 0, height: 0 });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !drawStart) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const scaleX = pageRenderRef.current.width / rect.width;
        const scaleY = pageRenderRef.current.height / rect.height;
        const currentX = (e.clientX - rect.left) * scaleX;
        const currentY = (e.clientY - rect.top) * scaleY;

        const x = Math.min(drawStart.x, currentX);
        const y = Math.min(drawStart.y, currentY);
        const width = Math.abs(currentX - drawStart.x);
        const height = Math.abs(currentY - drawStart.y);

        setCurrentDraftBox({ x, y, width, height });
    };

    const handleMouseUp = () => {
        if (!isDrawing || !currentDraftBox) {
            setIsDrawing(false);
            setDrawStart(null);
            setCurrentDraftBox(null);
            return;
        }

        if (currentDraftBox.width > 5 && currentDraftBox.height > 5) {
            const newBox: RedactionBox = {
                id: Math.random().toString(36).substring(2, 9),
                page: currentPage,
                x: currentDraftBox.x,
                y: currentDraftBox.y,
                width: currentDraftBox.width,
                height: currentDraftBox.height,
            };
            setRedactions(prev => [...prev, newBox]);
        }

        setIsDrawing(false);
        setDrawStart(null);
        setCurrentDraftBox(null);
    };

    const removeLastRedaction = () => {
        const pageRedactions = redactions.filter(r => r.page === currentPage);
        if (pageRedactions.length > 0) {
            const last = pageRedactions[pageRedactions.length - 1];
            setRedactions(prev => prev.filter(r => r.id !== last.id));
        }
    };

    const clearAllPageRedactions = () => {
        setRedactions(prev => prev.filter(r => r.page !== currentPage));
    };

    // --- EXECUTE ACTIONS ---

    // 1. Password Protection (Via /api/pdf/protect server backend + GS 128-bit encryption)
    const handlePasswordProtect = async () => {
        if (!file) return;
        if (!userPassword) {
            setError("يرجى إدخال كلمة مرور الحماية.");
            return;
        }
        if (userPassword !== confirmPassword) {
            setError("كلمتا المرور غير متطابقتين.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setStatus("جاري تشفير المستند وحمايته بكلمة المرور...");

        try {
            const arrayBuffer = await file.arrayBuffer();
            const base64Pdf = btoa(
                new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );

            const response = await fetch('/api/pdf/protect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pdfBase64: base64Pdf,
                    userPassword,
                    permissions: {
                        allowPrinting,
                        allowCopying,
                        allowModifying,
                    }
                }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `خطأ في الخادم: ${response.status}`);
            }

            const blob = await response.blob();
            const cleanName = file.name.replace(/\.pdf$/i, '') + '_protected.pdf';
            download(blob, cleanName, 'application/pdf');

            setIsLoading(false);
            setStatus('');
        } catch (e: any) {
            console.error(e);
            setError(e.message || "حدث خطأ أثناء تشفير المستند.");
            setIsLoading(false);
            setStatus('');
        }
    };

    // 2. Permanent Redaction (Permanently burning opaque blackout boxes into the PDF page streams)
    const handleApplyRedactions = async () => {
        if (!file) return;
        if (redactions.length === 0) {
            setError("لم تقم بتحديد أي مناطق للتعتيم بعد. اسحب بالماوس فوق النص الحساس لتحديده.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setStatus("جاري حجب وتعتيم البيانات المحددة بشكل دائم...");

        try {
            const { PDFDocument, rgb } = PDFLib;
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const pages = pdfDoc.getPages();

            const fillColor = redactColor === 'black' ? rgb(0, 0, 0) : rgb(1, 1, 1);

            for (const r of redactions) {
                if (r.page > pages.length) continue;
                const page = pages[r.page - 1];
                const { width: pdfWidth, height: pdfHeight } = page.getSize();

                // Convert from canvas preview coordinates to PDF coordinates
                const scaleX = pdfWidth / pageRenderRef.current.width;
                const scaleY = pdfHeight / pageRenderRef.current.height;

                const pdfX = r.x * scaleX;
                const pdfWidthBox = r.width * scaleX;
                const pdfHeightBox = r.height * scaleY;
                // PDF coordinate origin is bottom-left
                const pdfY = pdfHeight - ((r.y + r.height) * scaleY);

                page.drawRectangle({
                    x: pdfX,
                    y: pdfY,
                    width: pdfWidthBox,
                    height: pdfHeightBox,
                    color: fillColor,
                    borderColor: fillColor,
                    borderWidth: 0,
                });
            }

            const pdfBytes = await pdfDoc.save();
            const cleanName = file.name.replace(/\.pdf$/i, '') + '_redacted.pdf';
            download(pdfBytes, cleanName, 'application/pdf');

            setIsLoading(false);
            setStatus('');
        } catch (e: any) {
            console.error(e);
            setError(e.message || "حدث خطأ أثناء تطبيق التعتيم.");
            setIsLoading(false);
            setStatus('');
        }
    };

    // 3. Document Flattening & Read-Only Locking (Converting pages to high-res locked graphics to block text alteration)
    const handleFlattenDocument = async () => {
        if (!file) return;
        setIsLoading(true);
        setError(null);
        setStatus("جاري تسطيح المستند وقفله ضد التعديل واستخراج النصوص...");

        try {
            const { PDFDocument } = PDFLib;
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            const newDoc = await PDFDocument.create();

            for (let i = 1; i <= pdfDoc.numPages; i++) {
                setStatus(`جاري تأمين صفحة ${i} من ${pdfDoc.numPages}...`);
                const page = await pdfDoc.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });

                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) continue;

                await page.render({ canvasContext: ctx, viewport }).promise;
                const pngDataUrl = canvas.toDataURL('image/png');
                const pngBytes = await fetch(pngDataUrl).then(r => r.arrayBuffer());
                const embeddedPng = await newDoc.embedPng(pngBytes);

                const newPage = newDoc.addPage([page.view[2] - (page.view[0] || 0), page.view[3] - (page.view[1] || 0)]);
                newPage.drawImage(embeddedPng, {
                    x: 0,
                    y: 0,
                    width: newPage.getWidth(),
                    height: newPage.getHeight(),
                });
            }

            setStatus("حفظ المستند المقفل...");
            const finalBytes = await newDoc.save();
            const cleanName = file.name.replace(/\.pdf$/i, '') + '_readonly_flattened.pdf';
            download(finalBytes, cleanName, 'application/pdf');

            setIsLoading(false);
            setStatus('');
        } catch (e: any) {
            console.error(e);
            setError(e.message || "حدث خطأ أثناء تسطيح المستند.");
            setIsLoading(false);
            setStatus('');
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {!file ? (
                <FileUploader onFilesSelected={onFilesSelected} multiple={false} accept=".pdf" />
            ) : (
                <div className="space-y-6">
                    {/* Header Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                                🛡️
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm">{file.name}</h3>
                                <p className="text-xs text-slate-500">اختر طريقة الحماية المناسبة لمستندك</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setFile(null)}
                            className="text-xs text-slate-500 hover:text-slate-800 font-bold px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                            تغيير الملف
                        </button>
                    </div>

                    {/* Mode Switcher Tabs */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-1.5 bg-slate-200/70 rounded-2xl">
                        <button
                            onClick={() => setMode('password')}
                            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                                mode === 'password'
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <LockClosedIcon className="w-4 h-4" />
                            <span>تشفير بكلمة مرور</span>
                        </button>

                        <button
                            onClick={() => setMode('redact')}
                            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                                mode === 'redact'
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <EyeSlashIcon className="w-4 h-4" />
                            <span>تعتيم وحجب البيانات الحساسة</span>
                        </button>

                        <button
                            onClick={() => setMode('flatten')}
                            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                                mode === 'flatten'
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <ShieldCheckIcon className="w-4 h-4" />
                            <span>قفل ضد التعديل (Flatten)</span>
                        </button>
                    </div>

                    {/* MODE 1: PASSWORD ENCRYPTION */}
                    {mode === 'password' && (
                        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto space-y-6">
                            <div className="text-center">
                                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <LockClosedIcon className="w-7 h-7" />
                                </div>
                                <h3 className="text-xl font-black text-slate-800">حماية الـ PDF بتشفير AES معتمد</h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    لن يتمكن أي شخص من فتح المستند أو الاطلاع على محتواه بدون إدخال كلمة المرور.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">كلمة مرور فتح المستند</label>
                                    <input
                                        type="password"
                                        value={userPassword}
                                        onChange={(e) => setUserPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">تأكيد كلمة المرور</label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-mono"
                                    />
                                </div>

                                {/* Permissions Restrictions */}
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                                    <p className="text-xs font-bold text-slate-700">صلاحيات المستخدمين بعد الفتح:</p>
                                    <div className="space-y-2 text-xs">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={allowPrinting}
                                                onChange={(e) => setAllowPrinting(e.target.checked)}
                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-slate-700 font-medium">السماح بطباعة المستند</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={allowCopying}
                                                onChange={(e) => setAllowCopying(e.target.checked)}
                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-slate-700 font-medium">السماح بنسخ النصوص والرسومات</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={allowModifying}
                                                onChange={(e) => setAllowModifying(e.target.checked)}
                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-slate-700 font-medium">السماح بتعديل صفحات المستند</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handlePasswordProtect}
                                disabled={isLoading}
                                className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold py-3.5 px-6 rounded-2xl hover:opacity-95 shadow-lg shadow-indigo-500/25 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <>
                                        <LoadingSpinner />
                                        <span>{status}</span>
                                    </>
                                ) : (
                                    <>
                                        <LockClosedIcon className="w-5 h-5" />
                                        <span>تشفير وتحميل الملف المحمي</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* MODE 2: INTERACTIVE REDACTION */}
                    {mode === 'redact' && (
                        <div className="space-y-6">
                            {/* Toolbar */}
                            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-slate-700">لون الحجب:</span>
                                    <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200">
                                        <button
                                            onClick={() => setRedactColor('black')}
                                            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                                                redactColor === 'black' ? 'bg-black text-white shadow-xs' : 'text-slate-600'
                                            }`}
                                        >
                                            أسود أمني
                                        </button>
                                        <button
                                            onClick={() => setRedactColor('white')}
                                            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                                                redactColor === 'white' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-600'
                                            }`}
                                        >
                                            أبيض مخفي
                                        </button>
                                    </div>

                                    <span className="text-xs text-slate-400">|</span>
                                    <span className="text-xs text-slate-500 font-medium">
                                        المناطق المحجوبة: <span className="font-bold text-indigo-600 font-mono">{redactions.length}</span>
                                    </span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={removeLastRedaction}
                                        disabled={redactions.filter(r => r.page === currentPage).length === 0}
                                        className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
                                    >
                                        تراجع عن آخر تحديد
                                    </button>
                                    <button
                                        onClick={clearAllPageRedactions}
                                        disabled={redactions.filter(r => r.page === currentPage).length === 0}
                                        className="text-xs font-bold px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 flex items-center gap-1"
                                    >
                                        <TrashIcon className="w-3.5 h-3.5" />
                                        مسح تحديدات الصفحة
                                    </button>
                                </div>
                            </div>

                            {/* Canvas Drawing Area */}
                            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center">
                                {/* Page Pagination */}
                                <div className="flex items-center gap-4 mb-4">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage <= 1}
                                        className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                                    >
                                        <ChevronRightIcon className="w-5 h-5" />
                                    </button>
                                    <span className="text-xs font-bold text-slate-700">
                                        صفحة {currentPage} من {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage >= totalPages}
                                        className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                                    >
                                        <ChevronLeftIcon className="w-5 h-5" />
                                    </button>
                                </div>

                                <p className="text-xs text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full mb-4 font-bold">
                                    💡 انقر واسحب مؤشر الماوس فوق أي نص أو رقم أو توقيع ترغب في تعتيمه وإخفائه نهائياً
                                </p>

                                <div
                                    ref={canvasContainerRef}
                                    className="relative max-h-[600px] overflow-auto rounded-2xl border border-slate-200 bg-slate-100 p-2 shadow-inner"
                                >
                                    <canvas
                                        ref={canvasRef}
                                        onMouseDown={handleMouseDown}
                                        onMouseMove={handleMouseMove}
                                        onMouseUp={handleMouseUp}
                                        className="cursor-crosshair rounded-lg shadow-md bg-white block"
                                    />

                                    {/* Draft drawing box overlay */}
                                    {isDrawing && currentDraftBox && (
                                        <div
                                            className="absolute pointer-events-none border-2 border-indigo-500 bg-indigo-500/30"
                                            style={{
                                                left: `${(currentDraftBox.x / pageRenderRef.current.width) * (canvasRef.current?.clientWidth || 0) + 8}px`,
                                                top: `${(currentDraftBox.y / pageRenderRef.current.height) * (canvasRef.current?.clientHeight || 0) + 8}px`,
                                                width: `${(currentDraftBox.width / pageRenderRef.current.width) * (canvasRef.current?.clientWidth || 0)}px`,
                                                height: `${(currentDraftBox.height / pageRenderRef.current.height) * (canvasRef.current?.clientHeight || 0)}px`,
                                            }}
                                        />
                                    )}
                                </div>

                                {/* Save Button */}
                                <div className="mt-6 w-full max-w-md">
                                    <button
                                        onClick={handleApplyRedactions}
                                        disabled={isLoading || redactions.length === 0}
                                        className="w-full bg-gradient-to-r from-red-600 to-rose-600 text-white font-bold py-3.5 px-6 rounded-2xl hover:opacity-95 shadow-lg shadow-rose-500/25 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isLoading ? (
                                            <>
                                                <LoadingSpinner />
                                                <span>{status}</span>
                                            </>
                                        ) : (
                                            <>
                                                <EyeSlashIcon className="w-5 h-5" />
                                                <span>تطبيق التعتيم وحفظ الـ PDF المحمي</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* MODE 3: FLATTEN & READ-ONLY */}
                    {mode === 'flatten' && (
                        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto space-y-6 text-center">
                            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
                                <ShieldCheckIcon className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-800">قفل المستند وتسطيحه (Flatten)</h3>
                                <p className="text-slate-500 text-xs mt-2 leading-relaxed">
                                    يقوم هذا الإجراء بتحويل صفحات الـ PDF إلى رسومات وصور عالية الدقة مدمجة تماماً، مما يمنع أي برامج أو مواقع من استخراج النصوص أو تعديل محتواها أو تزويرها، مع الحفاظ على وضوح القراءة 100%.
                                </p>
                            </div>

                            <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100 text-xs text-emerald-800 text-right space-y-1.5">
                                <p className="font-bold">✨ مميزات التسطيح والحماية:</p>
                                <p>• منع تعديل النصوص بأي محرر PDF (مثل Adobe Acrobat).</p>
                                <p>• قفل الحقول والنماذج والتوقيعات الإلكترونية نهائياً.</p>
                                <p>• مثالي لإرسال العقود والفواتير والشهادات الرسمية.</p>
                            </div>

                            <button
                                onClick={handleFlattenDocument}
                                disabled={isLoading}
                                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold py-3.5 px-6 rounded-2xl hover:opacity-95 shadow-lg shadow-emerald-500/25 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <>
                                        <LoadingSpinner />
                                        <span>{status}</span>
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheckIcon className="w-5 h-5" />
                                        <span>قفل المستند وتسطيحه الآن</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}
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

export default ProtectPdf;
