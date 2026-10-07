import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCodeStyling, { 
    DotType, 
    CornerSquareType, 
    CornerDotType, 
    ErrorCorrectionLevel 
} from 'qr-code-styling';
import jsQR from 'jsqr';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { 
    QrCodeIcon, 
    ArrowDownTrayIcon, 
    ClipboardIcon, 
    CheckIcon, 
    SparklesIcon, 
    PhotoIcon, 
    DocumentIcon, 
    ChevronRightIcon, 
    ChevronLeftIcon,
    MagnifyingGlassIcon,
    ArrowRightIcon
} from '../components/icons';

declare const PDFLib: any;
declare const pdfjsLib: any;
declare const download: any;

type QrContentType = 'url' | 'whatsapp' | 'wifi' | 'text' | 'vcard' | 'email' | 'phone';

const QrCodeGenerator: React.FC = () => {
    // Mode
    const [activeTab, setActiveTab] = useState<'create' | 'stamp' | 'scan'>('create');

    // Content Type (Default: Website URL)
    const [contentType, setContentType] = useState<QrContentType>('url');

    // --- Content Fields ---
    // 1. URL
    const [urlInput, setUrlInput] = useState('https://');
    // 2. Text
    const [textInput, setTextInput] = useState('');
    // 3. WhatsApp
    const [waPhone, setWaPhone] = useState('');
    const [waMessage, setWaMessage] = useState('');
    // 4. Wi-Fi
    const [wifiSsid, setWifiSsid] = useState('');
    const [wifiPass, setWifiPass] = useState('');
    const [wifiType, setWifiType] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
    const [wifiHidden, setWifiHidden] = useState(false);
    // 5. vCard
    const [vcardName, setVcardName] = useState('');
    const [vcardPhone, setVcardPhone] = useState('');
    const [vcardEmail, setVcardEmail] = useState('');
    const [vcardOrg, setVcardOrg] = useState('');
    // 6. Email
    const [emailTo, setEmailTo] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    // 7. Phone
    const [phoneNum, setPhoneNum] = useState('');

    // --- Colors (Foreground & Background with input type='color') ---
    const [fgColor, setFgColor] = useState('#0f172a'); // Slate-900 (Black / Dark)
    const [bgColor, setBgColor] = useState('#ffffff'); // White
    const [isTransparentBg, setIsTransparentBg] = useState(false);
    const [cornerColor, setCornerColor] = useState('#0f172a'); // Corners color
    const [useCustomCornerColor, setUseCustomCornerColor] = useState(false);

    // --- QR Code Customization Options ---
    // 1. Error Correction Level (مستوى تصحيح الخطأ)
    const [errorLevel, setErrorLevel] = useState<ErrorCorrectionLevel>('M');

    // 2. Dots Style (شكل النقاط والمربعات)
    const [dotType, setDotType] = useState<DotType>('rounded');

    // 3. Corners Square Style (شكل إطار الزوايا الخارجية)
    const [cornerSquareType, setCornerSquareType] = useState<CornerSquareType>('extra-rounded');

    // 4. Corners Dot Style (شكل النقطة الداخلية للزوايا)
    const [cornerDotType, setCornerDotType] = useState<CornerDotType>('dot');

    // 5. Label under QR Code
    const [qrLabel, setQrLabel] = useState('');

    // QR Styling Instance & Container Ref
    const qrCodeRef = useRef<QRCodeStyling | null>(null);
    const qrContainerRef = useRef<HTMLDivElement | null>(null);

    const [copied, setCopied] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // --- STAMPING ON EXISTING PDF STATE ---
    const [stampPdfFile, setStampPdfFile] = useState<File | null>(null);
    const [stampPage, setStampPage] = useState(1);
    const [stampTotalPages, setStampTotalPages] = useState(1);
    const [stampPosition, setStampPosition] = useState<'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'bottom-center'>('bottom-left');
    const [stampSizePx, setStampSizePx] = useState(100);
    const [stampMarginPx, setStampMarginPx] = useState(25);
    const [stampPagePreviewUrl, setStampPagePreviewUrl] = useState<string | null>(null);
    const [isStamping, setIsStamping] = useState(false);

    // --- SCAN QR FROM IMAGE STATE ---
    const [scanFile, setScanFile] = useState<File | null>(null);
    const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanCopied, setScanCopied] = useState(false);

    // Calculate final QR payload
    const getQrPayload = useCallback((): string => {
        switch (contentType) {
            case 'url':
                return urlInput.trim() || 'https://example.com';
            case 'text':
                return textInput.trim() || 'مرحباً بكم';
            case 'whatsapp': {
                const cleanPhone = waPhone.replace(/[^\d+]/g, '');
                const encodedMsg = encodeURIComponent(waMessage.trim());
                return `https://wa.me/${cleanPhone}${encodedMsg ? `?text=${encodedMsg}` : ''}`;
            }
            case 'wifi':
                return `WIFI:T:${wifiType};S:${wifiSsid};P:${wifiPass};H:${wifiHidden ? 'true' : 'false'};;`;
            case 'vcard':
                return [
                    'BEGIN:VCARD',
                    'VERSION:3.0',
                    `FN:${vcardName}`,
                    vcardPhone ? `TEL:${vcardPhone}` : '',
                    vcardEmail ? `EMAIL:${vcardEmail}` : '',
                    vcardOrg ? `ORG:${vcardOrg}` : '',
                    'END:VCARD'
                ].filter(Boolean).join('\n');
            case 'email':
                return `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
            case 'phone':
                return `tel:${phoneNum.replace(/[^\d+]/g, '')}`;
            default:
                return 'https://example.com';
        }
    }, [contentType, urlInput, textInput, waPhone, waMessage, wifiSsid, wifiPass, wifiType, wifiHidden, vcardName, vcardPhone, vcardEmail, vcardOrg, emailTo, emailSubject, emailBody, phoneNum]);

    const activeCornerColor = useCustomCornerColor ? cornerColor : fgColor;

    // Initialize QRCodeStyling instance
    useEffect(() => {
        const payload = getQrPayload();
        const instance = new QRCodeStyling({
            width: 260,
            height: 260,
            data: payload,
            image: undefined, // No image in center
            dotsOptions: {
                color: fgColor,
                type: dotType,
            },
            backgroundOptions: {
                color: isTransparentBg ? 'transparent' : bgColor,
            },
            cornersSquareOptions: {
                color: activeCornerColor,
                type: cornerSquareType,
            },
            cornersDotOptions: {
                color: activeCornerColor,
                type: cornerDotType,
            },
            qrOptions: {
                errorCorrectionLevel: errorLevel,
            },
        });

        qrCodeRef.current = instance;

        if (qrContainerRef.current) {
            qrContainerRef.current.innerHTML = '';
            instance.append(qrContainerRef.current);
        }
    }, []);

    // Update QRCodeStyling on option changes
    useEffect(() => {
        if (!qrCodeRef.current) return;
        const payload = getQrPayload();

        qrCodeRef.current.update({
            data: payload,
            image: undefined, // Keep center completely clean
            dotsOptions: {
                color: fgColor,
                type: dotType,
            },
            backgroundOptions: {
                color: isTransparentBg ? 'transparent' : bgColor,
            },
            cornersSquareOptions: {
                color: activeCornerColor,
                type: cornerSquareType,
            },
            cornersDotOptions: {
                color: activeCornerColor,
                type: cornerDotType,
            },
            qrOptions: {
                errorCorrectionLevel: errorLevel,
            },
        });
    }, [getQrPayload, fgColor, bgColor, isTransparentBg, activeCornerColor, dotType, cornerSquareType, cornerDotType, errorLevel]);

    // Download PNG
    const handleDownloadPng = async () => {
        if (!qrCodeRef.current) return;
        const cleanTitle = (qrLabel || 'qrcode').replace(/[^\w\u0600-\u06FF]/g, '_');
        await qrCodeRef.current.download({ name: cleanTitle, extension: 'png' });
    };

    // Download SVG
    const handleDownloadSvg = async () => {
        if (!qrCodeRef.current) return;
        const cleanTitle = (qrLabel || 'qrcode').replace(/[^\w\u0600-\u06FF]/g, '_');
        await qrCodeRef.current.download({ name: cleanTitle, extension: 'svg' });
    };

    // Copy PNG Image to Clipboard
    const handleCopyImage = async () => {
        if (!qrCodeRef.current) return;
        try {
            const rawData = await qrCodeRef.current.getRawData('png');
            if (rawData) {
                const blob = new Blob([rawData], { type: 'image/png' });
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob }),
                ]);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        } catch (e) {
            console.error(e);
            navigator.clipboard.writeText(getQrPayload());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // Create & Download Printable PDF Card
    const handleDownloadPrintablePdf = async () => {
        if (!qrCodeRef.current) return;
        setIsLoading(true);

        try {
            const { PDFDocument, rgb } = PDFLib;
            const pdfDoc = await PDFDocument.create();

            const page = pdfDoc.addPage([595.28, 841.89]);
            const { width, height } = page.getSize();

            const rawData = await qrCodeRef.current.getRawData('png');
            if (!rawData) throw new Error("Could not get QR png data");

            const embeddedQr = await pdfDoc.embedPng(rawData);
            const qrCardSize = 280;
            const qrX = (width - qrCardSize) / 2;
            const qrY = height - 420;

            page.drawRectangle({
                x: qrX - 25,
                y: qrY - 45,
                width: qrCardSize + 50,
                height: qrCardSize + 110,
                color: rgb(0.98, 0.98, 0.99),
                borderColor: rgb(0.85, 0.88, 0.92),
                borderWidth: 1.5,
            });

            page.drawImage(embeddedQr, {
                x: qrX,
                y: qrY,
                width: qrCardSize,
                height: qrCardSize,
            });

            const titleToDraw = qrLabel.trim() || 'امسح الرمز ضوئياً (Scan QR Code)';
            const canvasLabel = document.createElement('canvas');
            canvasLabel.width = 600;
            canvasLabel.height = 80;
            const ctxL = canvasLabel.getContext('2d');
            if (ctxL) {
                ctxL.font = "bold 26px 'Cairo', 'Arial', sans-serif";
                ctxL.fillStyle = '#0f172a';
                ctxL.textAlign = 'center';
                ctxL.textBaseline = 'middle';
                ctxL.fillText(titleToDraw, 300, 40);
                const labelBytes = await new Promise<ArrayBuffer>((res) => {
                    canvasLabel.toBlob(async (b) => {
                        if (b) res(await b.arrayBuffer());
                    }, 'image/png');
                });
                const embeddedLabel = await pdfDoc.embedPng(labelBytes);
                page.drawImage(embeddedLabel, {
                    x: (width - 300) / 2,
                    y: qrY - 40,
                    width: 300,
                    height: 40,
                });
            }

            const pdfBytes = await pdfDoc.save();
            const cleanTitle = (qrLabel || 'qrcode_card').replace(/[^\w\u0600-\u06FF]/g, '_');
            download(pdfBytes, `${cleanTitle}.pdf`, 'application/pdf');

            setIsLoading(false);
        } catch (e) {
            console.error(e);
            setIsLoading(false);
        }
    };

    // Stamping on PDF
    const handleSelectStampPdf = (files: File[]) => {
        if (files.length > 0) {
            setStampPdfFile(files[0]);
            setStampPage(1);
        }
    };

    useEffect(() => {
        if (!stampPdfFile) return;
        let isMounted = true;

        const loadPdf = async () => {
            try {
                const arrayBuffer = await stampPdfFile.arrayBuffer();
                const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
                if (!isMounted) return;
                setStampTotalPages(doc.numPages);

                const page = await doc.getPage(stampPage);
                const viewport = page.getViewport({ scale: 1.0 });

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = viewport.width;
                tempCanvas.height = viewport.height;
                const ctx = tempCanvas.getContext('2d');
                if (ctx) {
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    if (isMounted) {
                        setStampPagePreviewUrl(tempCanvas.toDataURL());
                    }
                }
            } catch (err) {
                console.error(err);
            }
        };

        loadPdf();
        return () => {
            isMounted = false;
        };
    }, [stampPdfFile, stampPage]);

    const handleStampOnPdf = async () => {
        if (!stampPdfFile || !qrCodeRef.current) return;
        setIsStamping(true);

        try {
            const { PDFDocument } = PDFLib;
            const arrayBuffer = await stampPdfFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);

            const rawData = await qrCodeRef.current.getRawData('png');
            if (!rawData) throw new Error("Could not get QR png data");

            const embeddedQr = await pdfDoc.embedPng(rawData);
            const page = pdfDoc.getPage(stampPage - 1);
            const { width, height } = page.getSize();

            let x = stampMarginPx;
            let y = stampMarginPx;

            if (stampPosition === 'bottom-right') {
                x = width - stampSizePx - stampMarginPx;
                y = stampMarginPx;
            } else if (stampPosition === 'bottom-left') {
                x = stampMarginPx;
                y = stampMarginPx;
            } else if (stampPosition === 'bottom-center') {
                x = (width - stampSizePx) / 2;
                y = stampMarginPx;
            } else if (stampPosition === 'top-right') {
                x = width - stampSizePx - stampMarginPx;
                y = height - stampSizePx - stampMarginPx;
            } else if (stampPosition === 'top-left') {
                x = stampMarginPx;
                y = height - stampSizePx - stampMarginPx;
            }

            page.drawImage(embeddedQr, {
                x,
                y,
                width: stampSizePx,
                height: stampSizePx,
            });

            const pdfBytes = await pdfDoc.save();
            const cleanName = stampPdfFile.name.replace(/\.pdf$/i, '') + '_with_qr.pdf';
            download(pdfBytes, cleanName, 'application/pdf');

            setIsStamping(false);
        } catch (e) {
            console.error(e);
            setIsStamping(false);
        }
    };

    // Scan QR from Image
    const handleScanImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setScanFile(file);
        setScanResult(null);
        setScanError(null);
        setIsScanning(true);

        const url = URL.createObjectURL(file);
        setScanPreviewUrl(url);

        const img = new Image();
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                setIsScanning(false);
                setScanError('تعذر معالجة الصورة.');
                return;
            }

            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
            });

            setIsScanning(false);
            if (code && code.data) {
                setScanResult(code.data);
            } else {
                const codeInverted = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'onlyInvert',
                });
                if (codeInverted && codeInverted.data) {
                    setScanResult(codeInverted.data);
                } else {
                    setScanError('لم يتم العثور على باركود QR صالح داخل هذه الصورة.');
                }
            }
        };
        img.onerror = () => {
            setIsScanning(false);
            setScanError('فشل تحميل ملف الصورة.');
        };
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Top Navigation Tabs */}
            <div className="flex items-center justify-center p-1.5 bg-slate-200/80 rounded-2xl max-w-lg mx-auto">
                <button
                    onClick={() => setActiveTab('create')}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                        activeTab === 'create'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <QrCodeIcon className="w-4 h-4" />
                    <span>توليد وتخصيص الباركود</span>
                </button>
                <button
                    onClick={() => setActiveTab('stamp')}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                        activeTab === 'stamp'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <DocumentIcon className="w-4 h-4" />
                    <span>دمج في PDF</span>
                </button>
                <button
                    onClick={() => setActiveTab('scan')}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                        activeTab === 'scan'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <MagnifyingGlassIcon className="w-4 h-4" />
                    <span>مسح باركود من صورة</span>
                </button>
            </div>

            {/* TAB 1: CREATE & CUSTOMIZE QR CODE */}
            {activeTab === 'create' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Controls Column (Left in RTL) */}
                    <div className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                        {/* Content Type Selector (Image option completely removed) */}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">نوع محتوى الباركود:</label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {[
                                    { id: 'url', label: 'رابط موقع', icon: '🌐' },
                                    { id: 'whatsapp', label: 'واتساب', icon: '💬' },
                                    { id: 'wifi', label: 'شبكة واي فاي', icon: '📶' },
                                    { id: 'text', label: 'نص حر', icon: '📝' },
                                    { id: 'vcard', label: 'جهة اتصال', icon: '👤' },
                                    { id: 'phone', label: 'اتصال هاتفي', icon: '📞' },
                                    { id: 'email', label: 'بريد إلكتروني', icon: '✉️' },
                                ].map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setContentType(t.id as QrContentType)}
                                        className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all text-center flex items-center justify-center gap-1.5 ${
                                            contentType === t.id
                                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-600 shadow-sm'
                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span>{t.icon}</span>
                                        <span>{t.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Input Fields based on Content Type */}
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                            {/* 1. URL */}
                            {contentType === 'url' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">رابط الموقع (URL)</label>
                                    <input
                                        type="url"
                                        value={urlInput}
                                        onChange={(e) => setUrlInput(e.target.value)}
                                        placeholder="https://example.com"
                                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 font-mono"
                                        dir="ltr"
                                    />
                                </div>
                            )}

                            {/* 2. WhatsApp */}
                            {contentType === 'whatsapp' && (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1.5">رقم الهاتف (مع مفتاح الدولة)</label>
                                        <input
                                            type="tel"
                                            value={waPhone}
                                            onChange={(e) => setWaPhone(e.target.value)}
                                            placeholder="+201012345678"
                                            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 font-mono"
                                            dir="ltr"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1.5">رسالة جاهزة مسبقاً</label>
                                        <input
                                            type="text"
                                            value={waMessage}
                                            onChange={(e) => setWaMessage(e.target.value)}
                                            placeholder="مرحباً، أود الاستفسار عن..."
                                            className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* 3. Wi-Fi */}
                            {contentType === 'wifi' && (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">اسم الشبكة (SSID)</label>
                                        <input
                                            type="text"
                                            value={wifiSsid}
                                            onChange={(e) => setWifiSsid(e.target.value)}
                                            placeholder="Home_WiFi"
                                            className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs"
                                            dir="ltr"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">كلمة مرور الشبكة</label>
                                        <input
                                            type="text"
                                            value={wifiPass}
                                            onChange={(e) => setWifiPass(e.target.value)}
                                            placeholder="Password123"
                                            className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono"
                                            dir="ltr"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between text-xs pt-1">
                                        <label className="font-bold text-slate-700">نوع التشفير:</label>
                                        <select
                                            value={wifiType}
                                            onChange={(e) => setWifiType(e.target.value as any)}
                                            className="bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold"
                                        >
                                            <option value="WPA">WPA / WPA2 / WPA3</option>
                                            <option value="WEP">WEP</option>
                                            <option value="nopass">بدون كلمة مرور (مفتوحة)</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* 4. Text */}
                            {contentType === 'text' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">النص المطلوب</label>
                                    <textarea
                                        value={textInput}
                                        onChange={(e) => setTextInput(e.target.value)}
                                        placeholder="اكتب أي نص أو أرقام..."
                                        rows={3}
                                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800"
                                    />
                                </div>
                            )}

                            {/* 5. vCard */}
                            {contentType === 'vcard' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">الاسم</label>
                                        <input
                                            type="text"
                                            value={vcardName}
                                            onChange={(e) => setVcardName(e.target.value)}
                                            placeholder="أحمد علي"
                                            className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
                                        <input
                                            type="tel"
                                            value={vcardPhone}
                                            onChange={(e) => setVcardPhone(e.target.value)}
                                            placeholder="+20100000000"
                                            className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono"
                                            dir="ltr"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* 6. Email */}
                            {contentType === 'email' && (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
                                        <input
                                            type="email"
                                            value={emailTo}
                                            onChange={(e) => setEmailTo(e.target.value)}
                                            placeholder="contact@company.com"
                                            className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono"
                                            dir="ltr"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* 7. Phone */}
                            {contentType === 'phone' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
                                    <input
                                        type="tel"
                                        value={phoneNum}
                                        onChange={(e) => setPhoneNum(e.target.value)}
                                        placeholder="+20123456789"
                                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono"
                                        dir="ltr"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Title / Label under code */}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">عنوان توضيحي أسفل الكود (اختياري)</label>
                            <input
                                type="text"
                                value={qrLabel}
                                onChange={(e) => setQrLabel(e.target.value)}
                                placeholder="مثلاً: امسح الرمز للدخول لموقعنا، شبكة الضيوف..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3.5 text-xs text-slate-800"
                            />
                        </div>

                        {/* --- COLOR CUSTOMIZATION WITH input type='color' --- */}
                        <div className="border-t border-slate-100 pt-5 space-y-4">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                <span>🎨</span>
                                <span>تخصيص ألوان الكيو آر كود (QR Code Color)</span>
                            </h4>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* 1. Foreground Color (لون الكيو آر كود الرئيسي) */}
                                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                                    <label className="block text-xs font-bold text-slate-700">
                                        لون الكيو آر كود (QR Code Color)
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <div className="relative w-11 h-11 rounded-xl overflow-hidden border-2 border-slate-300 shadow-xs cursor-pointer hover:scale-105 transition-transform">
                                            <input
                                                type="color"
                                                id="qr-color-input"
                                                value={fgColor}
                                                onChange={(e) => setFgColor(e.target.value)}
                                                className="absolute -top-3 -left-3 w-18 h-18 cursor-pointer border-0 p-0"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <input
                                                type="text"
                                                value={fgColor}
                                                onChange={(e) => setFgColor(e.target.value)}
                                                className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-mono font-bold text-slate-700 uppercase"
                                                dir="ltr"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Background Color (لون الخلفية) */}
                                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-xs font-bold text-slate-700">
                                            لون الخلفية (Background Color)
                                        </label>
                                        <label className="flex items-center gap-1.5 text-xs text-slate-600 font-bold cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={isTransparentBg}
                                                onChange={(e) => setIsTransparentBg(e.target.checked)}
                                                className="rounded text-blue-600"
                                            />
                                            <span>خلفية شفافة</span>
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className={`relative w-11 h-11 rounded-xl overflow-hidden border-2 border-slate-300 shadow-xs cursor-pointer hover:scale-105 transition-transform ${isTransparentBg ? 'opacity-30 pointer-events-none' : ''}`}>
                                            <input
                                                type="color"
                                                id="bg-color-input"
                                                disabled={isTransparentBg}
                                                value={bgColor}
                                                onChange={(e) => setBgColor(e.target.value)}
                                                className="absolute -top-3 -left-3 w-18 h-18 cursor-pointer border-0 p-0"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <input
                                                type="text"
                                                disabled={isTransparentBg}
                                                value={isTransparentBg ? 'شفافة (Transparent)' : bgColor}
                                                onChange={(e) => setBgColor(e.target.value)}
                                                className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-mono font-bold text-slate-700 uppercase disabled:bg-slate-100"
                                                dir="ltr"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Optional: Custom Corner Eyes Color */}
                            <div className="p-3 bg-white rounded-2xl border border-slate-200 flex items-center justify-between">
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={useCustomCornerColor}
                                        onChange={(e) => setUseCustomCornerColor(e.target.checked)}
                                        className="rounded text-blue-600"
                                    />
                                    <span>تخصيص لون مختلف لزوايا الكود (Corner Eyes)</span>
                                </label>
                                {useCustomCornerColor && (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={cornerColor}
                                            onChange={(e) => setCornerColor(e.target.value)}
                                            className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                                        />
                                        <span className="text-xs font-mono font-bold text-slate-600 uppercase">{cornerColor}</span>
                                    </div>
                                )}
                            </div>

                            {/* Quick Preset Colors Palette */}
                            <div className="flex items-center gap-2 pt-1">
                                <span className="text-xs text-slate-500 font-medium">ألوان جاهزة وسريعة:</span>
                                {[
                                    { fg: '#0f172a', bg: '#ffffff', label: 'أسود كلاسيكي' },
                                    { fg: '#1d4ed8', bg: '#ffffff', label: 'أزرق ملكي' },
                                    { fg: '#047857', bg: '#ffffff', label: 'أخضر زمردي' },
                                    { fg: '#6d28d9', bg: '#ffffff', label: 'بنفسجي أنيق' },
                                    { fg: '#b91c1c', bg: '#ffffff', label: 'أحمر داكن' },
                                    { fg: '#c2410c', bg: '#fff7ed', label: 'برتقالي دافئ' },
                                ].map((thm, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => { 
                                            setFgColor(thm.fg); 
                                            setBgColor(thm.bg); 
                                            setIsTransparentBg(false);
                                            setCornerColor(thm.fg);
                                        }}
                                        className="w-7 h-7 rounded-xl border border-slate-300 shadow-2xs hover:scale-110 transition-transform"
                                        style={{ backgroundColor: thm.fg }}
                                        title={thm.label}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* --- STYLE & SHAPE CONTROLS (شكل ونمط الكيو آر كود ومستواه) --- */}
                        <div className="border-t border-slate-100 pt-5 space-y-4">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                <span>📐</span>
                                <span>تخصيص شكل ومستوى الكيو آر كود</span>
                            </h4>

                            {/* Error Correction Level */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                    مستوى تصحيح الخطأ (Error Correction Level):
                                </label>
                                <div className="grid grid-cols-4 gap-2">
                                    {[
                                        { id: 'L', label: 'L (7%)', desc: 'منخفض وسريع' },
                                        { id: 'M', label: 'M (15%)', desc: 'متوسط قياسي' },
                                        { id: 'Q', label: 'Q (25%)', desc: 'مقاوم للخدوش' },
                                        { id: 'H', label: 'H (30%)', desc: 'عالي وأقصى دقة' },
                                    ].map((lvl) => (
                                        <button
                                            key={lvl.id}
                                            type="button"
                                            onClick={() => setErrorLevel(lvl.id as ErrorCorrectionLevel)}
                                            className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center flex flex-col items-center ${
                                                errorLevel === lvl.id
                                                    ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            <span>{lvl.label}</span>
                                            <span className="text-[10px] text-slate-400 font-normal">{lvl.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Dots Style */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                    شكل نقاط الكود (Dots Pattern):
                                </label>
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                    {[
                                        { id: 'square', label: 'مربعات كلاسيكية' },
                                        { id: 'dots', label: 'نقاط دائرية' },
                                        { id: 'rounded', label: 'حواف منحنية' },
                                        { id: 'classy-rounded', label: 'نمط عصري' },
                                        { id: 'extra-rounded', label: 'فائق الاستدارة' },
                                    ].map((s) => (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => setDotType(s.id as DotType)}
                                            className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center ${
                                                dotType === s.id
                                                    ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Corners Style */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                        شكل إطار الزوايا الخارجية:
                                    </label>
                                    <select
                                        value={cornerSquareType}
                                        onChange={(e) => setCornerSquareType(e.target.value as CornerSquareType)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-700"
                                    >
                                        <option value="extra-rounded">دائري منحني (Extra Rounded)</option>
                                        <option value="dot">دائرة كاملة (Circle)</option>
                                        <option value="square">مربع كلاسيكي (Square)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                        شكل النقطة داخل الزوايا:
                                    </label>
                                    <select
                                        value={cornerDotType}
                                        onChange={(e) => setCornerDotType(e.target.value as CornerDotType)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-700"
                                    >
                                        <option value="dot">نقطة دائرية (Dot)</option>
                                        <option value="square">نقطة مربعة (Square)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* QR Code Preview & Download Column (Right in RTL) */}
                    <div className="lg:col-span-5 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center space-y-6">
                        <div className="text-center">
                            <span className="text-xs font-bold text-slate-500 flex items-center justify-center gap-1.5 mb-1">
                                <span>✨</span>
                                <span>معاينة حية للباركود</span>
                            </span>
                            <h3 className="text-sm font-black text-slate-800">
                                باركود نظيف تماماً وخالٍ من أي صورة
                            </h3>
                        </div>

                        {/* Card Container (Clean without any center image) */}
                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 shadow-inner flex flex-col items-center max-w-xs w-full">
                            <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center">
                                <div
                                    ref={qrContainerRef}
                                    className="w-[260px] h-[260px] flex items-center justify-center overflow-hidden"
                                />
                            </div>

                            {qrLabel && (
                                <p className="text-xs font-bold text-slate-800 mt-3 text-center break-words max-w-full">
                                    {qrLabel}
                                </p>
                            )}

                            <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400 font-mono">
                                <span>مستوى: {errorLevel}</span>
                                <span>•</span>
                                <span>نمط: {dotType}</span>
                            </div>
                        </div>

                        {/* Export Action Buttons */}
                        <div className="w-full space-y-2.5">
                            {/* Download as Printable PDF Card */}
                            <button
                                onClick={handleDownloadPrintablePdf}
                                disabled={isLoading}
                                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 px-4 rounded-2xl hover:opacity-95 shadow-lg shadow-blue-500/25 transition-all text-xs sm:text-sm flex items-center justify-center gap-2"
                            >
                                <DocumentIcon className="w-5 h-5" />
                                <span>تنزيل كـ PDF جاهز للطباعة (A4)</span>
                            </button>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={handleDownloadPng}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-3 rounded-xl transition-colors text-xs flex items-center justify-center gap-1.5 border border-slate-200"
                                >
                                    <ArrowDownTrayIcon className="w-4 h-4" />
                                    <span>صورة PNG</span>
                                </button>
                                <button
                                    onClick={handleDownloadSvg}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-3 rounded-xl transition-colors text-xs flex items-center justify-center gap-1.5 border border-slate-200"
                                >
                                    <ArrowDownTrayIcon className="w-4 h-4" />
                                    <span>متجه SVG</span>
                                </button>
                            </div>

                            <button
                                onClick={handleCopyImage}
                                className="w-full bg-white hover:bg-slate-50 text-slate-700 font-bold py-2.5 px-4 rounded-xl transition-colors text-xs flex items-center justify-center gap-1.5 border border-slate-200"
                            >
                                {copied ? <CheckIcon className="w-4 h-4 text-emerald-600" /> : <ClipboardIcon className="w-4 h-4" />}
                                <span>{copied ? 'تم نسخ الصورة للحافظة!' : 'نسخ الصورة للحافظة'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: STAMP QR ON EXISTING PDF */}
            {activeTab === 'stamp' && (
                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                    <div className="text-center max-w-xl mx-auto">
                        <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl font-bold">
                            📑
                        </div>
                        <h3 className="text-xl font-black text-slate-800">إضافة الباركود مباشرة إلى ملف PDF موجود</h3>
                        <p className="text-xs text-slate-500 mt-1">
                            قم برفع أي مستند PDF لوضع كود الـ QR الحالي في الموضع المناسب بنقرة واحدة.
                        </p>
                    </div>

                    {!stampPdfFile ? (
                        <FileUploader onFilesSelected={handleSelectStampPdf} multiple={false} accept=".pdf" />
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-4 border-t border-slate-100">
                            {/* Stamping Controls */}
                            <div className="lg:col-span-5 space-y-5">
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                                    <div className="text-xs">
                                        <p className="font-bold text-slate-800">{stampPdfFile.name}</p>
                                        <p className="text-slate-500">إجمالي الصفحات: {stampTotalPages}</p>
                                    </div>
                                    <button
                                        onClick={() => setStampPdfFile(null)}
                                        className="text-xs text-slate-500 hover:text-slate-800 font-bold px-2.5 py-1 rounded-lg border border-slate-200"
                                    >
                                        تغيير
                                    </button>
                                </div>

                                {/* Select Page */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">الصفحة المراد وضع الباركود عليها</label>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setStampPage(p => Math.max(1, p - 1))}
                                            disabled={stampPage <= 1}
                                            className="p-2 rounded-xl border border-slate-200 disabled:opacity-40"
                                        >
                                            <ChevronRightIcon className="w-4 h-4" />
                                        </button>
                                        <span className="text-xs font-bold text-slate-800">
                                            صفحة {stampPage} من {stampTotalPages}
                                        </span>
                                        <button
                                            onClick={() => setStampPage(p => Math.min(stampTotalPages, p + 1))}
                                            disabled={stampPage >= stampTotalPages}
                                            className="p-2 rounded-xl border border-slate-200 disabled:opacity-40"
                                        >
                                            <ChevronLeftIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Position Selector */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">موضع الباركود على الصفحة</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { id: 'bottom-left', label: 'أسفل اليسار' },
                                            { id: 'bottom-right', label: 'أسفل اليمين' },
                                            { id: 'bottom-center', label: 'أسفل الوسط' },
                                            { id: 'top-left', label: 'أعلى اليسار' },
                                            { id: 'top-right', label: 'أعلى اليمين' },
                                        ].map(pos => (
                                            <button
                                                key={pos.id}
                                                type="button"
                                                onClick={() => setStampPosition(pos.id as any)}
                                                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center ${
                                                    stampPosition === pos.id
                                                        ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                }`}
                                            >
                                                {pos.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Size & Margin */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">حجم الباركود ({stampSizePx}pt)</label>
                                        <input
                                            type="range"
                                            min="50"
                                            max="220"
                                            value={stampSizePx}
                                            onChange={(e) => setStampSizePx(parseInt(e.target.value))}
                                            className="w-full accent-blue-600"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">الهامش ({stampMarginPx}pt)</label>
                                        <input
                                            type="range"
                                            min="10"
                                            max="80"
                                            value={stampMarginPx}
                                            onChange={(e) => setStampMarginPx(parseInt(e.target.value))}
                                            className="w-full accent-blue-600"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleStampOnPdf}
                                    disabled={isStamping}
                                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 px-4 rounded-2xl hover:opacity-95 shadow-lg shadow-blue-500/25 transition-all text-sm flex items-center justify-center gap-2"
                                >
                                    {isStamping ? (
                                        <>
                                            <LoadingSpinner />
                                            <span>جاري دمج الباركود وحفظ الملف...</span>
                                        </>
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-5 h-5" />
                                            <span>دمج الباركود وتحميل الـ PDF المحدث</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Page Preview Column */}
                            <div className="lg:col-span-7 bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col items-center">
                                <span className="text-xs font-bold text-slate-500 mb-3">معاينة الصفحة {stampPage}</span>
                                <div className="relative max-h-[500px] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm p-2">
                                    {stampPagePreviewUrl ? (
                                        <img src={stampPagePreviewUrl} alt="Page preview" className="max-w-full h-auto" />
                                    ) : (
                                        <div className="py-20 text-center">
                                            <LoadingSpinner />
                                            <p className="text-xs text-slate-500 mt-2">جاري تجهيز المعاينة...</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: SCAN QR FROM IMAGE */}
            {activeTab === 'scan' && (
                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 max-w-2xl mx-auto">
                    <div className="text-center">
                        <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl font-bold">
                            🔍
                        </div>
                        <h3 className="text-xl font-black text-slate-800">قراءة ومسح كود QR من صورة</h3>
                        <p className="text-xs text-slate-500 mt-1">
                            قم برفع أي صورة تحتوي على باركود لقراءة محتواها وروابطها فورياً.
                        </p>
                    </div>

                    <div className="p-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-center space-y-3">
                        <input
                            type="file"
                            accept="image/*"
                            id="scan-upload"
                            onChange={handleScanImageUpload}
                            className="hidden"
                        />
                        <label
                            htmlFor="scan-upload"
                            className="cursor-pointer inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3 px-6 rounded-2xl hover:opacity-95 shadow-md shadow-blue-500/20 text-xs sm:text-sm"
                        >
                            <PhotoIcon className="w-5 h-5" />
                            <span>اختر صورة تحتوي على باركود QR</span>
                        </label>
                        <p className="text-[11px] text-slate-400">يدعم صور الكاميرا، لقطات الشاشة (Screenshots)، وكافة أنواع الصور</p>
                    </div>

                    {isScanning && (
                        <div className="text-center py-6">
                            <LoadingSpinner />
                            <p className="text-xs text-slate-500 mt-2 font-bold">جاري فحص وقراءة الباركود...</p>
                        </div>
                    )}

                    {/* Scan Result Box */}
                    {scanResult && (
                        <div className="p-5 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-3 animate-fade-in">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                                    <span>✓</span>
                                    <span>تمت قراءة الباركود بنجاح!</span>
                                </span>
                                <button
                                    onClick={() => {
                                        if (scanResult) {
                                            navigator.clipboard.writeText(scanResult);
                                            setScanCopied(true);
                                            setTimeout(() => setScanCopied(false), 2000);
                                        }
                                    }}
                                    className="bg-white hover:bg-emerald-100 text-emerald-800 text-xs font-bold py-1.5 px-3 rounded-xl border border-emerald-300 transition-colors flex items-center gap-1"
                                >
                                    {scanCopied ? <CheckIcon className="w-3.5 h-3.5" /> : <ClipboardIcon className="w-3.5 h-3.5" />}
                                    <span>{scanCopied ? 'تم النسخ!' : 'نسخ المحتوى'}</span>
                                </button>
                            </div>

                            <div className="bg-white p-3.5 rounded-xl border border-emerald-200 text-xs font-mono text-slate-800 break-all select-all">
                                {scanResult}
                            </div>

                            {/* If it's a URL, offer direct open button */}
                            {scanResult.startsWith('http://') || scanResult.startsWith('https://') ? (
                                <a
                                    href={scanResult}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline pt-1"
                                >
                                    <span>🌐 فتح الرابط في المتصفح</span>
                                    <ArrowRightIcon className="w-3 h-3 rotate-180" />
                                </a>
                            ) : null}
                        </div>
                    )}

                    {scanError && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-center text-xs font-bold">
                            {scanError}
                        </div>
                    )}

                    {scanPreviewUrl && (
                        <div className="pt-2 flex justify-center">
                            <img
                                src={scanPreviewUrl}
                                alt="Scanned"
                                className="max-h-48 rounded-xl border border-slate-200 object-contain shadow-xs"
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default QrCodeGenerator;
