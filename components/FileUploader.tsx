import React, { useState, DragEvent, ChangeEvent, useRef } from 'react';
import { ArrowUpTrayIcon } from './icons';

interface FileUploaderProps {
    onFilesSelected: (files: File[]) => void;
    multiple?: boolean;
    accept?: string;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFilesSelected, multiple = false, accept = ".pdf" }) => {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files && files.length > 0) {
            onFilesSelected(files);
        }
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files && files.length > 0) {
            onFilesSelected(files);
        }
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const dragClass = isDragging 
        ? 'border-blue-500 bg-blue-100/60 scale-[1.01]' 
        : 'border-blue-200 hover:border-blue-500 bg-blue-50/30 hover:bg-blue-50/70';

    return (
        <div 
            className={`w-full p-10 sm:p-14 border-2 border-dashed rounded-3xl text-center transition-all duration-200 cursor-pointer ${dragClass} group`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <input 
                ref={fileInputRef}
                type="file" 
                className="hidden" 
                multiple={multiple}
                accept={accept}
                onChange={handleFileChange}
            />
            <div className="flex flex-col items-center">
                <div className="w-18 h-18 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white mb-5 shadow-lg shadow-blue-500/25 group-hover:scale-110 transition-transform duration-200">
                    <ArrowUpTrayIcon className="w-9 h-9"/>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-800 mb-2">
                    اسحب وأفلت الملفات هنا
                </h3>
                <p className="text-sm sm:text-base text-slate-500 mb-4 font-medium">
                    أو <span className="text-blue-600 font-bold underline underline-offset-4">اختر الملفات من جهازك</span>
                </p>
                <div className="inline-flex items-center gap-2 text-xs text-blue-700 bg-blue-100/80 px-3.5 py-1.5 rounded-full font-bold">
                    <span>الصيغ المقبولة:</span>
                    <span className="font-mono">{accept}</span>
                    {multiple && <span>· يدعم تحديد عدة ملفات</span>}
                </div>
            </div>
        </div>
    );
};

export default FileUploader;
