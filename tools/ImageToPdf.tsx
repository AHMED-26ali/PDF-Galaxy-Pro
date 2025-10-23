
import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { XMarkIcon } from '../components/icons';

declare const PDFLib: any;
declare const download: any;

type PageSize = 'A4' | 'Letter';
type Orientation = 'portrait' | 'landscape';

const PAGE_SIZES: { [key in PageSize]: [number, number] } = {
    A4: [595.28, 841.89],
    Letter: [612, 792],
};

const ImageToPdf: React.FC = () => {
    const [files, setFiles] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pageSize, setPageSize] = useState<PageSize>('A4');
    const [orientation, setOrientation] = useState<Orientation>('portrait');

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        const imageFiles = selectedFiles.filter(f => f.type.startsWith('image/'));
        setFiles(prevFiles => [...prevFiles, ...imageFiles]);
        setError(null);
    }, []);

    const handleRemoveFile = (index: number) => {
        if (window.confirm('هل أنت متأكد أنك تريد إزالة هذه الصورة من القائمة؟')) {
            setFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
        }
    };

    const handleConversion = async () => {
        if (files.length === 0) {
            setError("يرجى تحميل صورة واحدة على الأقل.");
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.create();

            for (const file of files) {
                const arrayBuffer = await file.arrayBuffer();
                
                let image;
                if (file.type === 'image/jpeg') {
                    image = await pdfDoc.embedJpg(arrayBuffer);
                } else if (file.type === 'image/png') {
                    image = await pdfDoc.embedPng(arrayBuffer);
                } else {
                    // Skip unsupported file types
                    console.warn(`Skipping unsupported file type: ${file.type}`);
                    continue;
                }

                const imageDims = image.scale(1);
                const [pageWidth, pageHeight] = orientation === 'portrait'
                    ? PAGE_SIZES[pageSize]
                    : PAGE_SIZES[pageSize].slice().reverse();

                const page = pdfDoc.addPage([pageWidth, pageHeight]);

                const pageAspectRatio = pageWidth / pageHeight;
                const imageAspectRatio = imageDims.width / imageDims.height;

                let scaledWidth, scaledHeight;
                if (imageAspectRatio > pageAspectRatio) {
                    scaledWidth = pageWidth;
                    scaledHeight = pageWidth / imageAspectRatio;
                } else {
                    scaledHeight = pageHeight;
                    scaledWidth = pageHeight * imageAspectRatio;
                }
                
                const x = (pageWidth - scaledWidth) / 2;
                const y = (pageHeight - scaledHeight) / 2;

                page.drawImage(image, {
                    x, y,
                    width: scaledWidth,
                    height: scaledHeight,
                });
            }

            const pdfBytes = await pdfDoc.save();
            download(pdfBytes, "converted-images.pdf", "application/pdf");
            setFiles([]);

        } catch (e) {
            console.error(e);
            setError("حدث خطأ أثناء تحويل الصور. قد يكون أحد الملفات تالفًا.");
        } finally {
            setIsLoading(false);
        }
    };

    // Drag and Drop handlers
    const onDragStart = (e: React.DragEvent<HTMLLIElement>, index: number) => {
        e.dataTransfer.setData("draggedIndex", index.toString());
    };
    const onDragOver = (e: React.DragEvent<HTMLLIElement>) => {
        e.preventDefault();
    };
    const onDrop = (e: React.DragEvent<HTMLLIElement>, dropIndex: number) => {
        e.preventDefault();
        const draggedIndex = parseInt(e.dataTransfer.getData("draggedIndex"), 10);
        const newFiles = [...files];
        const draggedItem = newFiles[draggedIndex];
        newFiles.splice(draggedIndex, 1);
        newFiles.splice(dropIndex, 0, draggedItem);
        setFiles(newFiles);
    };

    return (
        <div>
            {files.length === 0 ? (
                <FileUploader onFilesSelected={onFilesSelected} multiple={true} accept="image/*" />
            ) : (
                <div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label htmlFor="pageSize" className="block mb-2 font-semibold text-slate-300">حجم الصفحة</label>
                            <select id="pageSize" value={pageSize} onChange={e => setPageSize(e.target.value as PageSize)} className="w-full bg-slate-800 border border-slate-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="A4">A4</option>
                                <option value="Letter">Letter</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="orientation" className="block mb-2 font-semibold text-slate-300">الاتجاه</label>
                            <select id="orientation" value={orientation} onChange={e => setOrientation(e.target.value as Orientation)} className="w-full bg-slate-800 border border-slate-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="portrait">طولي (Portrait)</option>
                                <option value="landscape">عرضي (Landscape)</option>
                            </select>
                        </div>
                    </div>
                    <h3 className="text-lg font-semibold mb-4">الصور المحددة (اسحب للإعادة الترتيب):</h3>
                    <ul className="space-y-3 mb-6">
                        {files.map((file, index) => (
                            <li 
                                key={index} 
                                className="bg-slate-800 p-3 rounded-lg flex items-center justify-between cursor-grab active:cursor-grabbing"
                                draggable
                                onDragStart={(e) => onDragStart(e, index)}
                                onDragOver={onDragOver}
                                onDrop={(e) => onDrop(e, index)}
                            >
                                <div className="flex items-center gap-3">
                                    <img src={URL.createObjectURL(file)} alt={file.name} className="w-12 h-12 object-cover rounded-md" />
                                    <span className="text-white">{file.name}</span>
                                </div>
                                <button
                                    draggable="false"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); handleRemoveFile(index); }} 
                                    className="p-1 rounded-full hover:bg-slate-700"
                                >
                                    <XMarkIcon className="w-5 h-5 text-slate-400" />
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className="text-center p-4 border-t border-slate-800">
                        <button 
                            onClick={handleConversion}
                            disabled={isLoading || files.length === 0}
                            className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center mx-auto"
                        >
                            {isLoading ? <LoadingSpinner/> : 'تحويل إلى PDF'}
                        </button>
                    </div>
                </div>
            )}
            {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
        </div>
    );
};

export default ImageToPdf;