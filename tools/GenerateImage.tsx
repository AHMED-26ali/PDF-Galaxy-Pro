
import React, { useState } from 'react';
import { generateImage } from '../services/geminiService';
import LoadingSpinner from '../components/LoadingSpinner';
import { SparklesIcon, ArrowDownTrayIcon } from '../components/icons';

const GenerateImage: React.FC = () => {
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            setError("يرجى إدخال وصف لإنشاء الصورة.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedImageUrl(null);

        try {
            const imageUrl = await generateImage(prompt);
            setGeneratedImageUrl(imageUrl);
        } catch (e: any) {
            console.error(e);
            setError(`فشل إنشاء الصورة: ${e.message || "حدث خطأ غير متوقع."}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto">
            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="مثال: رائد فضاء يركب حصانًا مجريًا على سطح المريخ، فن رقمي..."
                    className="w-full h-24 bg-slate-800 border border-slate-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    disabled={isLoading}
                />
                <button
                    onClick={handleGenerate}
                    disabled={isLoading || !prompt.trim()}
                    className="bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                    {isLoading ? <LoadingSpinner /> : <SparklesIcon className="w-6 h-6" />}
                    <span>{isLoading ? 'جاري الإنشاء...' : 'إنشاء'}</span>
                </button>
            </div>
            
            {error && <p className="text-red-500 mt-4 text-center p-4 bg-red-900/20 rounded-lg">{error}</p>}

            {isLoading && (
                 <div className="text-center p-6 bg-slate-800/50 rounded-lg">
                    <p className="text-lg text-slate-300">يتم الآن إنشاء صورتك... قد تستغرق هذه العملية دقيقة أو دقيقتين.</p>
                </div>
            )}
            
            {generatedImageUrl && (
                <div className="mt-6 animate-fade-in text-center">
                    <h3 className="text-xl font-semibold mb-4">الصورة التي تم إنشاؤها:</h3>
                    <div className="bg-slate-800 p-2 rounded-lg inline-block">
                        <img src={generatedImageUrl} alt="Generated art" className="max-w-full h-auto rounded-md shadow-lg" style={{ maxHeight: '60vh' }}/>
                    </div>
                     <div className="mt-6">
                        <a 
                            href={generatedImageUrl} 
                            download={`generated-image-${Date.now()}.jpg`}
                            className="bg-purple-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center mx-auto gap-2 w-fit"
                        >
                            <ArrowDownTrayIcon className="w-6 h-6" />
                            تنزيل الصورة
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GenerateImage;