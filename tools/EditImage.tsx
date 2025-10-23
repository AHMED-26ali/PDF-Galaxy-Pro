import React, { useEffect } from 'react';
import { PaintBrushIcon } from '../components/icons';

const EditImage: React.FC = () => {
    useEffect(() => {
        // التحويل المباشر إلى Gemini
        window.location.href = 'https://gemini.google.com/';
    }, []);

    return (
        <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-green-600 to-blue-600 p-8 rounded-xl shadow-2xl">
                <PaintBrushIcon className="w-16 h-16 mx-auto mb-4 text-white" />
                <h2 className="text-2xl font-bold text-white mb-4">
                    جاري التحويل إلى Gemini...
                </h2>
                <p className="text-green-100 mb-6">
                    سيتم تحويلك الآن إلى منصة Gemini لتعديل الصور بالذكاء الاصطناعي
                </p>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
                <p className="text-sm text-green-200 mt-4">
                    إذا لم يتم التحويل تلقائياً، 
                    <a 
                        href="https://gemini.google.com/" 
                        className="underline hover:text-white ml-1"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        اضغط هنا
                    </a>
                </p>
            </div>
        </div>
    );
};

export default EditImage;