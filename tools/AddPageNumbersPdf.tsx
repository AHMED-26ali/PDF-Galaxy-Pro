
import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';

declare const PDFLib: any;
declare const download: any;

type Position = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

const AddPageNumbersPdf: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [position, setPosition] = useState<Position>('bottom-center');
    const [fontSize, setFontSize] = useState(12);
    const [margin, setMargin] = useState(20);

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            setFile(selectedFiles[0]);
            setError(null);
        }
    }, []);
    
    const handleAddNumbers = async () => {
        if (!file) return;
        setIsLoading(true);
        setError(null);
        
        try {
            const { PDFDocument, rgb, StandardFonts } = PDFLib;
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const pages = pdfDoc.getPages();
            
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const { width, height } = page.getSize();
                const text = `${i + 1} / ${pages.length}`;
                const textWidth = font.widthOfTextAtSize(text, fontSize);

                let x, y;
                
                if (position.includes('bottom')) {
                    y = margin;
                } else {
                    y = height - fontSize - margin;
                }
                
                if (position.includes('left')) {
                    x = margin;
                } else if (position.includes('center')) {
                    x = (width - textWidth) / 2;
                } else { // right
                    x = width - textWidth - margin;
                }

                page.drawText(text, { x, y, size: fontSize, font, color: rgb(0, 0, 0) });
            }
            
            const pdfBytes = await pdfDoc.save();
            download(pdfBytes, `${file.name.replace('.pdf', '')}_numbered.pdf`, "application/pdf");
            setFile(null);
        } catch (e) {
            setError("حدث خطأ أثناء إضافة أرقام الصفحات.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            {!file ? (
                <FileUploader onFilesSelected={onFilesSelected} multiple={false} accept=".pdf" />
            ) : (
                <div className="space-y-6">
                    <p className="text-xl text-center">الملف جاهز: <span className="font-bold text-blue-400">{file.name}</span></p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label htmlFor="position" className="block mb-2 font-semibold text-slate-300">الموضع</label>
                            <select id="position" value={position} onChange={e => setPosition(e.target.value as Position)} className="w-full bg-slate-800 border border-slate-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="top-left">أعلى اليسار</option>
                                <option value="top-center">أعلى الوسط</option>
                                <option value="top-right">أعلى اليمين</option>
                                <option value="bottom-left">أسفل اليسار</option>
                                <option value="bottom-center">أسفل الوسط</option>
                                <option value="bottom-right">أسفل اليمين</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="fontSize" className="block mb-2 font-semibold text-slate-300">حجم الخط</label>
                            <input type="number" id="fontSize" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                        </div>
                        <div>
                            <label htmlFor="margin" className="block mb-2 font-semibold text-slate-300">الهامش (px)</label>
                            <input type="number" id="margin" value={margin} onChange={e => setMargin(parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                        </div>
                    </div>
                    <div className="text-center p-4 border-t border-slate-800">
                        <button 
                            onClick={handleAddNumbers}
                            disabled={isLoading}
                            className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 disabled:bg-slate-600 transition-colors flex items-center justify-center mx-auto"
                        >
                            {isLoading ? <LoadingSpinner/> : 'إضافة أرقام الصفحات'}
                        </button>
                    </div>
                </div>
            )}
            {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
        </div>
    );
};

export default AddPageNumbersPdf;