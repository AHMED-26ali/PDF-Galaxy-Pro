import React, { useState, useCallback, useEffect, useRef } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { LockClosedIcon, ShieldCheckIcon, EyeSlashIcon, SparklesIcon, ArrowDownTrayIcon, ChevronRightIcon, ChevronLeftIcon, TrashIcon } from '../components/icons';

import { paintRedactions, type RedactionStyle } from './redactionMask';
import { canvasToBlob, clearCanvas, downloadFile as download, pdfError, renderPdfPage, withPdf } from './pdfRuntime';

type ProtectionMode = 'password' | 'redact' | 'flatten';

type Point = { x: number; y: number };
type Region = Point & { width: number; height: number };
type RedactionBox = Region & { id: string; page: number };

function pointerPoint(event: React.PointerEvent<HTMLDivElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
        y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
}

function selection(start: Point, end: Point): Region {
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(start.x - end.x),
        height: Math.abs(start.y - end.y),
    };
}

function boxStyle(box: Region) {
    return { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` };
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
    const [redactStyle, setRedactStyle] = useState<RedactionStyle>('frosted');
    const [draft, setDraft] = useState<Region | null>(null);
    const [preview, setPreview] = useState<{ file: File; page: number; canvas: HTMLCanvasElement } | null>(null);
    const previewCanvas = useRef<HTMLCanvasElement>(null);
    const drawStart = useRef<Point | null>(null);

    const onFilesSelected = useCallback((files: File[]) => {
        if (!files[0]) return;
        setFile(files[0]);
        setError(null);
        setUserPassword('');
        setConfirmPassword('');
        setRedactions([]);
        setCurrentPage(1);
        setTotalPages(1);
    }, []);

    useEffect(() => {
        if (!file || mode !== 'redact') return;
        let active = true;
        let canvas: HTMLCanvasElement | undefined;
        withPdf(file, async pdf => {
            if (!active) return;
            setTotalPages(pdf.numPages);
            canvas = await renderPdfPage(await pdf.getPage(currentPage), 1.5, 1050);
            if (active) setPreview({ file, page: currentPage, canvas });
            else clearCanvas(canvas);
        }).catch(error => {
            if (active) setError(pdfError(error, 'تعذّر عرض الصفحة. تأكد من سلامة ملف PDF.'));
        });
        return () => {
            active = false;
            if (canvas) clearCanvas(canvas);
        };
    }, [file, currentPage, mode]);

    const currentPreview = preview?.file === file && preview.page === currentPage && preview.canvas.width ? preview : null;
    useEffect(() => {
        const target = previewCanvas.current;
        if (!target || mode !== 'redact' || !currentPreview?.canvas.width) return;
        const source = currentPreview.canvas;
        target.width = source.width;
        target.height = source.height;
        const context = target.getContext('2d');
        if (!context) return;
        context.drawImage(source, 0, 0);
        paintRedactions(target, redactions.filter(box => box.page === currentPage), redactStyle);
    }, [currentPreview, currentPage, mode, redactions, redactStyle]);

    function startSelection(event: React.PointerEvent<HTMLDivElement>) {
        if (!event.isPrimary || event.button !== 0 || isLoading) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drawStart.current = pointerPoint(event);
    }

    function moveSelection(event: React.PointerEvent<HTMLDivElement>) {
        if (drawStart.current) setDraft(selection(drawStart.current, pointerPoint(event)));
    }

    function clearSelection() {
        drawStart.current = null;
        setDraft(null);
    }

    function endSelection(event: React.PointerEvent<HTMLDivElement>) {
        if (drawStart.current) {
            const box = selection(drawStart.current, pointerPoint(event));
            if (box.width > 0.008 && box.height > 0.008) {
                const area = { ...box, id: crypto.randomUUID(), page: currentPage };
                setRedactions(current => [...current, area]);
            }
        }
        clearSelection();
    }

    function removeLastRedaction() {
        const last = redactions.filter(box => box.page === currentPage).at(-1);
        if (last) setRedactions(current => current.filter(box => box.id !== last.id));
    }

    function clearAllPageRedactions() {
        setRedactions(current => current.filter(box => box.page !== currentPage));
    }

    async function handlePasswordProtect() {
        if (!file) return;
        if (!userPassword.trim()) {
            setError('اكتب كلمة مرور لفتح المستند.');
            return;
        }
        if (userPassword !== confirmPassword) {
            setError('كلمتا المرور غير متطابقتين.');
            return;
        }
        if (new TextEncoder().encode(userPassword).length > 127) {
            setError('كلمة المرور طويلة جداً. اختر كلمة مرور أقصر.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setStatus('جاري تشفير المستند داخل المتصفح…');
        try {
            const [{ encryptPDF }, buffer] = await Promise.all([import('@pdfsmaller/pdf-encrypt'), file.arrayBuffer()]);
            const output = await encryptPDF(new Uint8Array(buffer), userPassword, {
                algorithm: 'AES-256',
                ownerPassword: crypto.randomUUID(),
                allowPrinting,
                allowCopying,
                allowModifying,
                allowAnnotating: allowModifying,
                allowFillingForms: allowModifying,
                allowAssembly: allowModifying,
            });
            download(output, file.name.replace(/\.pdf$/i, '') + '_protected.pdf', 'application/pdf');
        } catch (error) {
            setError(pdfError(error, 'تعذّر تشفير المستند. تأكد من أن الملف سليم ومفتوح.'));
        } finally {
            setIsLoading(false);
            setStatus('');
        }
    }

    async function saveRasterPdf(redact: boolean) {
        if (!file || (redact && !redactions.length)) return;
        setIsLoading(true);
        setError(null);
        try {
            const { PDFDocument } = await import('pdf-lib');
            const output = await PDFDocument.create();
            await withPdf(file, async pdf => {
                for (let number = 1; number <= pdf.numPages; number++) {
                    setStatus(`جاري معالجة صفحة ${number} من ${pdf.numPages}…`);
                    const source = await pdf.getPage(number);
                    const size = source.getViewport({ scale: 1 });
                    const canvas = await renderPdfPage(source, 2.5);
                    try {
                        if (redact) {
                            paintRedactions(canvas, redactions.filter(box => box.page === number), redactStyle);
                        }
                        const image = await output.embedPng(await (await canvasToBlob(canvas)).arrayBuffer());
                        const page = output.addPage([size.width, size.height]);
                        page.drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
                    } finally {
                        clearCanvas(canvas);
                        source.cleanup();
                    }
                }
            });
            const suffix = redact ? '_redacted.pdf' : '_flattened.pdf';
            download(await output.save(), file.name.replace(/\.pdf$/i, '') + suffix, 'application/pdf');
        } catch (error) {
            setError(pdfError(error, 'تعذّر تجهيز نسخة المستند. تأكد من سلامة ملف PDF.'));
        } finally {
            setIsLoading(false);
            setStatus('');
        }
    }

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
                            <span>تسطيح الصفحات</span>
                        </button>
                    </div>

                    {/* MODE 1: PASSWORD ENCRYPTION */}
                    {mode === 'password' && (
                        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto space-y-6">
                            <div className="text-center">
                                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <LockClosedIcon className="w-7 h-7" />
                                </div>
                                <h3 className="text-xl font-black text-slate-800">حماية PDF بتشفير AES-256</h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    يُشفّر المستند داخل المتصفح. احتفظ بكلمة المرور لفتح النسخة الناتجة.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="protect-password" className="block text-xs font-bold text-slate-700 mb-1.5">كلمة مرور فتح المستند</label>
                                    <input
                                        type="password"
                                        id="protect-password"
                                        value={userPassword}
                                        onChange={(e) => setUserPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-mono"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="protect-confirm" className="block text-xs font-bold text-slate-700 mb-1.5">تأكيد كلمة المرور</label>
                                    <input
                                        type="password"
                                        id="protect-confirm"
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
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-xs font-bold text-slate-700">شكل التعتيم</span>
                                    <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-100 p-1">
                                        {([
                                            ['frosted', 'زجاجي'],
                                            ['black', 'أسود'],
                                            ['white', 'أبيض'],
                                        ] as const).map(([style, label]) => (
                                            <button
                                                key={style}
                                                type="button"
                                                aria-pressed={redactStyle === style}
                                                disabled={isLoading}
                                                onClick={() => setRedactStyle(style)}
                                                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${redactStyle === style
                                                    ? 'bg-white text-indigo-700 shadow-sm'
                                                    : 'text-slate-600 hover:text-slate-900'}`}
                                            >
                                                {label}
                                            </button>
                                        ))}
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
                                        aria-label="الصفحة السابقة"
                                        disabled={isLoading || currentPage <= 1}
                                        className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                                    >
                                        <ChevronRightIcon className="w-5 h-5" />
                                    </button>
                                    <span className="text-xs font-bold text-slate-700">
                                        صفحة {currentPage} من {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        aria-label="الصفحة التالية"
                                        disabled={isLoading || currentPage >= totalPages}
                                        className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                                    >
                                        <ChevronLeftIcon className="w-5 h-5" />
                                    </button>
                                </div>

                                <p className="text-xs text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full mb-4 font-bold">
                                    اسحب فوق المنطقة التي تريد تعتيمها بالماوس أو بإصبعك.
                                </p>

                                {currentPreview ? (
                                    <div
                                        aria-label="معاينة لتحديد مناطق التعتيم"
                                        className="relative w-fit max-w-full cursor-crosshair touch-none select-none overflow-hidden rounded-lg bg-white"
                                        onPointerDown={startSelection}
                                        onPointerMove={moveSelection}
                                        onPointerUp={endSelection}
                                        onPointerCancel={clearSelection}
                                        onLostPointerCapture={clearSelection}
                                    >
                                        <canvas
                                            ref={previewCanvas}
                                            role="img"
                                            aria-label={`معاينة صفحة ${currentPage}`}
                                            className="pointer-events-none block h-auto max-w-full"
                                        />
                                        {draft && (
                                            <div
                                                aria-hidden="true"
                                                className="pointer-events-none absolute border border-indigo-500 bg-white/25 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.75)] backdrop-blur-sm"
                                                style={boxStyle(draft)}
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <p role="status" className="text-sm text-slate-600">{error ? 'معاينة الصفحة غير متاحة.' : 'جاري عرض الصفحة…'}</p>
                                )}
                                <p className="mt-3 text-xs text-slate-600">تُحفظ النسخة بعد التعتيم كصفحات مصوّرة لحذف النص الأصلي والمناطق المغطاة من الملف الناتج.</p>

                                {/* Save Button */}
                                <div className="mt-6 w-full max-w-md">
                                    <button
                                        onClick={() => saveRasterPdf(true)}
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
                                <h3 className="text-xl font-black text-slate-800">تسطيح صفحات PDF</h3>
                                <p className="text-slate-500 text-xs mt-2 leading-relaxed">
                                    تحوّل الأداة كل صفحة إلى صورة داخل ملف PDF. تتحول النصوص والحقول التفاعلية إلى بكسلات. استخدم التشفير إذا أردت طلب كلمة مرور عند الفتح.
                                </p>
                            </div>

                            <button
                                onClick={() => saveRasterPdf(false)}
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
                                        <span>تسطيح وتنزيل PDF</span>
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
