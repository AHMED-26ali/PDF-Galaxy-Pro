import React from 'react';
import { EyeIcon } from '../components/icons';

const AnalyzeImage: React.FC = () => {
    return (
        <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-8 rounded-xl shadow-2xl">
                <EyeIcon className="w-16 h-16 mx-auto mb-4 text-white" />
                <h2 className="text-2xl font-bold text-white mb-4">
                    تحليل الصور بالذكاء الاصطناعي
                </h2>
                <p className="text-purple-100 mb-6">
                    يمكنك استخدام منصة Gemini المتقدمة لتحليل الصور بالذكاء الاصطناعي بدقة عالية.
                </p>
                <a 
                    href="https://gemini.google.com/" 
                    className="inline-block bg-white text-purple-700 font-bold px-6 py-3 rounded-lg hover:bg-purple-100 transition-colors shadow-md"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    الانتقال إلى Gemini ↗
                </a>
            </div>
        </div>
    );
};

export default AnalyzeImage;
