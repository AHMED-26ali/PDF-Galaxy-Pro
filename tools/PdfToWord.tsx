import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';

declare const pdfjsLib: any;
declare const download: any;
declare const Tesseract: any;

const createWordDocument = (text: string): string => {
    const paragraphs = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => `<p>${line}</p>`)
        .join('\n');

    return `
<html xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<meta name=ProgId content=Word.Document>
<meta name=Generator content="PDF Galaxy Pro">
<title>Converted Document</title>
<style>
<!--
@page WordSection1 {
    size: 8.5in 11.0in;
    margin: 1.0in;
}
div.WordSection1 {
    page: WordSection1;
}
body {
    direction: rtl;
    font-family: "Arial", sans-serif;
    font-size: 12pt;
}
p {
    margin: 0 0 10pt 0;
    line-height: 1.6;
}
-->
</style>
</head>
<body lang="AR-SA">
<div class="WordSection1">
${paragraphs}
</div>
</body>
</html>
`;
};

const PdfToWord: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [needsOcr, setNeedsOcr] = useState(false);
    const [ocrProgress, setOcrProgress] = useState(0);

    const resetState = () => {
        setFile(null);
        setIsLoading(false);
        setStatus('');
        setError(null);
        setNeedsOcr(false);
        setOcrProgress(0);
    };

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            resetState();
            setFile(selectedFiles[0]);
        }
    }, []);

    const processConversion = async (text: string) => {
        try {
            if (!text.trim()) {
                setError("لم يتم العثور على نص حتى بعد عملية المسح الضوئي.");
                setIsLoading(false);
                setStatus('');
                return;
            }

            setStatus("جاري إنشاء مستند Word...");
            setOcrProgress(0); // Hide progress bar
            const htmlContent = createWordDocument(text);

            const blob = new Blob([htmlContent], { type: 'application/msword;charset=utf-8' });
            download(blob, `${file!.name.replace('.pdf', '')}.doc`, 'application/msword');
            resetState();
        } catch (e: any) {
            console.error(e);
            setError(e.message || "فشل التحويل: حدث خطأ غير متوقع.");
            setIsLoading(false);
            setStatus('');
        }
    };
    
    const runOcrAndConvert = async () => {
        if (!file) return;

        setNeedsOcr(false);
        setIsLoading(true);
        setError(null);
        setStatus('تحضير عملية المسح الضوئي...');
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const numPages = pdfDoc.numPages;
            let fullText = '';

            const worker = await Tesseract.createWorker('ara+eng', 1, {
                logger: (m: any) => {
                    if (m.status === 'recognizing text') {
                         setOcrProgress(Math.round(m.progress * 100));
                    }
                }
            });

            for (let i = 1; i <= numPages; i++) {
                setStatus(`جاري مسح صفحة ${i} من ${numPages}...`);
                const page = await pdfDoc.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                if (!context) continue;

                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvasContext: context, viewport }).promise;
                
                const { data } = await worker.recognize(canvas);
                fullText += data.text + '\n\n';
            }
            await worker.terminate();
            
            await processConversion(fullText);

        } catch (e: any) {
             console.error(e);
             setError(e.message || "فشلت عملية المسح الضوئي أو التحويل.");
             setIsLoading(false);
             setStatus('');
        }
    };

    const handleInitialCheck = async () => {
        if (!file) return;
        setIsLoading(true);
        setError(null);
        setNeedsOcr(false);

        try {
            setStatus("جاري استخراج النص من ملف PDF...");
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                if (textContent.items.length === 0) continue;
                const pageText = textContent.items.map((item: any) => item.str).join(' ');
                fullText += pageText + '\n\n';
            }

            if (!fullText.trim()) {
                setNeedsOcr(true);
                setIsLoading(false);
                setStatus('');
            } else {
                await processConversion(fullText);
            }

        } catch (e: any) {
            console.error(e);
            setError(e.message || "فشل التحويل: حدث خطأ غير متوقع.");
            setIsLoading(false);
            setStatus('');
        }
    };
    
    const renderContent = () => {
        if (isLoading) {
            return (
                 <div className="flex flex-col items-center">
                    <LoadingSpinner />
                    <p className="text-lg mt-4">{status}</p>
                    {ocrProgress > 0 && (
                        <div className="w-full bg-slate-700 rounded-full h-2.5 mt-4 max-w-md mx-auto">
                            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${ocrProgress}%` }}></div>
                            <p className="text-sm text-slate-300 mt-1">{ocrProgress}%</p>
                        </div>
                    )}
                </div>
            )
        }
        
        if (needsOcr) {
            return (
                <div className="text-center p-8 bg-blue-50/70 border border-blue-200 rounded-3xl">
                    <h3 className="text-xl font-bold text-blue-900 mb-3">لم يتم العثور على نصوص عادية</h3>
                    <p className="text-slate-600 mb-6 max-w-lg mx-auto leading-relaxed text-sm">
                        يبدو أن ملف PDF هذا عبارة عن صورة ممسوحة ضوئيًا. هل ترغب في استخدام تقنية التعرف الضوئي على الحروف (OCR) لاستخراج النص وتحويله؟
                    </p>
                    <div className="flex justify-center gap-4">
                         <button onClick={resetState} className="bg-white text-slate-700 font-bold py-2.5 px-6 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">إلغاء</button>
                        <button onClick={runOcrAndConvert} className="bg-blue-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-colors">بدء المسح الضوئي والتحويل</button>
                    </div>
                </div>
            )
        }

        return (
            <div className="space-y-6">
                <p className="text-lg font-bold text-slate-800">الملف جاهز للتحويل: <span className="text-blue-600 underline">{file!.name}</span></p>
                <div className="text-center pt-4 border-t border-slate-100">
                    <button 
                        onClick={handleInitialCheck}
                        className="bg-blue-600 text-white font-bold py-3.5 px-10 rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all text-base"
                    >
                        تحويل وتحميل مستند Word الآن
                    </button>
                </div>
            </div>
        )
    };

    return (
        <div>
            {!file ? (
                <FileUploader onFilesSelected={onFilesSelected} multiple={false} accept=".pdf" />
            ) : (
                <div className="text-center">
                    {renderContent()}
                </div>
            )}
            {error && <p className="text-red-600 mt-4 text-center p-3 bg-red-50 border border-red-200 rounded-xl font-medium">{error}</p>}
        </div>
    );
};

export default PdfToWord;
