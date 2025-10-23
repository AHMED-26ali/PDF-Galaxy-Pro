
import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';

declare const PDFLib: any;
declare const JSZip: any;
declare const download: any;

const SplitPdf: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            setFile(selectedFiles[0]);
            setError(null);
        }
    }, []);

    const handleSplit = async () => {
        if (!file) {
            setError("يرجى تحميل ملف PDF أولاً.");
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            const { PDFDocument } = PDFLib;
            const zip = new JSZip();

            const arrayBuffer = await file.arrayBuffer();
            const originalPdf = await PDFDocument.load(arrayBuffer);
            const pageCount = originalPdf.getPageCount();

            for (let i = 0; i < pageCount; i++) {
                const newPdf = await PDFDocument.create();
                const [copiedPage] = await newPdf.copyPages(originalPdf, [i]);
                newPdf.addPage(copiedPage);
                const pdfBytes = await newPdf.save();
                zip.file(`page_${i + 1}.pdf`, pdfBytes);
            }

            const zipContent = await zip.generateAsync({ type: "blob" });
            download(zipContent, `${file.name.replace('.pdf', '')}_split.zip`, "application/zip");
            setFile(null);

        } catch (e) {
            console.error(e);
            setError("حدث خطأ أثناء تقسيم الملف. يرجى المحاولة مرة أخرى.");
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div>
            {!file ? (
                <FileUploader onFilesSelected={onFilesSelected} multiple={false} accept=".pdf" />
            ) : (
                <div className="text-center">
                    <p className="text-xl mb-6">الملف جاهز للتقسيم: <span className="font-bold text-blue-400">{file.name}</span></p>
                     <div className="text-center p-4 border-t border-slate-800">
                        <button 
                            onClick={handleSplit}
                            disabled={isLoading}
                            className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 disabled:bg-slate-600 transition-colors flex items-center justify-center mx-auto"
                        >
                            {isLoading ? <LoadingSpinner/> : 'تقسيم كل الصفحات'}
                        </button>
                    </div>
                </div>
            )}
            {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
        </div>
    );
};

export default SplitPdf;