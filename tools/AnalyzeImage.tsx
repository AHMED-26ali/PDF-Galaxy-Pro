
import React, { useState, useCallback } from 'react';
import { analyzeImage } from '../services/geminiService';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { MagnifyingGlassIcon } from '../components/icons';

const AnalyzeImage: React.FC = () => {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [prompt, setPrompt] = useState('صف هذه الصورة بالتفصيل.');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<string | null>(null);

    const onFileSelected = useCallback((files: File[]) => {
        if (files.length > 0) {
            const file = files[0];
            setImageFile(file);
            setImageUrl(URL.createObjectURL(file));
            setError(null);
            setAnalysisResult(null);
        }
    }, []);

    const handleAnalyze = async () => {
        if (!prompt.trim() || !imageFile) {
            setError("يرجى تحميل صورة وإدخال سؤال أو طلب.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setAnalysisResult(null);

        try {
            const result = await analyzeImage(prompt, imageFile);
            setAnalysisResult(result);
        } catch (e: any) {
            console.error(e);
            setError(`فشل تحليل الصورة: ${e.message || "حدث خطأ غير متوقع."}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            {!imageFile ? (
                <FileUploader onFilesSelected={onFileSelected} multiple={false} accept="image/*" />
            ) : (
                <div className="animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        <div className="text-center">
                            <div className="bg-slate-800 p-2 rounded-lg">
                                <img 
                                    src={imageUrl || ''} 
                                    alt="Image for analysis" 
                                    className="max-w-full h-auto rounded-md shadow-lg"
                                />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-xl font-semibold">ماذا تريد أن تعرف عن هذه الصورة؟</h3>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="اسأل أي شيء عن الصورة..."
                                className="w-full h-24 bg-slate-800 border border-slate-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                disabled={isLoading}
                            />
                            <button
                                onClick={handleAnalyze}
                                disabled={isLoading || !prompt.trim()}
                                className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                {isLoading ? <LoadingSpinner /> : <MagnifyingGlassIcon className="w-6 h-6" />}
                                <span>{isLoading ? 'جاري التحليل...' : 'تحليل الصورة'}</span>
                            </button>
                             <div className="text-center mt-2">
                                <button onClick={() => { setImageFile(null); setImageUrl(null); }} className="text-sm text-slate-400 hover:text-white hover:underline">
                                    تغيير الصورة
                                </button>
                            </div>
                        </div>
                    </div>
                     {error && <p className="text-red-500 mt-4 text-center p-4 bg-red-900/20 rounded-lg">{error}</p>}

                    {analysisResult && (
                        <div className="mt-8 pt-6 border-t border-slate-800 animate-fade-in">
                             <h3 className="text-2xl font-bold text-white mb-4">نتائج التحليل:</h3>
                             <div className="bg-slate-800/50 rounded-lg p-6 whitespace-pre-wrap text-slate-300 leading-relaxed">
                                {analysisResult}
                             </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AnalyzeImage;