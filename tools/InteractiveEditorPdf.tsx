import React, { useState, useRef, useEffect, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { 
    PencilSquareIcon,
    ArrowDownTrayIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    PlusIcon,
    TrashIcon,
    ArrowPathIcon,
    CheckIcon,
    PhotoIcon
} from '../components/icons';

declare const pdfjsLib: any;
declare const PDFLib: any;
declare const download: any;

interface TextBlock {
    id: string;
    pageIndex: number;
    text: string;
    originalText: string;
    isModified: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    isBold: boolean;
    isItalic: boolean;
    textAlign: 'right' | 'center' | 'left';
    pdfX: number;
    pdfY: number;
    pdfWidth: number;
    pdfHeight: number;
}

interface PageMeta {
    pageNumber: number;
    width: number;
    height: number;
    thumbnail: string;
}

const FONTS = [
    { id: 'sans-serif', name: 'خط النظام القياسي' },
    { id: 'Cairo, sans-serif', name: 'خط كايرو (Cairo)' },
    { id: 'Amiri, serif', name: 'خط أميري (Amiri)' },
    { id: 'Tahoma, sans-serif', name: 'خط تاهوما (Tahoma)' },
    { id: 'Arial, sans-serif', name: 'Arial' },
    { id: 'Times New Roman, serif', name: 'Times New Roman' },
];

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 44, 52];

const COLOR_SWATCHES = [
    '#0f172a', // Slate black
    '#000000', // Pure black
    '#1e40af', // Deep blue
    '#2563eb', // Royal blue
    '#dc2626', // Red
    '#16a34a', // Emerald green
    '#7c3aed', // Purple
    '#ea580c', // Orange
    '#475569', // Gray
];

