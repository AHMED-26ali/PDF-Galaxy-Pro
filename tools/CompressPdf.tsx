
import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { ArrowDownTrayIcon } from '../components/icons';

declare const PDFLib: any;
declare const pdfjsLib: any;
declare const download: any;

type CompressionLevel = 'low' | 'medium' | 'high';

const CompressPdf: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [compressionLevel, setCompressionLevel] = useState<CompressionLevel>('medium');
    const [showWarning, setShowWarning] = useState(false);
    const [result, setResult] = useState<{ originalSize: number, newSize: number, newFile: Uint8Array } | null>(null);

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            setFile(selectedFiles[0]);
            setShowWarning(true);
            setError(null);
            setResult(null);
        }
    }, []);

    const handleCompression = async () => {
        if (!file) return;
        
        setIsLoading(true);
        setError(null);
        setResult(null);

        const qualityMap = {
            low: 0.92, // Higher quality, larger size
            medium: 0.75, // Good balance
            high: 0.5, // Lower quality, smaller size
        };
        const scale = 1.5; // Render at 1.5x resolution then compress
        const jpegQuality = qualityMap[compressionLevel];

        try {
            const { PDFDocument, rgb } = PDFLib;
            const newPdfDoc = await PDFDocument.create();
            
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                await page.render({ canvasContext: context, viewport }).promise;

                const imageDataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
                const imageBytes = await fetch(imageDataUrl).then(res => res.arrayBuffer());
                const image = await newPdfDoc.embedJpg(imageBytes);

                const newPage = newPdfDoc.addPage([page.view[2], page.view[3]]);
                newPage.drawImage(image, {
                    x: 0,
                    y: 0,
                    width: newPage.getWidth(),
                    height: newPage.getHeight(),
                });
            }

            const pdfBytes = await newPdfDoc.save();
            setResult({
                originalSize: file.size,
                newSize: pdfBytes.length,
                newFile: pdfBytes
            });

        } catch (e) {
            console.error(e);
            setError("حدث خطأ أثناء ضغط الملف. قد يكون الملف معقدًا جدًا.");
        } finally {
            setIsLoading(false);
        }
    };
    
    if (result) {
        const reduction = (((result.originalSize - result.newSize) / result.originalSize) * 100).toFixed(2);
        return (
             <div className="text-center animate-fade-in">
                <h2 className="text-2xl font-bold text-green-400 mb-4">تم الضغط بنجاح!</h2>
                <div className="flex justify-center gap-8 text-lg">
                    <p>الحجم الأصلي: <span className="font-mono text-blue-400">{(result.originalSize / 1024 / 1024).toFixed(2)} MB</span></p>
                    <p>الحجم الجديد: <span className="font-mono text-purple-400">{(result.newSize / 1024 / 1024).toFixed(2)} MB</span></p>
                    <p>نسبة التخفيض: <span className="font-mono text-green-400">{reduction}%</span></p>
                </div>
                 <div className="mt-8">
                    <button 
                        onClick={() => download(result.newFile, `${file?.name.replace('.pdf', '')}_compressed.pdf`, "application/pdf")}
                        className="bg-purple-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center mx-auto gap-2"
                    >
                        <ArrowDownTrayIcon className="w-6 h-6" />
                        تنزيل الملف المضغوط
                    </button>
                 </div>
            </div>
        )
    }

    if (showWarning && file) {
         return (
             <div className="text-center animate-fade-in">
                 <h2 className="text-2xl font-bold text-yellow-400 mb-4">تحذير مهم!</h2>
                 <p className="text-slate-300 max-w-2xl mx-auto mb-6">
                     عملية الضغط ستقوم بتحويل صفحات PDF إلى صور. هذا يعني أن أي نص في المستند لن يكون قابلاً للنسخ أو البحث بعد الآن. هل أنت متأكد أنك تريد المتابعة؟
                 </p>
                <div className="flex justify-center gap-4">
                     <button onClick={() => { setFile(null); setShowWarning(false); }} className="bg-slate-700 text-white font-bold py-2 px-6 rounded-lg hover:bg-slate-600 transition-colors">إلغاء</button>
                    <button onClick={() => setShowWarning(false)} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">نعم، متابعة</button>
                 </div>
            </div>
         );
    }
    
    return (
        <div>
            {!file ? (
                <FileUploader onFilesSelected={onFilesSelected} multiple={false} accept=".pdf" />
            ) : (
                <div className="text-center">
                    <p className="text-xl mb-4">الملف جاهز للضغط: <span className="font-bold text-blue-400">{file.name}</span></p>
                    <div className="my-6">
                        <h3 className="text-lg font-semibold mb-3">اختر مستوى الضغط:</h3>
                        <div className="flex justify-center gap-4">
                            {(['low', 'medium', 'high'] as CompressionLevel[]).map(level => (
                                <button key={level} onClick={() => setCompressionLevel(level)} className={`px-6 py-2 rounded-lg font-semibold transition-all ${compressionLevel === level ? 'bg-purple-600 text-white ring-2 ring-purple-400' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                                    {level === 'low' ? 'منخفض' : level === 'medium' ? 'متوسط' : 'عالي'}
                                </button>
                            ))}
                        </div>
                    </div>
                     <div className="text-center p-4 border-t border-slate-800">
                        <button 
                            onClick={handleCompression}
                            disabled={isLoading}
                            className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 disabled:bg-slate-600 transition-colors flex items-center justify-center mx-auto"
                        >
                            {isLoading ? <LoadingSpinner/> : 'ضغط الملف'}
                        </button>
                    </div>
                </div>
            )}
            {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
        </div>
    );
};

export default CompressPdf;