import React, { useState } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';
import { ArrowPathIcon, CheckIcon } from '../components/icons';

const SejdaPdfEditor: React.FC = () => {
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [iframeKey, setIframeKey] = useState<number>(0);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

    const handleReload = () => {
        setIsLoading(true);
        setIframeKey(prev => prev + 1);
    };

    return (
        <div className={`space-y-4 animate-fade-in transition-all ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-900 p-4' : 'max-w-7xl mx-auto'}`}>
            
            {/* Header Control Bar */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
                
                {/* Title & Badge */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xl shadow-md shadow-blue-500/20">
                        ✍️
                    </div>
                    <div>
                        <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                            <span>محرر PDF الاحترافي المدمج (Sejda Editor)</span>
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <CheckIcon className="w-3 h-3 stroke-[3]" />
                                <span>يعمل مباشرة داخل الموقع</span>
                            </span>
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">
                            يمكنك الآن تحرير النصوص، إضافة التوقيعات، ومسح وتعديل أي عنصر في المستند دون مغادرة موقعك.
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {/* Reload frame */}
                    <button
                        onClick={handleReload}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                        title="إعادة تحميل المحرر"
                    >
                        <ArrowPathIcon className="w-3.5 h-3.5" />
                        <span>إعادة تحميل</span>
                    </button>

                    {/* Toggle Fullscreen inside site */}
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isFullscreen
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                        title="تكبير المحرر لكامل الشاشة"
                    >
                        <span>{isFullscreen ? 'تصغير الشاشة' : '⛶ ملء الشاشة'}</span>
                    </button>
                </div>
            </div>

            {/* Embedded Frame Container */}
            <div className={`relative bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden transition-all ${
                isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[85vh] min-h-[650px]'
            }`}>
                {/* Loading indicator */}
                {isLoading && (
                    <div className="absolute inset-0 bg-white/95 backdrop-blur-xs flex flex-col items-center justify-center z-20">
                        <LoadingSpinner />
                        <p className="mt-4 text-sm font-bold text-slate-800">جاري فتح وتجهيز محرر المستندات المدمج...</p>
                        <p className="text-xs text-slate-400 mt-1">يتم التحميل مباشرة في موقعك دون أي خروج أو فتح تبويب جديد</p>
                    </div>
                )}

                {/* The Embedded Iframe via Reverse Proxy */}
                <iframe
                    key={iframeKey}
                    src="/sejda-proxy/pdf-editor"
                    title="Sejda PDF Editor"
                    onLoad={() => setIsLoading(false)}
                    className="w-full h-full border-0 block"
                    allow="clipboard-read; clipboard-write"
                />
            </div>
        </div>
    );
};

export default SejdaPdfEditor;
