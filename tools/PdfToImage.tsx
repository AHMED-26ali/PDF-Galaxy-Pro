
import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';

declare const pdfjsLib: any;
declare const JSZip: any;
declare const download: any;

type ImageFormat = 'jpeg' | 'png';

const PdfToImage: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState('');
    const [imageFormat, setImageFormat] = useState<ImageFormat>('jpeg');

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            setFile(selectedFiles[0]);
            setError(null);
            setStatus('');
        }
    }, []);

    const handleConversion = async () => {
        if (!file) {
            setError("يرجى تحميل ملف PDF أولاً.");
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            const zip = new JSZip();
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const numPages = pdfDoc.numPages;

            for (let i = 1; i <= numPages; i++) {
                setStatus(`جاري تحويل صفحة ${i} من ${numPages}...`);
                const page = await pdfDoc.getPage(i);
                // Use a higher scale for better image quality
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');

                if (!context) {
                    throw new Error("لا يمكن إنشاء سياق الرسم للصفحة.");
                }

                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                await page.render({ canvasContext: context, viewport }).promise;

                const mimeType = `image/${imageFormat}`;
                const imageDataUrl = canvas.toDataURL(mimeType);
                const blob = await (await fetch(imageDataUrl)).blob();

                zip.file(`page_${i}.${imageFormat}`, blob);
            }

            setStatus("جاري إنشاء ملف ZIP...");
            const zipContent = await zip.generateAsync({ type: "blob" });
            download(zipContent, `${file.name.replace('.pdf', '')}.zip`, "application/zip");
            
            // Reset state after successful conversion
            setFile(null);
            setStatus('');

        } catch (e) {
            console.error(e);
            setError("حدث خطأ أثناء تحويل الملف. قد يكون الملف تالفًا أو غير مدعوم.");
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
                    {!isLoading ? (
                        <>
                            <p className="text-xl mb-6">الملف جاهز للتحويل: <span className="font-bold text-blue-400">{file.name}</span></p>
                            
                            <div className="my-6">
                                <h3 className="text-lg font-semibold mb-3">اختر صيغة الصورة:</h3>
                                <div className="flex justify-center gap-4">
                                    {(['jpeg', 'png'] as ImageFormat[]).map(format => (
                                        <button 
                                            key={format} 
                                            onClick={() => setImageFormat(format)} 
                                            className={`px-6 py-2 rounded-lg font-semibold uppercase transition-all ${imageFormat === format ? 'bg-purple-600 text-white ring-2 ring-purple-400' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                        >
                                            {format}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="text-center p-4 border-t border-slate-800">
                                <button 
                                    onClick={handleConversion}
                                    className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    تحويل إلى صور
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center">
                            <LoadingSpinner />
                            <p className="text-lg mt-4">{status}</p>
                        </div>
                    )}
                </div>
            )}
            {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
        </div>
    );
};

export default PdfToImage;