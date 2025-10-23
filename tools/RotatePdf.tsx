
import React, { useState, useCallback, useEffect, useRef } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { ChevronLeftIcon, ChevronRightIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon } from '../components/icons';

declare const PDFLib: any;
declare const pdfjsLib: any;
declare const download: any;

const RotatePdf: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [rotations, setRotations] = useState<number[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderTaskRef = useRef<any>(null); // Ref to hold the active render task

    const renderPage = useCallback(async (pageNum: number, doc: any, currentRotations: number[]) => {
        if (!doc) return;

        // If there's an active render task, cancel it.
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
        }

        try {
            const page = await doc.getPage(pageNum);
            const rotation = currentRotations[pageNum - 1] || 0;
            const viewport = page.getViewport({ scale: 1.5, rotation });
            
            const canvas = canvasRef.current;
            if (canvas) {
                const context = canvas.getContext('2d');
                if (context) {
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    
                    const task = page.render({ canvasContext: context, viewport });
                    renderTaskRef.current = task; // Store the new task
                    
                    await task.promise;
                    renderTaskRef.current = null; // Clear the task ref on completion
                }
            }
        } catch (e: any) {
            // pdf.js throws a 'RenderingCancelledException' when we cancel it.
            // This is expected, so we don't treat it as an error.
            if (e.name !== 'RenderingCancelledException') {
                console.error("Failed to render page", e);
                setError("حدث خطأ أثناء عرض الصفحة.");
            }
        }
    }, []);
    
    // This effect handles rendering the page whenever the file, page number, or rotations change.
    useEffect(() => {
        if (pdfDoc) {
            renderPage(currentPage, pdfDoc, rotations);
        }
        // Cleanup function to cancel any ongoing render when the component unmounts or dependencies change
        return () => {
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel();
            }
        };
    }, [currentPage, pdfDoc, rotations, renderPage]);

    const onFilesSelected = useCallback(async (selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            const selectedFile = selectedFiles[0];
            // Reset all state for the new file
            setFile(selectedFile);
            setIsLoading(true);
            setError(null);
            setPdfDoc(null);
            setTotalPages(0);
            setCurrentPage(1);
            setRotations([]);
            
            try {
                const arrayBuffer = await selectedFile.arrayBuffer();
                const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                setPdfDoc(doc);
                setTotalPages(doc.numPages);
                // Initialize rotations from the PDF's metadata
                const initialRotations = [];
                for (let i = 1; i <= doc.numPages; i++) {
                    const page = await doc.getPage(i);
                    initialRotations.push(page.rotate || 0);
                }
                setRotations(initialRotations);
            } catch(e) {
                setError("لا يمكن تحميل ملف PDF هذا.");
                setFile(null);
            } finally {
                setIsLoading(false);
            }
        }
    }, []);

    const handleRotate = (degrees: number) => {
        setRotations(prevRotations => {
            const newRotations = [...prevRotations];
            const currentRotation = newRotations[currentPage - 1] || 0;
            newRotations[currentPage - 1] = (currentRotation + degrees + 360) % 360;
            return newRotations;
        });
    };

    const handleSave = async () => {
        if (!file) return;
        setIsLoading(true);
        setError(null);
        try {
            const { PDFDocument, degrees } = PDFLib;
            const arrayBuffer = await file.arrayBuffer();
            const pdfToModify = await PDFDocument.load(arrayBuffer);
            
            if (pdfToModify.getPageCount() !== rotations.length) {
                throw new Error("Page count mismatch.");
            }

            rotations.forEach((rotation, index) => {
                const page = pdfToModify.getPage(index);
                page.setRotation(degrees(rotation));
            });
            const pdfBytes = await pdfToModify.save();
            download(pdfBytes, `${file.name.replace('.pdf', '')}_rotated.pdf`, "application/pdf");
            
            // Reset state after saving
            setFile(null);
            setPdfDoc(null);
            setTotalPages(0);
            setCurrentPage(1);
            setRotations([]);
        } catch(e) {
            console.error(e);
            setError("حدث خطأ أثناء حفظ الملف.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            {!file ? (
                <FileUploader onFilesSelected={onFilesSelected} multiple={false} accept=".pdf" />
            ) : isLoading && !pdfDoc ? <div className="flex justify-center"><LoadingSpinner/></div> : pdfDoc && (
                <div className="flex flex-col items-center">
                    <div className="flex items-center gap-6 mb-4">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 transition-opacity">
                            <ChevronRightIcon className="w-6 h-6" />
                        </button>
                        <span className="font-mono text-lg">صفحة {currentPage} / {totalPages}</span>
                         <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 transition-opacity">
                            <ChevronLeftIcon className="w-6 h-6" />
                        </button>
                    </div>
                    
                    <div className="bg-slate-800 p-2 rounded-lg shadow-lg mb-4">
                        <canvas ref={canvasRef} className="max-w-full h-auto rounded-md" style={{maxHeight: '50vh'}} />
                    </div>

                    <div className="flex items-center gap-4 mb-6">
                        <button onClick={() => handleRotate(-90)} className="flex items-center gap-2 bg-slate-700 px-4 py-2 rounded-lg hover:bg-slate-600 transition-colors">
                            <ArrowUturnLeftIcon className="w-5 h-5"/> تدوير عكس عقارب الساعة
                        </button>
                        <button onClick={() => handleRotate(90)} className="flex items-center gap-2 bg-slate-700 px-4 py-2 rounded-lg hover:bg-slate-600 transition-colors">
                            <ArrowUturnRightIcon className="w-5 h-5"/> تدوير مع عقارب الساعة
                        </button>
                    </div>
                    
                     <div className="text-center p-4 border-t border-slate-800 w-full">
                        <button 
                            onClick={handleSave}
                            disabled={isLoading}
                            className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center mx-auto"
                        >
                            {isLoading ? <LoadingSpinner/> : 'حفظ وتنزيل'}
                        </button>
                    </div>
                </div>
            )}
            {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
        </div>
    );
};

export default RotatePdf;