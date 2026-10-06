import React from 'react';
import { PaintBrushIcon } from '../components/icons';

const EditImage: React.FC = () => {
    return (
        <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-emerald-600 to-blue-600 p-8 rounded-xl shadow-2xl">
                <PaintBrushIcon className="w-16 h-16 mx-auto mb-4 text-white" />
                <h2 className="text-2xl font-bold text-white mb-4">
                    تعديل الصور بالذكاء الاصطناعي
                </h2>
                <p className="text-emerald-100 mb-6">
                    يمكنك استخدام منصة Gemini المتقدمة لتعديل صورك وتطبيق التغييرات المطلوبة بأوامر نصية.
                </p>
                <a 
                    href="https://gemini.google.com/" 
                    className="inline-block bg-white text-emerald-700 font-bold px-6 py-3 rounded-lg hover:bg-emerald-100 transition-colors shadow-md"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    الانتقال إلى Gemini ↗
                </a>
            </div>
        </div>
    );
};

export default EditImage;
