import React from 'react';
import { SparklesIcon } from '../components/icons';

const GenerateImage: React.FC = () => {
    return (
        <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-8 rounded-xl shadow-2xl">
                <SparklesIcon className="w-16 h-16 mx-auto mb-4 text-white" />
                <h2 className="text-2xl font-bold text-white mb-4">
                    إنشاء الصور بالذكاء الاصطناعي
                </h2>
                <p className="text-blue-100 mb-6">
                    يمكنك استخدام منصة Gemini المتقدمة لإنشاء صور فنية وتصميمات مذهلة بالذكاء الاصطناعي.
                </p>
                <a 
                    href="https://gemini.google.com/" 
                    className="inline-block bg-white text-blue-700 font-bold px-6 py-3 rounded-lg hover:bg-blue-100 transition-colors shadow-md"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    الانتقال إلى Gemini ↗
                </a>
            </div>
        </div>
    );
};

export default GenerateImage;
