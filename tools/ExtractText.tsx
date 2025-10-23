
import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { ArrowDownTrayIcon, ClipboardIcon, CheckIcon } from '../components/icons';

// Make libraries available
declare const pdfjsLib: any;
declare const Tesseract: any;
declare const download: any;

const ExtractText: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [extractedText, setExtractedText] = useState<string | null>(null);
    const [ocrProgress, setOcrProgress] = useState(0);
    const [copied, setCopied] = useState(false);

    const resetState = useCallback(() => {
        setFile(null);
        setIsLoading(false);
        setStatus('');
        setError(null);
        setExtractedText(null);
        setOcrProgress(0);
        setCopied(false);
    }, []);

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            resetState();
            setFile(selectedFiles[0]);
        }
    }, [resetState]);

    const runOcr = async (pdfDoc: any) => {
        setStatus('لم يتم العثور على نص، جاري بدء المسح الضوئي...');
        let fullText = '';
        const numPages = pdfDoc.numPages;

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
        return fullText;
    };

    const handleExtract = async () => {
        if (!file) return;
        setIsLoading(true);
        setError(null);
        setExtractedText(null);

        try {
            setStatus("جاري استخراج النص...");
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            let fullText = '';

            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(' ');
                fullText += pageText + '\n\n';
            }

            if (!fullText.trim()) {
                fullText = await runOcr(pdfDoc);
            }

            if (!fullText.trim()) {
                 setError("تعذر استخراج أي نص من هذا الملف.");
            } else {
                setExtractedText(fullText);
            }

        } catch (e: any) {
            console.error(e);
            setError(`فشل استخراج النص: ${e.message || "حدث خطأ غير متوقع."}`);
        } finally {
            setIsLoading(false);
            setStatus('');
            setOcrProgress(0);
        }
    };
    
    const handleDownload = () => {
        if (!extractedText || !file) return;
        const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
        download(blob, `${file.name.replace('.pdf', '')}.txt`, 'text/plain');
    };

    const handleCopy = () => {
        if (!extractedText) return;
        navigator.clipboard.writeText(extractedText).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    if (extractedText !== null) {
        return (
            <div className="animate-fade-in">
                <h3 className="text-xl font-semibold mb-4">النص المستخرج:</h3>
                <textarea 
                    readOnly 
                    value={extractedText}
                    className="w-full h-96 bg-slate-800 border border-slate-700 rounded-md p-4 text-white font-mono text-sm leading-relaxed"
                />
                <div className="flex justify-center gap-4 mt-6">
                    <button onClick={resetState} className="bg-slate-700 text-white font-bold py-2 px-6 rounded-lg hover:bg-slate-600 transition-colors">
                        استخراج ملف آخر
                    </button>
                    <button
                        onClick={handleCopy}
                        className="bg-purple-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                    >
                        {copied ? <CheckIcon className="w-5 h-5" /> : <ClipboardIcon className="w-5 h-5" />}
                        {copied ? 'تم النسخ!' : 'نسخ النص'}
                    </button>
                    <button 
                        onClick={handleDownload}
                        className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                        <ArrowDownTrayIcon className="w-5 h-5" />
                        تنزيل كملف TXT
                    </button>
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
                    {isLoading ? (
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
                    ) : (
                         <>
                            <p className="text-xl mb-6">الملف جاهز للاستخراج: <span className="font-bold text-blue-400">{file.name}</span></p>
                            <div className="text-center p-4 border-t border-slate-800">
                                <button 
                                    onClick={handleExtract}
                                    className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    استخراج النص
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
            {error && <p className="text-red-500 mt-4 text-center p-4 bg-red-900/20 rounded-lg">{error}</p>}
        </div>
    );
};

export default ExtractText;