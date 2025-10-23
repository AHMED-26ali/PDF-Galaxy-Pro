
import React, { useState, useRef, useEffect, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { 
    CursorArrowRaysIcon, PencilIcon, DocumentTextIcon, StopIcon, ViewfinderCircleIcon, TrashIcon, XMarkIcon, 
    ArrowPathIcon, ArrowUturnLeftIcon
} from '../components/icons';

declare const fabric: any;
declare const pdfjsLib: any;
declare const PDFLib: any;
declare const download: any;

interface PageData {
    fabricJSON: string;
    thumbnail: string;
    originalPage: any;
    rotation: number;
}

const editorButtons = [
    { id: 'select', label: 'تحديد', icon: CursorArrowRaysIcon, type: 'tool' },
    { id: 'brush', label: 'فرشاة', icon: PencilIcon, type: 'tool' },
    { id: 'rect', label: 'مستطيل', icon: StopIcon, type: 'shape' },
    { id: 'ellipse', label: 'بيضاوي', icon: ViewfinderCircleIcon, type: 'shape' },
    { id: 'text', label: 'نص', icon: DocumentTextIcon, type: 'shape' },
] as const;

const InteractiveEditorPdf: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [pagesData, setPagesData] = useState<PageData[]>([]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState('select');
    const [activeObject, setActiveObject] = useState<any>(null);

    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricCanvasRef = useRef<any>(null);

    const onFilesSelected = useCallback((files: File[]) => {
        if (files.length > 0) {
            if (fabricCanvasRef.current) {
                fabricCanvasRef.current.dispose();
                fabricCanvasRef.current = null;
            }
            setFile(files[0]);
            setPdfDoc(null);
            setPagesData([]);
            setCurrentPageIndex(0);
        }
    }, []);

    // Renders a single page to a canvas and returns a data URL.
    const renderPageToDataURL = async (page: any, scale: number, rotation: number = 0) => {
        const viewport = page.getViewport({ scale, rotation });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        if (context) {
            await page.render({ canvasContext: context, viewport }).promise;
            return canvas.toDataURL();
        }
        return '';
    };

    // Initializes or reinitializes the Fabric.js canvas based on container size.
    const initFabricCanvas = useCallback(() => {
        if (canvasRef.current && canvasContainerRef.current) {
            if (fabricCanvasRef.current) {
                fabricCanvasRef.current.dispose();
            }
            const fabricCanvas = new fabric.Canvas(canvasRef.current);
            fabricCanvasRef.current = fabricCanvas;
            
            fabricCanvas.on('selection:created', (e: any) => setActiveObject(e.selected[0]));
            fabricCanvas.on('selection:updated', (e: any) => setActiveObject(e.selected[0]));
            fabricCanvas.on('selection:cleared', () => setActiveObject(null));
        }
    }, []);
    
    // Loads the PDF file and generates initial page data and thumbnails.
    const loadPdf = useCallback(async () => {
        if (!file) return;
        setIsLoading(true);
        setLoadingMessage("جاري تحميل ملف PDF...");
        try {
            const arrayBuffer = await file.arrayBuffer();
            const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            setPdfDoc(doc);
            const data: PageData[] = [];
            for (let i = 1; i <= doc.numPages; i++) {
                setLoadingMessage(`جاري معالجة صفحة ${i} من ${doc.numPages}...`);
                const page = await doc.getPage(i);
                const thumbnailUrl = await renderPageToDataURL(page, 0.3, page.rotate);
                data.push({
                    thumbnail: thumbnailUrl,
                    fabricJSON: '',
                    originalPage: page,
                    rotation: page.rotate || 0,
                });
            }
            setPagesData(data);
        } catch (e) {
            console.error("Failed to load PDF", e);
            setError("فشل تحميل ملف PDF. قد يكون الملف تالفًا.");
        } finally {
            setIsLoading(false);
        }
    }, [file]);

    // Loads a specific page onto the main Fabric.js canvas.
    const loadPageToCanvas = useCallback(async (pageIndex: number) => {
        if (!pdfDoc || !fabricCanvasRef.current || !pagesData[pageIndex] || !canvasContainerRef.current) return;

        const canvas = fabricCanvasRef.current;
        const pageData = pagesData[pageIndex];
        const { originalPage, fabricJSON, rotation } = pageData;

        // Calculate scale to fit container width
        const containerWidth = canvasContainerRef.current.clientWidth;
        const tempViewport = originalPage.getViewport({ scale: 1, rotation });
        const scale = containerWidth / tempViewport.width;
        const viewport = originalPage.getViewport({ scale, rotation });

        canvas.clear();
        canvas.setWidth(viewport.width);
        canvas.setHeight(viewport.height);

        const pageImageUrl = await renderPageToDataURL(originalPage, scale, rotation);
        fabric.Image.fromURL(pageImageUrl, (img: any) => {
            canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
        });

        if (fabricJSON) {
            canvas.loadFromJSON(fabricJSON, canvas.renderAll.bind(canvas));
        } else {
            canvas.renderAll();
        }
    }, [pdfDoc, pagesData]);
    
    useEffect(() => {
        if (file) loadPdf();
    }, [file, loadPdf]);
    
    useEffect(() => {
        if (pagesData.length > 0 && canvasRef.current) {
            if (!fabricCanvasRef.current) {
                initFabricCanvas();
            }
            loadPageToCanvas(currentPageIndex);
        }
    }, [currentPageIndex, pagesData, pdfDoc, initFabricCanvas, loadPageToCanvas]);

    // Cleanup effect
    useEffect(() => {
        return () => {
            if (fabricCanvasRef.current) {
                fabricCanvasRef.current.dispose();
                fabricCanvasRef.current = null;
            }
        };
    }, []);

    const handleSelectPage = (index: number) => {
        if (index === currentPageIndex || !fabricCanvasRef.current) {
            return;
        }
        const canvas = fabricCanvasRef.current;
        const currentJsonState = JSON.stringify(canvas.toJSON());
        
        setPagesData(prevPages => 
            prevPages.map((pageData, idx) => 
                idx === currentPageIndex 
                    ? { ...pageData, fabricJSON: currentJsonState } 
                    : pageData
            )
        );
        setCurrentPageIndex(index);
    };

    const handleDeletePage = (indexToDelete: number) => {
        if (window.confirm('هل أنت متأكد أنك تريد حذف هذه الصفحة؟ لا يمكن التراجع عن هذا الإجراء.')) {
            setPagesData(prev => {
                const newPages = prev.filter((_, index) => index !== indexToDelete);
                if (currentPageIndex >= newPages.length && newPages.length > 0) {
                    setCurrentPageIndex(newPages.length - 1);
                } else if (newPages.length === 0) {
                    // Reset if no pages left
                    setFile(null);
                }
                return newPages;
            });
        }
    };
    
    const handleRotatePage = async (indexToRotate: number, degrees: number) => {
        const pageData = pagesData[indexToRotate];
        const newRotation = (pageData.rotation + degrees + 360) % 360;
        const newThumbnail = await renderPageToDataURL(pageData.originalPage, 0.3, newRotation);
        
        const newPagesData = [...pagesData];
        newPagesData[indexToRotate] = {
            ...pageData,
            rotation: newRotation,
            thumbnail: newThumbnail,
        };
        setPagesData(newPagesData);

        // If rotating the current page, reload it on the canvas
        if (indexToRotate === currentPageIndex) {
            loadPageToCanvas(currentPageIndex);
        }
    };

    const switchTool = (tool: string) => {
        setActiveTool(tool);
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        canvas.isDrawingMode = tool === 'brush';
        if (tool === 'brush') {
            canvas.freeDrawingBrush.width = 5;
            canvas.freeDrawingBrush.color = '#3b82f6';
        }
    };
    
    const addShape = (shape: 'rect' | 'ellipse' | 'text') => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        let obj;
        const center = canvas.getCenter();

        switch (shape) {
            case 'rect':
                obj = new fabric.Rect({ left: center.left - 50, top: center.top - 25, width: 100, height: 50, fill: 'transparent', stroke: '#3b82f6', strokeWidth: 2 });
                break;
            case 'ellipse':
                obj = new fabric.Ellipse({ left: center.left - 50, top: center.top - 25, rx: 50, ry: 25, fill: 'transparent', stroke: '#3b82f6', strokeWidth: 2 });
                break;
            case 'text':
                obj = new fabric.IText('نص جديد', { left: center.left - 50, top: center.top - 15, fill: '#3b82f6', fontSize: 24, fontFamily: 'Poppins' });
                break;
        }
        if (obj) canvas.add(obj);
    };
    
    const updateActiveObjectProperty = (prop: string, value: any) => {
        if (activeObject) {
            activeObject.set(prop, value);
            fabricCanvasRef.current.renderAll();
        }
    };
    
    const deleteActiveObject = () => {
        if (activeObject && fabricCanvasRef.current) {
            fabricCanvasRef.current.remove(activeObject);
            setActiveObject(null);
        }
    };
    
    const handleSave = async () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas || !file) {
            setError("فشل الحفظ: مساحة التحرير أو الملف غير متاح.");
            return;
        }

        const finalJSON = JSON.stringify(canvas.toJSON());
        const finalPagesData = pagesData.map((data, index) => 
            index === currentPageIndex ? { ...data, fabricJSON: finalJSON } : data
        );

        setIsLoading(true);
        setLoadingMessage('جاري حفظ التغييرات...');
        
        try {
            const { PDFDocument, degrees } = PDFLib;
            const originalPdfBytes = await file.arrayBuffer();
            const pdfDocToLoad = await PDFDocument.load(originalPdfBytes);
            const newPdfDoc = await PDFDocument.create();
            
            for(let i=0; i < finalPagesData.length; i++) {
                setLoadingMessage(`جاري معالجة صفحة ${i+1} من ${finalPagesData.length}`);
                const pageData = finalPagesData[i];
                const { fabricJSON, rotation } = pageData;
                
                const [originalPage] = await newPdfDoc.copyPages(pdfDocToLoad, [pageData.originalPage.pageIndex]);
                originalPage.setRotation(degrees(rotation));
                const { width, height } = originalPage.getSize();
                
                if (fabricJSON) {
                    const tempCanvas = new fabric.Canvas(null, { width, height });
                    await new Promise<void>(resolve => {
                       tempCanvas.loadFromJSON(fabricJSON, async () => {
                            const dataUrl = tempCanvas.toDataURL({ format: 'png' });
                            try {
                                const buffer = await fetch(dataUrl).then(res => res.arrayBuffer());
                                if (buffer.byteLength > 0) {
                                    const overlayImage = await newPdfDoc.embedPng(buffer);
                                    originalPage.drawImage(overlayImage, { x: 0, y: 0, width, height });
                                }
                            } catch (imgError) {
                                console.error(`Error processing overlay for page ${i+1}:`, imgError);
                            } finally {
                                resolve();
                            }
                       });
                    });
                    tempCanvas.dispose();
                }
                newPdfDoc.addPage(originalPage);
            }
            
            const pdfBytes = await newPdfDoc.save();
            download(pdfBytes, `${file?.name.replace('.pdf', '')}_edited.pdf`, 'application/pdf');

        } catch(e) {
            console.error("Save failed", e);
            setError("حدث خطأ فادح أثناء حفظ الملف.");
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <LoadingSpinner />
                <p className="text-lg mt-4 text-slate-300">{loadingMessage}</p>
            </div>
        );
    }

    if (!file) {
        return <FileUploader onFilesSelected={onFilesSelected} multiple={false} accept=".pdf" />;
    }

    return (
        <div className="flex flex-col h-[calc(100vh-200px)]">
            {/* Top Toolbar */}
            <div className="bg-slate-900/70 backdrop-blur-sm p-2 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-1">
                    {editorButtons.map(({ id, label, icon: Icon, type }) => (
                        <button 
                            key={id} 
                            onClick={() => {
                                if (type === 'tool') {
                                    switchTool(id);
                                } else {
                                    addShape(id as 'rect' | 'ellipse' | 'text');
                                }
                            }} 
                            title={label} 
                            className={`p-2 rounded-md ${type === 'tool' && activeTool === id ? 'bg-blue-600 text-white' : 'hover:bg-slate-700'}`}
                        >
                            <Icon className="w-6 h-6" />
                        </button>
                    ))}
                </div>
                {activeObject && (
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2">تعبئة: <input type="color" value={activeObject.fill || '#000000'} onChange={e => updateActiveObjectProperty('fill', e.target.value)} className="bg-transparent border-none" /></label>
                        <label className="flex items-center gap-2">حد: <input type="color" value={activeObject.stroke || '#000000'} onChange={e => updateActiveObjectProperty('stroke', e.target.value)} className="bg-transparent border-none" /></label>
                        <label className="flex items-center gap-2">سماكة: <input type="range" min="0" max="20" value={activeObject.strokeWidth || 0} onChange={e => updateActiveObjectProperty('strokeWidth', parseInt(e.target.value, 10))} /></label>
                        <button onClick={deleteActiveObject} className="p-2 rounded-md hover:bg-red-500"><TrashIcon className="w-6 h-6" /></button>
                    </div>
                )}
                 <button onClick={handleSave} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700">حفظ وتنزيل</button>
            </div>
            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: Pages Panel */}
                 <aside className="w-48 bg-slate-900/50 p-2 overflow-y-auto border-l border-slate-800">
                    <h3 className="text-lg font-semibold mb-2 p-2">الصفحات</h3>
                    {pagesData.map((page, index) => (
                        <div key={index} onClick={() => handleSelectPage(index)} className={`group relative p-1 rounded-md cursor-pointer mb-2 ${index === currentPageIndex ? 'ring-2 ring-blue-500' : ''}`}>
                            <img src={page.thumbnail} alt={`Page ${index + 1}`} className="w-full rounded-sm" />
                            <p className="text-center text-sm mt-1">{index + 1}</p>
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); handleRotatePage(index, -90); }} className="p-2 rounded-full bg-slate-700/80 hover:bg-slate-600 text-white" title="تدوير عكس عقارب الساعة"><ArrowUturnLeftIcon className="w-5 h-5"/></button>
                                <button onClick={(e) => { e.stopPropagation(); handleRotatePage(index, 90); }} className="p-2 rounded-full bg-slate-700/80 hover:bg-slate-600 text-white" title="تدوير مع عقارب الساعة"><ArrowPathIcon className="w-5 h-5"/></button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeletePage(index); }} className="p-2 rounded-full bg-red-600/80 hover:bg-red-500 text-white" title="حذف الصفحة"><TrashIcon className="w-5 h-5"/></button>
                            </div>
                        </div>
                    ))}
                </aside>
                {/* Center: Canvas */}
                <main ref={canvasContainerRef} className="flex-1 bg-slate-800 overflow-auto p-4 flex justify-center items-start">
                    <div className="relative">
                        <canvas ref={canvasRef} className="shadow-2xl" />
                    </div>
                </main>
            </div>
             {error && <div className="fixed bottom-4 right-4 bg-red-800 text-white p-4 rounded-lg shadow-lg z-50">{error}</div>}
        </div>
    );
};

export default InteractiveEditorPdf;