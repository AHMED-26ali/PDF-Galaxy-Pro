
import React, { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';

declare const PDFLib: any;
declare const download: any;

type WatermarkType = 'text' | 'image';

const AddWatermarkPdf: React.FC = () => {
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [watermarkType, setWatermarkType] = useState<WatermarkType>('text');
    
    // Text options
    const [text, setText] = useState('سري للغاية');
    const [textColor, setTextColor] = useState('#ff0000');
    const [textOpacity, setTextOpacity] = useState(0.5);
    const [textSize, setTextSize] = useState(50);
    
    // Image options
    const [imageOpacity, setImageOpacity] = useState(0.5);

    const onPdfSelected = useCallback((files: File[]) => {
        if (files.length > 0) {
            setPdfFile(files[0]);
            setError(null);
        }
    }, []);
    
    const onImageSelected = useCallback((files: File[]) => {
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            setImageFile(files[0]);
            setError(null);
        } else {
            setError('يرجى تحديد ملف صورة صالح (PNG, JPG).');
        }
    }, []);

    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? {
                r: parseInt(result[1], 16) / 255,
                g: parseInt(result[2], 16) / 255,
                b: parseInt(result[3], 16) / 255,
            }
            : { r: 0, g: 0, b: 0 };
    };

    const handleAddWatermark = async () => {
        if (!pdfFile) return;
        if (watermarkType === 'image' && !imageFile) {
            setError("يرجى تحميل صورة للعلامة المائية.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const { PDFDocument, rgb, StandardFonts, degrees } = PDFLib;
            const arrayBuffer = await pdfFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const pages = pdfDoc.getPages();
            
            if (watermarkType === 'text') {
                const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
                const rgbColor = hexToRgb(textColor);
                
                for (const page of pages) {
                    const { width, height } = page.getSize();
                    const textWidth = font.widthOfTextAtSize(text, textSize);
                    page.drawText(text, {
                        x: (width - textWidth) / 2,
                        y: height / 2,
                        font,
                        size: textSize,
                        color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
                        opacity: textOpacity,
                        rotate: degrees(45),
                    });
                }
            } else if (watermarkType === 'image' && imageFile) {
                const imageBytes = await imageFile.arrayBuffer();
                const image = imageFile.type === 'image/png'
                    ? await pdfDoc.embedPng(imageBytes)
                    : await pdfDoc.embedJpg(imageBytes);

                for (const page of pages) {
                    const { width, height } = page.getSize();
                    const imageDims = image.scale(0.5); // Scale image to 50% of its original size
                    page.drawImage(image, {
                        x: (width - imageDims.width) / 2,
                        y: (height - imageDims.height) / 2,
                        width: imageDims.width,
                        height: imageDims.height,
                        opacity: imageOpacity,
                    });
                }
            }

            const pdfBytes = await pdfDoc.save();
            download(pdfBytes, `${pdfFile.name.replace('.pdf', '')}_watermarked.pdf`, "application/pdf");
            setPdfFile(null);
            setImageFile(null);

        } catch (e) {
            console.error(e);
            setError("حدث خطأ أثناء إضافة العلامة المائية.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const renderOptions = () => (
        <div className="space-y-6">
            <p className="text-xl text-center">الملف جاهز: <span className="font-bold text-blue-400">{pdfFile?.name}</span></p>
            
            {/* Watermark Type Switcher */}
            <div className="flex justify-center bg-slate-800 p-1 rounded-lg">
                <button onClick={() => setWatermarkType('text')} className={`w-full py-2 rounded-md transition-colors ${watermarkType === 'text' ? 'bg-blue-600 text-white' : 'hover:bg-slate-700'}`}>علامة مائية نصية</button>
                <button onClick={() => setWatermarkType('image')} className={`w-full py-2 rounded-md transition-colors ${watermarkType === 'image' ? 'bg-blue-600 text-white' : 'hover:bg-slate-700'}`}>علامة مائية بالصورة</button>
            </div>

            {/* Options Panels */}
            {watermarkType === 'text' ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-800/50 rounded-lg">
                    <div>
                        <label htmlFor="watermarkText" className="block mb-2 font-semibold text-slate-300">نص العلامة المائية</label>
                        <input type="text" id="watermarkText" value={text} onChange={e => setText(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                    </div>
                     <div>
                        <label htmlFor="textColor" className="block mb-2 font-semibold text-slate-300">اللون</label>
                        <input type="color" id="textColor" value={textColor} onChange={e => setTextColor(e.target.value)} className="w-full h-10 p-1 bg-slate-700 border border-slate-600 rounded-md cursor-pointer"/>
                    </div>
                     <div>
                        <label htmlFor="textSize" className="block mb-2 font-semibold text-slate-300">حجم الخط ({textSize})</label>
                        <input type="range" id="textSize" min="10" max="150" value={textSize} onChange={e => setTextSize(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
                    </div>
                     <div>
                        <label htmlFor="textOpacity" className="block mb-2 font-semibold text-slate-300">الشفافية ({Math.round(textOpacity * 100)}%)</label>
                        <input type="range" id="textOpacity" min="0" max="1" step="0.1" value={textOpacity} onChange={e => setTextOpacity(parseFloat(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
                    </div>
                </div>
            ) : (
                 <div className="p-4 bg-slate-800/50 rounded-lg">
                    { !imageFile ? (
                        <FileUploader onFilesSelected={onImageSelected} multiple={false} accept="image/png, image/jpeg" />
                    ) : (
                        <div className="text-center">
                             <p className="mb-4">الصورة المحددة: <span className="font-bold text-blue-400">{imageFile.name}</span></p>
                            <img src={URL.createObjectURL(imageFile)} alt="Watermark preview" className="max-h-32 mx-auto rounded-md mb-4"/>
                            <div>
                                <label htmlFor="imageOpacity" className="block mb-2 font-semibold text-slate-300">الشفافية ({Math.round(imageOpacity * 100)}%)</label>
                                <input type="range" id="imageOpacity" min="0" max="1" step="0.1" value={imageOpacity} onChange={e => setImageOpacity(parseFloat(e.target.value))} className="w-full max-w-sm mx-auto h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
                            </div>
                            <button onClick={() => setImageFile(null)} className="mt-4 text-sm text-red-400 hover:underline">تغيير الصورة</button>
                        </div>
                    )}
                </div>
            )}
            
            <div className="text-center p-4 border-t border-slate-800">
                <button 
                    onClick={handleAddWatermark}
                    disabled={isLoading}
                    className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 disabled:bg-slate-600 transition-colors flex items-center justify-center mx-auto"
                >
                    {isLoading ? <LoadingSpinner/> : 'إضافة العلامة المائية'}
                </button>
            </div>
        </div>
    );

    return (
        <div>
            {!pdfFile ? (
                <FileUploader onFilesSelected={onPdfSelected} multiple={false} accept=".pdf" />
            ) : (
                renderOptions()
            )}
            {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
        </div>
    );
};

export default AddWatermarkPdf;