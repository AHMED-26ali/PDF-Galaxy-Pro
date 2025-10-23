
import React, { useState, useCallback } from 'react';
import { editImage } from '../services/geminiService';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { PaintBrushIcon, ArrowDownTrayIcon } from '../components/icons';

const EditImage: React.FC = () => {
    const [originalFile, setOriginalFile] = useState<File | null>(null);
    const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
    const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resetState = useCallback(() => {
        setOriginalFile(null);
        setOriginalImageUrl(null);
        setEditedImageUrl(null);
        setPrompt('');
        setIsLoading(false);
        setError(null);
    }, []);

    const onFileSelected = useCallback((files: File[]) => {
        if (files.length > 0) {
            const file = files[0];
            setOriginalFile(file);
            setOriginalImageUrl(URL.createObjectURL(file));
            setEditedImageUrl(null);
            setError(null);
        }
    }, []);

    const handleEdit = async () => {
        if (!prompt.trim() || !originalFile) {
            setError("يرجى تحميل صورة وإدخال وصف للتعديل.");
            return;
        }
        setIsLoading(true);
        setError(null);
        
        try {
            const imageUrl = await editImage(prompt, originalFile);
            setEditedImageUrl(imageUrl);
        } catch (e: any) {
            console.error(e);
            setError(e.message || "فشل تعديل الصورة: حدث خطأ غير متوقع.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            {!originalFile ? (
                <FileUploader onFilesSelected={onFileSelected} multiple={false} accept="image/*" />
            ) : (
                <div className="animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        <div className="text-center">
                            <h3 className="text-lg font-semibold mb-2 text-slate-400">
                                {editedImageUrl ? 'الصورة المعدلة' : 'الصورة الأصلية'}
                            </h3>
                            <div className="bg-slate-800 p-2 rounded-lg">
                                <img 
                                    src={editedImageUrl || originalImageUrl || ''} 
                                    alt="Image for editing" 
                                    className="max-w-full h-auto rounded-md shadow-lg"
                                />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-xl font-semibold">أخبرنا كيف نعدل الصورة:</h3>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="مثال: أضف فلترًا كلاسيكيًا، اجعل الخلفية ضبابية..."
                                className="w-full h-24 bg-slate-800 border border-slate-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                disabled={isLoading}
                            />
                            <button
                                onClick={handleEdit}
                                disabled={isLoading || !prompt.trim()}
                                className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                {isLoading ? <LoadingSpinner /> : <PaintBrushIcon className="w-6 h-6" />}
                                <span>{isLoading ? 'جاري التعديل...' : 'تطبيق التعديل'}</span>
                            </button>
                            {editedImageUrl && (
                                <a 
                                    href={editedImageUrl} 
                                    download={`edited-image-${Date.now()}.png`}
                                    className="w-full bg-purple-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <ArrowDownTrayIcon className="w-6 h-6" />
                                    تنزيل الصورة المعدلة
                                </a>
                            )}
                        </div>
                    </div>
                     <div className="text-center mt-6">
                        <button onClick={resetState} className="text-sm text-slate-400 hover:text-white hover:underline">
                            البدء من جديد بصورة أخرى
                        </button>
                    </div>
                </div>
            )}
             {error && <p className="text-red-500 mt-4 text-center p-4 bg-red-900/20 rounded-lg">{error}</p>}
        </div>
    );
};

export default EditImage;