const InteractiveEditorPdf: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [pages, setPages] = useState<PageMeta[]>([]);
    const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingMsg, setLoadingMsg] = useState<string>('');
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Zoom level for the workspace
    const [zoom, setZoom] = useState<number>(1.3);

    // All text blocks per page
    const [pageBlocks, setPageBlocks] = useState<Record<number, TextBlock[]>>({});
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

    // Search and replace state
    const [showSearch, setShowSearch] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [replaceQuery, setReplaceQuery] = useState<string>('');
    const [matchCount, setMatchCount] = useState<number>(0);

    // Refs
    const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
    const renderTaskRef = useRef<any>(null);
    const imageUploadRef = useRef<HTMLInputElement>(null);

    // Current page blocks
    const currentBlocks = pageBlocks[currentPageIndex] || [];
    const activeBlock = currentBlocks.find(b => b.id === activeBlockId) || null;
    const totalModifications = Object.values(pageBlocks).flat().filter(b => b.isModified).length;

    // Load PDF Document and generate thumbnails
    const handleLoadPdf = useCallback(async (selectedFile: File) => {
        setIsLoading(true);
        setLoadingMsg('جاري فتح المستند واستخراج النصوص على طريقة Adobe Acrobat...');
        setError(null);
        try {
            const buffer = await selectedFile.arrayBuffer();
            const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
            setPdfDoc(doc);

            const pageList: PageMeta[] = [];
            for (let i = 1; i <= doc.numPages; i++) {
                setLoadingMsg(`جاري معالجة الصفحة ${i} من ${doc.numPages}...`);
                const page = await doc.getPage(i);
                const vp = page.getViewport({ scale: 0.28 });
                const thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = vp.width;
                thumbCanvas.height = vp.height;
                const thumbCtx = thumbCanvas.getContext('2d')!;
                await page.render({ canvasContext: thumbCtx, viewport: vp }).promise;

                pageList.push({
                    pageNumber: i,
                    width: vp.width / 0.28,
                    height: vp.height / 0.28,
                    thumbnail: thumbCanvas.toDataURL(),
                });
            }

            setPages(pageList);
            setCurrentPageIndex(0);
        } catch (err: any) {
            console.error(err);
            setError('تعذر تحميل ملف PDF. يرجى التأكد من أن الملف سليم وغير محمي.');
        } finally {
            setIsLoading(false);
            setLoadingMsg('');
        }
    }, []);

    const onFilesSelected = (files: File[]) => {
        if (files.length > 0) {
            setFile(files[0]);
            setPageBlocks({});
            setActiveBlockId(null);
            handleLoadPdf(files[0]);
        }
    };

    // Extract text items from PDF.js and group them into natural, editable Acrobat paragraphs
    const extractAcrobatBlocks = useCallback(async (pageIdx: number, scale: number) => {
        if (!pdfDoc) return;
        try {
            const page = await pdfDoc.getPage(pageIdx + 1);
            const viewport = page.getViewport({ scale });
            const textContent = await page.getTextContent();
            
            const validItems = textContent.items.filter((it: any) => it.str && it.str.trim() !== '');
            if (validItems.length === 0) return;

            // Sort by PDF Y descending (top to bottom), then X ascending
            validItems.sort((a: any, b: any) => {
                const yDiff = b.transform[5] - a.transform[5];
                if (Math.abs(yDiff) > 5) return yDiff;
                return a.transform[4] - b.transform[4];
            });

            // Group items into paragraph blocks
            const blocks: TextBlock[] = [];
            let currentLineGroup: any[] = [];
            let currentTy = validItems[0]?.transform[5] || 0;

            for (let i = 0; i < validItems.length; i++) {
                const item = validItems[i];
                const itemTy = item.transform[5];

                if (currentLineGroup.length === 0) {
                    currentLineGroup.push(item);
                    currentTy = itemTy;
                } else if (Math.abs(itemTy - currentTy) <= 5.5) {
                    // Same line baseline
                    currentLineGroup.push(item);
                } else {
                    blocks.push(buildBlock(currentLineGroup, pageIdx, viewport, scale));
                    currentLineGroup = [item];
                    currentTy = itemTy;
                }
            }

            if (currentLineGroup.length > 0) {
                blocks.push(buildBlock(currentLineGroup, pageIdx, viewport, scale));
            }

            setPageBlocks(prev => {
                if (prev[pageIdx] && prev[pageIdx].some(b => b.isModified)) {
                    return prev;
                }
                return { ...prev, [pageIdx]: blocks };
            });

        } catch (e) {
            console.error('Error extracting text blocks:', e);
        }
    }, [pdfDoc]);

    const buildBlock = (group: any[], pageIdx: number, viewport: any, scale: number): TextBlock => {
        group.sort((a, b) => a.transform[4] - b.transform[4]);
        const fullStr = group.map(g => g.str).join(' ');
        const first = group[0];

        const minTx = Math.min(...group.map(g => g.transform[4]));
        const maxTx = Math.max(...group.map(g => g.transform[4] + (g.width || 0)));
        const avgTy = group.reduce((sum, g) => sum + g.transform[5], 0) / group.length;

        const fontHeightPdf = Math.sqrt(first.transform[0] * first.transform[0] + first.transform[1] * first.transform[1]) || 12;

        const [vx, vy] = viewport.convertToViewportPoint(minTx, avgTy);
        const blockW = Math.max((maxTx - minTx) * scale, 60);
        const blockH = Math.max(fontHeightPdf * scale * 1.35, 18);

        return {
            id: `acrobat-block-${pageIdx}-${minTx}-${avgTy}-${Math.random()}`,
            pageIndex: pageIdx,
            text: fullStr,
            originalText: fullStr,
            isModified: false,
            x: vx,
            y: vy - blockH * 0.88,
            width: blockW,
            height: blockH,
            fontSize: Math.round(fontHeightPdf * scale),
            fontFamily: 'Cairo, sans-serif',
            color: '#0f172a',
            isBold: false,
            isItalic: false,
            textAlign: 'right',
            pdfX: minTx,
            pdfY: avgTy,
            pdfWidth: maxTx - minTx,
            pdfHeight: fontHeightPdf,
        };
    };

    // Render underlying PDF graphics on canvas
    const renderPageCanvas = useCallback(async () => {
        if (!pdfDoc || pages.length === 0) return;

        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(currentPageIndex + 1);
        const viewport = page.getViewport({ scale: zoom });

        const canvas = pdfCanvasRef.current;
        if (canvas) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d')!;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const task = page.render({ canvasContext: ctx, viewport });
            renderTaskRef.current = task;
            await task.promise;
            renderTaskRef.current = null;
        }

        if (!pageBlocks[currentPageIndex]) {
            extractAcrobatBlocks(currentPageIndex, zoom);
        }
    }, [pdfDoc, currentPageIndex, pages, zoom, pageBlocks, extractAcrobatBlocks]);

    useEffect(() => {
        if (pdfDoc && pages.length > 0) {
            renderPageCanvas();
        }
    }, [pdfDoc, currentPageIndex, zoom, renderPageCanvas]);

    // Update block text directly
    const handleUpdateText = (blockId: string, newText: string) => {
        setPageBlocks(prev => {
            const current = prev[currentPageIndex] || [];
            const updated = current.map(b => {
                if (b.id === blockId) {
                    return {
                        ...b,
                        text: newText,
                        isModified: newText !== b.originalText,
                    };
                }
                return b;
            });
            return { ...prev, [currentPageIndex]: updated };
        });
    };

    // Update formatting for active block
    const handleUpdateFormatting = (changes: Partial<TextBlock>) => {
        if (!activeBlockId) return;
        setPageBlocks(prev => {
            const current = prev[currentPageIndex] || [];
            const updated = current.map(b => {
                if (b.id === activeBlockId) {
                    return {
                        ...b,
                        ...changes,
                        isModified: true,
                    };
                }
                return b;
            });
            return { ...prev, [currentPageIndex]: updated };
        });
    };

    // Add new Acrobat text block at default position
    const handleAddNewBlock = () => {
        const newBlock: TextBlock = {
            id: `new-block-${Date.now()}`,
            pageIndex: currentPageIndex,
            text: 'انقر هنا لكتابة نص جديد...',
            originalText: '',
            isModified: true,
            x: 80,
            y: 100,
            width: 280,
            height: 38,
            fontSize: 16,
            fontFamily: 'Cairo, sans-serif',
            color: '#0f172a',
            isBold: false,
            isItalic: false,
            textAlign: 'right',
            pdfX: 80,
            pdfY: 100,
            pdfWidth: 280,
            pdfHeight: 16,
        };

        setPageBlocks(prev => ({
            ...prev,
            [currentPageIndex]: [newBlock, ...(prev[currentPageIndex] || [])],
        }));
        setActiveBlockId(newBlock.id);
    };

    // Delete active block
    const handleDeleteBlock = (blockId: string) => {
        setPageBlocks(prev => ({
            ...prev,
            [currentPageIndex]: (prev[currentPageIndex] || []).filter(b => b.id !== blockId),
        }));
        if (activeBlockId === blockId) setActiveBlockId(null);
    };

    // Find and Replace
    const handleSearch = () => {
        if (!searchQuery.trim()) {
            setMatchCount(0);
            return;
        }
        const matches = currentBlocks.filter(b => b.text.toLowerCase().includes(searchQuery.toLowerCase()));
        setMatchCount(matches.length);
    };

    const handleReplaceAll = () => {
        if (!searchQuery.trim()) return;
        setPageBlocks(prev => {
            const current = prev[currentPageIndex] || [];
            const updated = current.map(b => {
                if (b.text.toLowerCase().includes(searchQuery.toLowerCase())) {
                    const replaced = b.text.replace(new RegExp(searchQuery, 'gi'), replaceQuery);
                    return {
                        ...b,
                        text: replaced,
                        isModified: true,
                    };
                }
                return b;
            });
            return { ...prev, [currentPageIndex]: updated };
        });
        setMatchCount(0);
    };

    /**
     * HIGH-FIDELITY ADOBE ACROBAT SAVE:
     * Overlays modified texts seamlessly on top of original PDF pages.
     */
    const handleSavePdf = async () => {
        if (!file || !pdfDoc) return;
        setIsSaving(true);
        setError(null);

        try {
            const { PDFDocument } = PDFLib;
            const originalBuffer = await file.arrayBuffer();
            const finalPdfDoc = await PDFDocument.load(originalBuffer);
            const totalPageCount = finalPdfDoc.getPageCount();

            for (let pageIdx = 0; pageIdx < totalPageCount; pageIdx++) {
                const blocks = pageBlocks[pageIdx] || [];
                const modifiedBlocks = blocks.filter(b => b.isModified);
                if (modifiedBlocks.length === 0) continue;

                const pdfPage = finalPdfDoc.getPage(pageIdx);
                const { width: pWidth, height: pHeight } = pdfPage.getSize();

                // High-resolution overlay canvas (scale 2.0)
                const scale = 2.0;
                const exportCanvas = document.createElement('canvas');
                exportCanvas.width = pWidth * scale;
                exportCanvas.height = pHeight * scale;
                const ctx = exportCanvas.getContext('2d')!;

                const currentScreenScale = zoom;
                const toPdfX = (sx: number) => (sx / currentScreenScale) * scale;
                const toPdfY = (sy: number) => (sy / currentScreenScale) * scale;

                modifiedBlocks.forEach(b => {
                    const drawX = toPdfX(b.x);
                    const drawY = toPdfY(b.y);
                    const drawW = toPdfX(b.width) + 12;
                    const drawH = toPdfY(b.height) + 6;

                    // 1. Clean seamless whiteout over original text
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(drawX - 2, drawY - 2, drawW, drawH);

                    // 2. Draw user's edited replacement text
                    ctx.save();
                    ctx.fillStyle = b.color || '#0f172a';
                    const scaledFont = (b.fontSize / currentScreenScale) * scale;
                    const fontStyle = `${b.isItalic ? 'italic ' : ''}${b.isBold ? 'bold ' : ''}${scaledFont}px ${b.fontFamily || 'Arial, sans-serif'}`;
                    ctx.font = fontStyle;
                    ctx.textBaseline = 'top';
                    ctx.fillText(b.text, drawX + 2, drawY + 2);
                    ctx.restore();
                });

                // Embed overlay PNG into PDF
                const overlayDataUrl = exportCanvas.toDataURL('image/png');
                const overlayBytes = await fetch(overlayDataUrl).then(res => res.arrayBuffer());
                const embeddedImage = await finalPdfDoc.embedPng(overlayBytes);

                pdfPage.drawImage(embeddedImage, {
                    x: 0,
                    y: 0,
                    width: pWidth,
                    height: pHeight,
                });
            }

            const finalBytes = await finalPdfDoc.save();
            const cleanName = file.name.replace(/\.pdf$/i, '');
            download(finalBytes, `${cleanName}_تعديل_اكروبات.pdf`, 'application/pdf');
        } catch (err: any) {
            console.error('Error saving PDF:', err);
            setError('حدث خطأ أثناء حفظ ملف PDF. يرجى المحاولة مرة أخرى.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4 animate-fade-in max-w-7xl mx-auto select-none">
            {/* Initial File Upload */}
            {!file ? (
                <FileUploader 
                    onFilesSelected={onFilesSelected} 
                    multiple={false} 
                    accept=".pdf" 
                />
            ) : isLoading ? (
                <div className="flex flex-col items-center justify-center p-16 bg-white rounded-3xl border border-slate-200 shadow-sm">
                    <LoadingSpinner />
                    <p className="mt-4 text-base font-black text-slate-800">{loadingMsg || 'جاري تجهيز محرر Adobe Acrobat...'}</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    
                    {/* ADOBE ACROBAT PRO TOP APP BAR */}
                    <div className="bg-slate-900 text-white p-3.5 sm:p-4 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-4">
                        
                        {/* Left: Acrobat Logo & Document Title */}
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center font-black text-base shadow-md shadow-red-600/30">
                                Ac
                            </div>
                            <div>
                                <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                                    <span>محرر مستندات Adobe Acrobat</span>
                                    <span className="text-[10px] bg-red-500/30 text-red-300 border border-red-500/40 px-2 py-0.5 rounded-full font-bold">
                                        تحرير مباشر للمستند
                                    </span>
                                </h3>
                                <p className="text-[11px] text-slate-400 truncate max-w-xs" title={file.name}>
                                    {file.name}
                                </p>
                            </div>
                        </div>

                        {/* Center: Page Navigation & Zoom */}
                        <div className="flex items-center gap-3">
                            {/* Page Switcher */}
                            <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-2xl border border-slate-700">
                                <button 
                                    onClick={() => setCurrentPageIndex(p => Math.max(0, p - 1))} 
                                    disabled={currentPageIndex === 0} 
                                    className="p-1 rounded-lg hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                                    title="الصفحة السابقة"
                                >
                                    <ChevronRightIcon className="w-4 h-4" />
                                </button>
                                
                                <span className="font-mono text-xs font-bold text-slate-200">
                                    {currentPageIndex + 1} / {pages.length}
                                </span>

                                <button 
                                    onClick={() => setCurrentPageIndex(p => Math.min(pages.length - 1, p + 1))} 
                                    disabled={currentPageIndex === pages.length - 1} 
                                    className="p-1 rounded-lg hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                                    title="الصفحة التالية"
                                >
                                    <ChevronLeftIcon className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Zoom */}
                            <div className="flex items-center gap-1 bg-slate-800 px-2.5 py-1.5 rounded-2xl border border-slate-700 text-xs font-mono font-bold text-slate-300">
                                <button onClick={() => setZoom(z => Math.max(0.8, z - 0.15))} className="px-1 hover:text-white cursor-pointer">-</button>
                                <span>{Math.round(zoom * 100)}%</span>
                                <button onClick={() => setZoom(z => Math.min(2.0, z + 0.15))} className="px-1 hover:text-white cursor-pointer">+</button>
                            </div>
                        </div>

                        {/* Right: Quick Actions & Save Button */}
                        <div className="flex items-center gap-2.5">
                            {/* Add text button */}
                            <button
                                onClick={handleAddNewBlock}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
                                title="إضافة نص جديد في الصفحة"
                            >
                                <PlusIcon className="w-3.5 h-3.5 text-blue-400" />
                                <span>إضافة نص</span>
                            </button>

                            {/* Search toggle */}
                            <button
                                onClick={() => setShowSearch(!showSearch)}
                                className={`p-2 rounded-xl border transition-colors cursor-pointer text-xs font-bold ${
                                    showSearch ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                }`}
                                title="بحث واستبدال"
                            >
                                🔍
                            </button>

                            {/* Save Button */}
                            <button
                                onClick={handleSavePdf}
                                disabled={isSaving}
                                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-black text-xs sm:text-sm shadow-lg shadow-red-600/30 transition-all cursor-pointer disabled:opacity-60"
                            >
                                {isSaving ? (
                                    <>
                                        <LoadingSpinner />
                                        <span>جاري الحفظ...</span>
                                    </>
                                ) : (
                                    <>
                                        <ArrowDownTrayIcon className="w-4 h-4" />
                                        <span>حفظ وتصدير PDF</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* FIND & REPLACE DRAWER (When Toggled) */}
                    {showSearch && (
                        <div className="p-3.5 bg-blue-50/90 rounded-2xl border border-blue-200 flex flex-wrap items-center justify-between gap-3 text-xs animate-fade-in">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="font-bold text-blue-900">بحث واستبدال الكلمات:</span>
                                
                                <input 
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="الكلمة الأصلية..."
                                    className="px-3 py-1.5 rounded-xl border border-blue-200 bg-white font-bold text-slate-800 text-xs w-44"
                                />

                                <input 
                                    type="text"
                                    value={replaceQuery}
                                    onChange={(e) => setReplaceQuery(e.target.value)}
                                    placeholder="الكلمة البديلة..."
                                    className="px-3 py-1.5 rounded-xl border border-blue-200 bg-white font-bold text-slate-800 text-xs w-44"
                                />

                                <button
                                    onClick={handleSearch}
                                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-blue-700 font-bold border border-blue-200 cursor-pointer shadow-xs"
                                >
                                    فحص {matchCount > 0 && `(${matchCount})`}
                                </button>

                                <button
                                    onClick={handleReplaceAll}
                                    disabled={!searchQuery.trim()}
                                    className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer shadow-xs disabled:opacity-50"
                                >
                                    استبدال الكل في الصفحة
                                </button>
                            </div>

                            <span className="text-blue-700 text-[11px] font-medium">
                                💡 يتم استبدال الكلمات وتحديث مكانها في المستند فورياً.
                            </span>
                        </div>
                    )}

                    {/* MAIN WORKSPACE: THUMBNAILS (LEFT) + DOCUMENT CANVAS (CENTER) + ACROBAT FORMAT PANEL (RIGHT) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                        
                        {/* 1. LEFT: Page Thumbnails Sidebar */}
                        <div className="lg:col-span-2 bg-white p-3 rounded-3xl border border-slate-200 shadow-xs max-h-[780px] overflow-y-auto space-y-2.5">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100 px-1">
                                <h4 className="text-xs font-black text-slate-800">الصفحات</h4>
                                <span className="text-[10px] font-mono text-slate-400">{pages.length}</span>
                            </div>

                            <div className="space-y-2">
                                {pages.map((p, idx) => {
                                    const isSelected = idx === currentPageIndex;
                                    const modCount = (pageBlocks[idx] || []).filter(b => b.isModified).length;

                                    return (
                                        <div
                                            key={p.pageNumber}
                                            onClick={() => {
                                                setCurrentPageIndex(idx);
                                                setActiveBlockId(null);
                                            }}
                                            className={`p-1.5 rounded-2xl border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                                                isSelected
                                                    ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                                                    : 'bg-slate-50/50 border-slate-200 hover:bg-white'
                                            }`}
                                        >
                                            <div className="w-full bg-white rounded-lg shadow-xs overflow-hidden border border-slate-100">
                                                <img 
                                                    src={p.thumbnail} 
                                                    alt={`صفحة ${p.pageNumber}`}
                                                    className="w-full h-auto object-contain block"
                                                />
                                            </div>

                                            <div className="flex items-center justify-between w-full px-1 text-[11px]">
                                                <span className={`font-bold ${isSelected ? 'text-blue-700' : 'text-slate-500'}`}>
                                                    صفحة {p.pageNumber}
                                                </span>
                                                {modCount > 0 && (
                                                    <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                                                        {modCount} تعديل
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 2. CENTER: Adobe Acrobat Document Canvas with Direct In-Place Text Editing */}
                        <div className="lg:col-span-7 bg-slate-200/70 p-4 sm:p-8 rounded-3xl border border-slate-300/80 shadow-inner flex flex-col items-center justify-center min-h-[680px] overflow-auto relative">
                            
                            {/* Live Page Sheet (Like Adobe Acrobat Document Canvas) */}
                            <div 
                                className="relative bg-white shadow-2xl rounded-sm overflow-hidden select-text border border-slate-300"
                                onClick={(e) => {
                                    if (e.target === e.currentTarget) {
                                        setActiveBlockId(null);
                                    }
                                }}
                            >
                                {/* Underlying original PDF page graphics (tables, vectors, images) */}
                                <canvas ref={pdfCanvasRef} className="block pointer-events-none" />

                                {/* ACROBAT LIVE IN-PLACE TEXT LAYER */}
                                <div className="absolute inset-0 pointer-events-auto">
                                    {currentBlocks.map(block => {
                                        const isActive = activeBlockId === block.id;

                                        return (
                                            <div
                                                key={block.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveBlockId(block.id);
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    left: `${block.x}px`,
                                                    top: `${block.y}px`,
                                                    minWidth: `${Math.max(block.width, 50)}px`,
                                                    minHeight: `${block.height}px`,
                                                    fontSize: `${block.fontSize}px`,
                                                    fontFamily: block.fontFamily,
                                                    color: block.isModified ? block.color : 'transparent',
                                                    fontWeight: block.isBold ? 'bold' : 'normal',
                                                    fontStyle: block.isItalic ? 'italic' : 'normal',
                                                    textAlign: block.textAlign,
                                                    lineHeight: 1.25,
                                                }}
                                                className={`transition-all rounded-xs ${
                                                    isActive
                                                        ? 'bg-white shadow-lg border-2 border-dashed border-blue-600 ring-4 ring-blue-500/15 z-30'
                                                        : block.isModified
                                                            ? 'bg-white shadow-xs border border-emerald-400 z-20'
                                                            : 'hover:border hover:border-dashed hover:border-blue-400/70 cursor-text'
                                                }`}
                                            >
                                                {/* Corner Sizing Grips (Iconic Adobe Acrobat Bounding Box Look) */}
                                                {isActive && (
                                                    <>
                                                        <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-blue-600 border border-white rounded-xs pointer-events-none" />
                                                        <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-600 border border-white rounded-xs pointer-events-none" />
                                                        <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-blue-600 border border-white rounded-xs pointer-events-none" />
                                                        <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-600 border border-white rounded-xs pointer-events-none" />
                                                    </>
                                                )}

                                                {/* In-Place ContentEditable Text: Direct Typing right on the page */}
                                                <div
                                                    contentEditable={true}
                                                    suppressContentEditableWarning={true}
                                                    onFocus={() => setActiveBlockId(block.id)}
                                                    onBlur={(e) => {
                                                        const newText = e.currentTarget.innerText;
                                                        handleUpdateText(block.id, newText);
                                                    }}
                                                    className="outline-hidden px-1 py-0.5 w-full h-full block font-sans"
                                                    style={{
                                                        color: block.isModified || isActive ? block.color : 'inherit',
                                                    }}
                                                    dir="auto"
                                                >
                                                    {block.text}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* 3. RIGHT: Adobe Acrobat Pro Formatting Panel */}
                        <div className="lg:col-span-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-5">
                            
                            <div className="border-b border-slate-100 pb-3">
                                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                                    <span>لوحة التنسيق (Acrobat)</span>
                                    <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                                        تعديل فوري
                                    </span>
                                </h4>
                                <p className="text-[11px] text-slate-400 mt-1">
                                    {activeBlock 
                                        ? 'قم بتعديل النص المحدد مباشرة وتغيير خطه وتنسيقه ولونه.'
                                        : 'انقر على أي نص على الصفحة للتحكم في خصائصه.'}
                                </p>
                            </div>

                            {activeBlock ? (
                                <div className="space-y-4">
                                    {/* 1. Font Family */}
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-600">نوع الخط:</label>
                                        <select
                                            value={activeBlock.fontFamily}
                                            onChange={(e) => handleUpdateFormatting({ fontFamily: e.target.value })}
                                            className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800"
                                        >
                                            {FONTS.map(f => (
                                                <option key={f.id} value={f.id}>{f.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 2. Font Size Stepper */}
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-600">حجم الخط:</label>
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={activeBlock.fontSize}
                                                onChange={(e) => handleUpdateFormatting({ fontSize: Number(e.target.value) })}
                                                className="flex-1 p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono font-bold text-slate-800"
                                            >
                                                {FONT_SIZES.map(s => (
                                                    <option key={s} value={s}>{s} pt</option>
                                                ))}
                                            </select>
                                            
                                            <button
                                                onClick={() => handleUpdateFormatting({ fontSize: Math.max(8, activeBlock.fontSize - 1) })}
                                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold"
                                            >
                                                -
                                            </button>
                                            <button
                                                onClick={() => handleUpdateFormatting({ fontSize: activeBlock.fontSize + 1 })}
                                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>

                                    {/* 3. Bold, Italic & Alignment */}
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-600">النمط والمحاذاة:</label>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => handleUpdateFormatting({ isBold: !activeBlock.isBold })}
                                                className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                                                    activeBlock.isBold ? 'bg-blue-600 text-white border-blue-600 shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-700'
                                                }`}
                                            >
                                                B عريض
                                            </button>
                                            <button
                                                onClick={() => handleUpdateFormatting({ isItalic: !activeBlock.isItalic })}
                                                className={`flex-1 py-2 rounded-xl text-xs font-serif italic border transition-all ${
                                                    activeBlock.isItalic ? 'bg-blue-600 text-white border-blue-600 shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-700'
                                                }`}
                                            >
                                                I مائل
                                            </button>
                                        </div>
                                    </div>

                                    {/* 4. Text Color Swatches */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-600">لون النص:</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {COLOR_SWATCHES.map(c => (
                                                <button
                                                    key={c}
                                                    onClick={() => handleUpdateFormatting({ color: c })}
                                                    style={{ backgroundColor: c }}
                                                    className={`w-6 h-6 rounded-lg transition-transform ${
                                                        activeBlock.color === c ? 'ring-2 ring-blue-500 scale-110 shadow-xs' : 'hover:scale-105'
                                                    }`}
                                                />
                                            ))}
                                            <input
                                                type="color"
                                                value={activeBlock.color}
                                                onChange={(e) => handleUpdateFormatting({ color: e.target.value })}
                                                className="w-6 h-6 rounded-lg border border-slate-200 cursor-pointer p-0"
                                                title="لون مخصص"
                                            />
                                        </div>
                                    </div>

                                    {/* 5. Actions on block */}
                                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                                        <button
                                            onClick={() => handleDeleteBlock(activeBlock.id)}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-red-600 hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer"
                                        >
                                            <TrashIcon className="w-3.5 h-3.5" />
                                            <span>حذف هذا النص</span>
                                        </button>

                                        <button
                                            onClick={() => setActiveBlockId(null)}
                                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                                        >
                                            تم التعديل ✓
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-10 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                                    <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-lg mx-auto font-black">
                                        ✍️
                                    </div>
                                    <p className="text-xs font-bold text-slate-700">لم يتم تحديد نص حالياً</p>
                                    <p className="text-[11px] text-slate-400">
                                        انقر على أي سطر أو كلمة داخل الصفحة للبدء في تعديلها مباشرة بلوحة المفاتيح.
                                    </p>
                                </div>
                            )}

                        </div>

                    </div>

                    {/* Error display */}
                    {error && (
                        <p className="text-red-700 text-center bg-red-50 p-4 rounded-2xl border border-red-200 font-medium text-sm">
                            {error}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default InteractiveEditorPdf;
