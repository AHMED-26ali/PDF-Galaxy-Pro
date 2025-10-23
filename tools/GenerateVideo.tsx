
import React, { useState, useEffect, useCallback } from 'react';
import { generateVideo, pollVideoOperation } from '../services/geminiService';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { VideoCameraIcon, ArrowDownTrayIcon, XMarkIcon } from '../components/icons';

// Make aistudio available in the component scope
declare const window: any;

type AspectRatio = '16:9' | '9:16';

const GenerateVideo: React.FC = () => {
    const [apiKeySelected, setApiKeySelected] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

    useEffect(() => {
        const checkKey = async () => {
            if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
                setApiKeySelected(true);
            }
        };
        checkKey();
    }, []);

    const handleSelectKey = async () => {
        if (window.aistudio) {
            await window.aistudio.openSelectKey();
            // Assume success and update UI immediately to avoid race condition
            setApiKeySelected(true);
        }
    };

    const onFileSelected = useCallback((files: File[]) => {
        if (files.length > 0) {
            const file = files[0];
            setImageFile(file);
            setImageUrl(URL.createObjectURL(file));
        }
    }, []);
    
    const handleRemoveImage = () => {
        setImageFile(null);
        setImageUrl(null);
    };

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            setError("يرجى إدخال وصف لإنشاء الفيديو.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedVideoUrl(null);

        try {
            setLoadingMessage('بدء عملية إنشاء الفيديو...');
            let operation = await generateVideo(prompt, imageFile, aspectRatio);

            const messages = [
                'تحضير المشهد الأولي...',
                'معالجة إطارات الفيديو...',
                'هذه العملية قد تستغرق بضع دقائق، يرجى الانتظار...',
                'تطبيق اللمسات النهائية...',
                'اقتربنا من الانتهاء...'
            ];
            let messageIndex = 0;

            while (!operation.done) {
                setLoadingMessage(messages[messageIndex % messages.length]);
                messageIndex++;
                await new Promise(resolve => setTimeout(resolve, 10000));
                operation = await pollVideoOperation(operation);
            }

            const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
            if (downloadLink && process.env.API_KEY) {
                setLoadingMessage('جاري تحميل الفيديو المكتمل...');
                const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
                const blob = await response.blob();
                const videoUrl = URL.createObjectURL(blob);
                setGeneratedVideoUrl(videoUrl);
            } else {
                throw new Error("اكتمل إنشاء الفيديو ولكن لم يتم العثور على رابط التنزيل.");
            }
        } catch (e: any) {
            console.error(e);
            setError(`فشل إنشاء الفيديو: ${e.message || "حدث خطأ غير متوقع."}`);
            if (e.message.includes("API key/project error")) {
                setApiKeySelected(false); // Re-trigger the API key selection UI
            }
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };
    
    if (!apiKeySelected) {
        return (
            <div className="text-center p-8 bg-slate-800/50 rounded-lg max-w-2xl mx-auto">
                <h2 className="text-2xl font-bold text-yellow-400 mb-4">مطلوب إعداد إضافي</h2>
                <p className="text-slate-300 mb-6">
                    تتطلب ميزة إنشاء الفيديو المتقدمة هذه استخدام مفتاح API الخاص بك من مشروع Google Cloud مع تمكين الفوترة.
                </p>
                <button
                    onClick={handleSelectKey}
                    className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    اختر مفتاح API
                </button>
                 <p className="text-sm text-slate-400 mt-4">
                    لمزيد من المعلومات حول الفوترة، يرجى زيارة <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">وثائق الفوترة</a>.
                </p>
            </div>
        );
    }
    
    if (generatedVideoUrl) {
        return (
             <div className="text-center animate-fade-in">
                <h3 className="text-2xl font-semibold mb-4">الفيديو الخاص بك جاهز!</h3>
                <div className="bg-slate-800 p-2 rounded-lg inline-block">
                    <video controls src={generatedVideoUrl} className="max-w-full h-auto rounded-md shadow-lg" style={{ maxHeight: '60vh' }} />
                </div>
                 <div className="mt-6 flex justify-center gap-4">
                    <button onClick={() => setGeneratedVideoUrl(null)} className="bg-slate-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-slate-700 transition-colors">
                        إنشاء فيديو آخر
                    </button>
                    <a 
                        href={generatedVideoUrl} 
                        download={`generated-video-${Date.now()}.mp4`}
                        className="bg-purple-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                    >
                        <ArrowDownTrayIcon className="w-6 h-6" />
                        تنزيل الفيديو
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto">
            <div className="space-y-6">
                <div>
                    <label className="block mb-2 font-semibold text-slate-300">الوصف (Prompt)</label>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="مثال: قطة نيون ثلاثية الأبعاد تقود سيارة بأقصى سرعة..."
                        className="w-full h-24 bg-slate-800 border border-slate-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        disabled={isLoading}
                    />
                </div>
                
                 <div>
                    <label className="block mb-2 font-semibold text-slate-300">صورة بداية (اختياري)</label>
                    {!imageUrl ? (
                       <FileUploader onFilesSelected={onFileSelected} multiple={false} accept="image/*" />
                    ) : (
                        <div className="relative w-48 h-48 bg-slate-800 p-2 rounded-lg">
                           <img src={imageUrl} alt="Start" className="w-full h-full object-cover rounded-md"/>
                           <button onClick={handleRemoveImage} className="absolute top-0 right-0 m-1 p-1 bg-red-600 rounded-full text-white hover:bg-red-500">
                               <XMarkIcon className="w-4 h-4" />
                           </button>
                        </div>
                    )}
                </div>

                <div>
                    <label className="block mb-2 font-semibold text-slate-300">نسبة العرض إلى الارتفاع</label>
                    <div className="flex justify-start gap-4">
                        {(['16:9', '9:16'] as AspectRatio[]).map(ratio => (
                            <button key={ratio} onClick={() => setAspectRatio(ratio)} className={`px-6 py-3 rounded-lg font-semibold transition-all ${aspectRatio === ratio ? 'bg-purple-600 text-white ring-2 ring-purple-400' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                                {ratio} {ratio === '16:9' ? '(أفقي)' : '(عمودي)'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-700 text-center">
                 <button
                    onClick={handleGenerate}
                    disabled={isLoading || !prompt.trim()}
                    className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                    {isLoading ? <LoadingSpinner /> : <VideoCameraIcon className="w-6 h-6" />}
                    <span>{isLoading ? loadingMessage : 'إنشاء الفيديو'}</span>
                </button>
            </div>
            
            {error && <p className="text-red-500 mt-4 text-center p-4 bg-red-900/20 rounded-lg">{error}</p>}
        </div>
    );
};

export default GenerateVideo;