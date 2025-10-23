
import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';

declare const Tesseract: any;
declare const PDFLib: any;
declare const pdfjsLib: any;
declare const download: any;

const OcrPdf: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            setFile(selectedFiles[0]);
            setError(null);
            setProgress(0);
            setStatus('');
        }
    }, []);

    const handleOcr = async () => {
        if (!file) return;

        setIsLoading(true);
        setError(null);
        setStatus("بدء المعالجة...");

        try {
            const { PDFDocument, rgb } = PDFLib;
            const searchablePdf = await PDFDocument.create();
            
            setStatus("تحميل الخط العربي...");
            // Use a reliable, version-pinned CDN URL to prevent fetching errors.
            const fontUrl = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-arabic@5.0.19/files/noto-sans-arabic-arabic-400-normal.ttf';
            const fontBytes = await fetch(fontUrl).then(res => res.arrayBuffer());
            const customFont = await searchablePdf.embedFont(fontBytes);

            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const numPages = pdfDoc.numPages;

            const worker = await Tesseract.createWorker('ara+eng', 1, {
                logger: (m: any) => {
                    if (m.status === 'recognizing text') {
                        setProgress(Math.round(m.progress * 100));
                    }
                }
            });
            
            for (let i = 1; i <= numPages; i++) {
                setStatus(`تحليل صفحة ${i} من ${numPages}...`);
                const page = await pdfDoc.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                if (!context) continue;

                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvasContext: context, viewport }).promise;
                
                const imageDataUrl = canvas.toDataURL();
                const { data } = await worker.recognize(imageDataUrl);

                const newPage = searchablePdf.addPage([page.view[2], page.view[3]]);
                const imageBytes = await fetch(canvas.toDataURL('image/png')).then(res => res.arrayBuffer());
                const image = await searchablePdf.embedPng(imageBytes);
                newPage.drawImage(image, { x: 0, y: 0, width: newPage.getWidth(), height: newPage.getHeight() });

                data.words.forEach((w: any) => {
                    const { text, bbox } = w;
                    // Sanitize text to remove characters not supported by some environments.
                    const sanitizedText = text.replace(/[\u200e\u200f]/g, '');
                    
                    if (sanitizedText.length > 0) {
                        const x = (bbox.x0 / canvas.width) * newPage.getWidth();
                        const y = newPage.getHeight() - ((bbox.y1 / canvas.height) * newPage.getHeight());
                        const width = ((bbox.x1 - bbox.x0) / canvas.width) * newPage.getWidth();
                        
                        try {
                            newPage.drawText(sanitizedText, {
                                x, y,
                                size: (width / sanitizedText.length) * 1.5,
                                font: customFont,
                                color: rgb(1,1,1),
                                opacity: 0, // Invisible text
                            });
                        } catch (drawError) {
                            console.warn(`Could not draw text "${sanitizedText}" on page ${i}. It might contain unsupported characters.`, drawError);
                        }
                    }
                });
            }

            await worker.terminate();
            setStatus("جارٍ إنشاء الملف النهائي...");
            const pdfBytes = await searchablePdf.save();
            download(pdfBytes, `${file.name.replace('.pdf', '')}_searchable.pdf`, "application/pdf");
            setFile(null);
        } catch (e) {
            console.error(e);
            setError("حدث خطأ أثناء عملية التعرف الضوئي على الحروف.");
        } finally {
            setIsLoading(false);
            setProgress(0);
            setStatus('');
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
                            <p className="text-xl mb-6">الملف جاهز للمسح الضوئي: <span className="font-bold text-blue-400">{file.name}</span></p>
                            <div className="text-center p-4 border-t border-slate-800">
                                <button 
                                    onClick={handleOcr}
                                    className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    بدء المسح الضوئي للنص
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center">
                            <LoadingSpinner />
                            <p className="text-lg mt-4">{status}</p>
                            <div className="w-full bg-slate-700 rounded-full h-2.5 mt-4">
                                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                            </div>
                            <p className="mt-2">{progress}%</p>
                        </div>
                    )}
                </div>
            )}
            {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
        </div>
    );
};

export default OcrPdf;