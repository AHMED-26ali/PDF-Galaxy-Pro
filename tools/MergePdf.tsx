
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
                        className="relative group bg-slate-50 rounded-2xl p-2 cursor-grab active:cursor-grabbing border-2 border-slate-200 hover:border-blue-500 transition-all flex flex-col items-center shadow-xs"
                        draggable
                        onDragStart={() => dragItem.current = index}
                        onDragEnter={() => dragOverItem.current = index}
                        onDragEnd={handleSort}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        <div className="relative w-full">
                            <img src={page.thumbnailUrl} alt={`Page preview`} className="w-full h-auto rounded-xl shadow-xs" />
                            <div className="absolute top-1.5 right-1.5 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-lg shadow-sm">
                                {index + 1}
                            </div>
                            <button
                                draggable="false"
                                onClick={() => handleRemovePage(page.id)} 
                                className="absolute top-1.5 left-1.5 p-1 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 shadow-sm"
                                aria-label={`Remove page`}
                            >
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="text-xs text-slate-600 mt-2 text-center truncate w-full font-medium" title={`${page.sourceFileName} (p${page.sourcePageIndex + 1})`}>
                            {page.sourceFileName} <span className="text-slate-400 font-normal">(p{page.sourcePageIndex + 1})</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-6 mb-8">
                <button
                    onClick={handleAddMoreClick}
                    className="flex items-center justify-center w-full py-4 border-2 border-dashed border-blue-200 rounded-2xl text-blue-600 font-bold bg-blue-50/40 hover:bg-blue-50 hover:border-blue-400 transition-all shadow-xs"
                >
                    <PlusIcon className="w-5 h-5 ml-2" />
                    <span>إضافة المزيد من ملفات PDF</span>
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

            <div className="text-center p-4 pt-6 border-t border-slate-100 sticky bottom-0 bg-white/95 backdrop-blur-sm -mx-6 -mb-6 sm:-mx-10 sm:-mb-10 px-6 sm:px-10 pb-6 rounded-b-3xl">
                 {error && <p className="text-red-600 mb-4 text-center bg-red-50 p-2.5 rounded-xl border border-red-200 font-medium">{error}</p>}
                <button 
                    onClick={handleMerge}
                    disabled={isLoading || pages.length < 1}
                    className="bg-blue-600 text-white font-bold py-3.5 px-10 rounded-2xl hover:bg-blue-700 shadow-md shadow-blue-500/25 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all flex items-center justify-center mx-auto text-base"
                >
                    {isLoading ? 
                        <>
                           <LoadingSpinner/>
                           <span className="mr-3">{loadingMessage || 'جاري الدمج...'}</span>
                        </>
                        : `دمج وتحميل ${pages.length} صفحات الآن`
                    }
                </button>
            </div>
        </div>
    );
};

export default MergePdf;