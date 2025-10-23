
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

    const dragClass = isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 hover:border-blue-600';

    return (
        <div 
            className={`w-full p-10 border-2 border-dashed rounded-lg text-center transition-all duration-300 cursor-pointer ${dragClass}`}
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
                <ArrowUpTrayIcon className="w-16 h-16 text-slate-500 mb-4"/>
                <p className="text-xl font-semibold text-white">اسحب وأفلت الملفات هنا</p>
                <p className="text-slate-400 mt-2">أو انقر للاختيار من جهازك</p>
                {multiple && <p className="text-sm text-slate-500 mt-1">(يمكنك تحديد ملفات متعددة)</p>}
            </div>
        </div>
    );
};

export default FileUploader;