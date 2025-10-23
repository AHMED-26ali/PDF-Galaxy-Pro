
import React, { useState, useCallback, useRef } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { XMarkIcon, PlusIcon } from '../components/icons';

// Make pdf-lib, pdf.js, and download available in the component scope
declare const PDFLib: any;
declare const pdfjsLib: any;
declare const download: any;

interface PagePreview {
  id: string;
  thumbnailUrl: string;
  sourceFileName: string;
  sourcePageIndex: number;
}

const MergePdf: React.FC = () => {
    const [pages, setPages] = useState<PagePreview[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const sourceFiles = useRef<Map<string, File>>(new Map());
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFiles = useCallback(async (filesToProcess: File[]) => {
        setIsLoading(true);
        setError(null);
        
        // Add new files to our source file map
        filesToProcess.forEach(file => {
            if (!sourceFiles.current.has(file.name)) {
                sourceFiles.current.set(file.name, file);
            }
        });
        
        const newPages: PagePreview[] = [];

        for (const file of filesToProcess) {
            setLoadingMessage(`جاري معالجة الملف: ${file.name}...`);
            
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
                const numPages = pdfDoc.numPages;

                for (let j = 0; j < numPages; j++) {
                    setLoadingMessage(`استخراج صفحة ${j + 1} من ${numPages} في ملف ${file.name}`);
                    const page = await pdfDoc.getPage(j + 1);
                    const viewport = page.getViewport({ scale: 0.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    
                    if(context) {
                        await page.render({ canvasContext: context, viewport }).promise;
                        newPages.push({
                            id: `${file.name}-${j}-${Date.now()}`,
                            thumbnailUrl: canvas.toDataURL(),
                            sourceFileName: file.name,
                            sourcePageIndex: j,
                        });
                    }
                }
            } catch (e) {
                console.error(`Failed to process file ${file.name}:`, e);
                setError(`لا يمكن معالجة الملف: ${file.name}. قد يكون تالفًا أو غير مدعوم.`);
                // Remove file from source map if it fails
                sourceFiles.current.delete(file.name);
            }
        }
        
        setPages(prev => [...prev, ...newPages]);
        setIsLoading(false);
        setLoadingMessage('');
    }, []);

    const onFilesSelected = (selectedFiles: File[]) => {
        const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf');
        if (pdfFiles.length > 0) {
            processFiles(pdfFiles);
        }
    };
    
    const handleRemovePage = (pageId: string) => {
        setPages(prev => {
            const newPages = prev.filter(p => p.id !== pageId);
            // Check if any source file is now unused and remove it
            const usedFileNames = new Set(newPages.map(p => p.sourceFileName));
            for (const key of sourceFiles.current.keys()) {
                if (!usedFileNames.has(key)) {
                    sourceFiles.current.delete(key);
                }
            }
            return newPages;
        });
    };

    const handleMerge = async () => {
        if (pages.length < 1) {
            setError("لا توجد صفحات للدمج.");
            return;
        }
        setIsLoading(true);
        setLoadingMessage("تحضير الملفات للدمج...");
        setError(null);

        try {
            const { PDFDocument } = PDFLib;
            const mergedPdf = await PDFDocument.create();
            
            const loadedDocs = new Map<string, any>();
            
            // Pre-load all necessary source PDFs into pdf-lib documents
            const uniqueFileNames = Array.from(new Set(pages.map(p => p.sourceFileName)));
            for (const fileName of uniqueFileNames) {
                const file = sourceFiles.current.get(fileName);
                if (file) {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdfDoc = await PDFDocument.load(arrayBuffer);
                    loadedDocs.set(fileName, pdfDoc);
                }
            }

            // Iterate through the user-sorted pages
            for (let i = 0; i < pages.length; i++) {
                const pageInfo = pages[i];
                setLoadingMessage(`إضافة صفحة ${i + 1} من ${pages.length}`);
                
                const sourceDoc = loadedDocs.get(pageInfo.sourceFileName);
                if (sourceDoc) {
                    const [copiedPage] = await mergedPdf.copyPages(sourceDoc, [pageInfo.sourcePageIndex]);
                    mergedPdf.addPage(copiedPage);
                }
            }
            
            const mergedPdfBytes = await mergedPdf.save();
            download(mergedPdfBytes, "merged_document.pdf", "application/pdf");
            
            // Reset state
            setPages([]);
            sourceFiles.current.clear();

        } catch (e) {
            console.error(e);
            setError("حدث خطأ أثناء دمج الملفات. يرجى المحاولة مرة أخرى.");
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };
    
    // Drag and Drop handlers
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const handleSort = () => {
        if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) {
            dragItem.current = null;
            dragOverItem.current = null;
            return;
        };
        
        const newPages = [...pages];
        const draggedItemContent = newPages.splice(dragItem.current, 1)[0];
        newPages.splice(dragOverItem.current, 0, draggedItemContent);
        
        dragItem.current = null;
        dragOverItem.current = null;

        setPages(newPages);
    };

    const handleAddMoreClick = () => {
        fileInputRef.current?.click();
    };
    
    const handleAddMoreFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
            onFilesSelected(files);
        }
        // Reset the input value to allow selecting the same file again
        e.target.value = '';
    };

    if (isLoading && pages.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <LoadingSpinner />
                <p className="text-lg mt-4 text-slate-300">{loadingMessage}</p>
            </div>
        );
    }

    if (pages.length === 0) {
        return (
             <div>
                <FileUploader onFilesSelected={onFilesSelected} multiple={true} accept=".pdf" />
                {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 mb-6">
                {pages.map((page, index) => (
                    <div 
                        key={page.id}
                        className="relative group bg-slate-800 rounded-md p-1.5 cursor-grab active:cursor-grabbing border-2 border-transparent hover:border-blue-500 transition-all flex flex-col items-center"
                        draggable
                        onDragStart={() => dragItem.current = index}
                        onDragEnter={() => dragOverItem.current = index}
                        onDragEnd={handleSort}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        <div className="relative w-full">
                            <img src={page.thumbnailUrl} alt={`Page preview`} className="w-full h-auto rounded-sm" />
                            <div className="absolute top-1 right-1 bg-slate-900/80 text-white text-xs font-bold px-1.5 py-0.5 rounded-sm">
                                {index + 1}
                            </div>
                            <button
                                draggable="false"
                                onClick={() => handleRemovePage(page.id)} 
                                className="absolute top-1 left-1 p-1 rounded-full bg-red-600/80 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                                aria-label={`Remove page`}
                            >
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="text-xs text-slate-400 mt-1.5 text-center truncate w-full" title={`${page.sourceFileName} (p${page.sourcePageIndex + 1})`}>
                            {page.sourceFileName} <span className="text-slate-500">(p{page.sourcePageIndex + 1})</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-6 mb-8">
                <button
                    onClick={handleAddMoreClick}
                    className="flex items-center justify-center w-full py-4 border-2 border-dashed border-slate-600 rounded-md text-slate-400 hover:bg-slate-700/50 hover:border-blue-500 transition-colors"
                >
                    <PlusIcon className="w-6 h-6 mr-2" />
                    <span>إضافة المزيد من الملفات</span>
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept=".pdf"
                    onChange={handleAddMoreFiles}
                />
            </div>

            <div className="text-center p-4 pt-6 border-t border-slate-800 sticky bottom-0 bg-slate-900/50 backdrop-blur-sm -mx-8 -mb-8 px-8 pb-8 rounded-b-xl">
                 {error && <p className="text-red-500 mb-4 text-center">{error}</p>}
                <button 
                    onClick={handleMerge}
                    disabled={isLoading || pages.length < 1}
                    className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center mx-auto"
                >
                    {isLoading ? 
                        <>
                           <LoadingSpinner/>
                           <span className="mr-3">{loadingMessage || 'جاري الدمج...'}</span>
                        </>
                        : `دمج ${pages.length} صفحات`
                    }
                </button>
            </div>
        </div>
    );
};

export default MergePdf;