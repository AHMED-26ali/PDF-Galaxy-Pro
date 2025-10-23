
import React, { useState, useCallback, ReactNode } from 'react';
import FileUploader from '../components/FileUploader';
import LoadingSpinner from '../components/LoadingSpinner';
import { LockClosedIcon, EyeSlashIcon, QuestionMarkCircleIcon } from '../components/icons';

declare const PDFLib: any;
declare const download: any;

type ProtectionType = 'encrypt' | 'redact';

const calculatePasswordStrength = (password: string) => {
    let score = 0;
    if (!password) return { score: 0, label: '', color: 'bg-slate-700' };

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    switch (score) {
        case 0:
        case 1:
            return { score: 1, label: 'ضعيفة جداً', color: 'bg-red-500' };
        case 2:
            return { score: 2, label: 'ضعيفة', color: 'bg-orange-500' };
        case 3:
            return { score: 3, label: 'متوسطة', color: 'bg-yellow-500' };
        case 4:
            return { score: 4, label: 'قوية', color: 'bg-green-500' };
        case 5:
            return { score: 5, label: 'قوية جداً', color: 'bg-emerald-500' };
        default:
            return { score: 0, label: '', color: 'bg-slate-700' };
    }
};

const PasswordStrengthMeter: React.FC<{ password?: string }> = ({ password = '' }) => {
    const { score, label, color } = calculatePasswordStrength(password);
    if (!password) return null;

    return (
        <div className="mt-2">
            <div className="flex gap-1.5">
                {Array.from({ length: 5 }).map((_, index) => (
                    <div
                        key={index}
                        className={`h-1.5 flex-1 rounded-full ${index < score ? color : 'bg-slate-600'}`}
                    />
                ))}
            </div>
            <p className="text-xs mt-1 text-right" style={{ color: color.replace('bg-', '') }}>{label}</p>
        </div>
    );
};

const Tooltip: React.FC<{ text: string; children: ReactNode }> = ({ text, children }) => {
    return (
        <div className="relative flex items-center group">
            {children}
            <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 bg-slate-800 text-white text-xs rounded-lg p-2 shadow-lg z-10 border border-slate-700">
                {text}
            </div>
        </div>
    );
};


const ProtectPdf: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // State for protection options
    const [protectionType, setProtectionType] = useState<ProtectionType>('encrypt');
    const [userPassword, setUserPassword] = useState('');
    const [confirmUserPassword, setConfirmUserPassword] = useState('');
    const [ownerPassword, setOwnerPassword] = useState('');
    const [allowPrinting, setAllowPrinting] = useState(true);
    const [allowCopying, setAllowCopying] = useState(true);
    const [allowModifying, setAllowModifying] = useState(true);
    const [allowAnnotating, setAllowAnnotating] = useState(true);

    const onFilesSelected = useCallback((selectedFiles: File[]) => {
        if (selectedFiles.length > 0) {
            setFile(selectedFiles[0]);
            // Reset options to default
            setError(null);
            setUserPassword('');
            setConfirmUserPassword('');
            setOwnerPassword('');
            setProtectionType('encrypt');
            setAllowPrinting(true);
            setAllowCopying(true);
            setAllowModifying(true);
            setAllowAnnotating(true);
        }
    }, []);

    const handleProtect = async () => {
        if (!file) return;

        if (protectionType === 'encrypt') {
            if (!userPassword) {
                setError("يرجى إدخال كلمة مرور المستخدم.");
                return;
            }
            if (userPassword !== confirmUserPassword) {
                setError("كلمتا مرور المستخدم غير متطابقتين.");
                return;
            }
        }

        if (protectionType === 'redact') {
            if (!window.confirm("تحذير: هذا الإجراء سيقوم بإخفاء محتوى جميع الصفحات بشكل دائم ولا يمكن التراجع عنه. هل أنت متأكد؟")) {
                return;
            }
        }

        setIsLoading(true);
        setError(null);

        try {
            const { PDFDocument, grayscale } = PDFLib;
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            
            let pdfBytes;

            if (protectionType === 'encrypt') {
                const saveOptions: any = {
                    userPassword: userPassword,
                    permissions: {
                        printing: allowPrinting,
                        copying: allowCopying,
                        modifying: allowModifying,
                        annotating: allowAnnotating,
                    }
                };
                if (ownerPassword) {
                    saveOptions.ownerPassword = ownerPassword;
                }
                pdfBytes = await pdfDoc.save(saveOptions);

            } else { // redact
                const blackColor = grayscale(0);
                for (const page of pdfDoc.getPages()) {
                    const { width, height } = page.getSize();
                    page.drawRectangle({ x: 0, y: 0, width, height, color: blackColor });
                }
                pdfBytes = await pdfDoc.save();
            }

            download(pdfBytes, `${file.name.replace('.pdf', '')}_protected.pdf`, "application/pdf");
            setFile(null); // Reset after success
        } catch (e) {
            console.error(e);
            setError("حدث خطأ أثناء حماية الملف.");
        } finally {
            setIsLoading(false);
        }
    };

    const isButtonDisabled = isLoading || (protectionType === 'encrypt' && (!userPassword || userPassword !== confirmUserPassword));

    const renderOptions = () => (
        <div className="space-y-6">
            <p className="text-xl text-center">الملف جاهز للحماية: <span className="font-bold text-blue-400">{file?.name}</span></p>

            <div className="flex justify-center bg-slate-800 p-1 rounded-lg max-w-md mx-auto">
                <button 
                    onClick={() => setProtectionType('encrypt')} 
                    className={`w-full py-2 rounded-md transition-colors flex items-center justify-center gap-2 ${protectionType === 'encrypt' ? 'bg-blue-600 text-white' : 'hover:bg-slate-700'}`}
                >
                    <LockClosedIcon className="w-5 h-5" />
                    تشفير بكلمة مرور
                </button>
                <button 
                    onClick={() => setProtectionType('redact')} 
                    className={`w-full py-2 rounded-md transition-colors flex items-center justify-center gap-2 ${protectionType === 'redact' ? 'bg-red-700 text-white' : 'hover:bg-slate-700'}`}
                >
                    <EyeSlashIcon className="w-5 h-5" />
                    إخفاء المحتوى
                </button>
            </div>

            {protectionType === 'encrypt' && (
                <div className="p-6 bg-slate-800/50 rounded-lg space-y-4 animate-fade-in max-w-3xl mx-auto">
                    <h3 className="text-lg font-semibold text-center text-blue-300 mb-4">إعدادات التشفير</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block mb-2 font-medium text-slate-300">كلمة مرور المستخدم (لفتح الملف)</label>
                            <input type="password" value={userPassword} onChange={e => setUserPassword(e.target.value)} placeholder="أدخل كلمة مرور الفتح" className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <PasswordStrengthMeter password={userPassword} />
                        </div>
                        <div>
                            <label className="block mb-2 font-medium text-slate-300">تأكيد كلمة مرور المستخدم</label>
                            <input type="password" value={confirmUserPassword} onChange={e => setConfirmUserPassword(e.target.value)} placeholder="أعد إدخال كلمة المرور" className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                         <div className="md:col-span-2">
                            <label className="block mb-2 font-medium text-slate-300">كلمة مرور المالك <span className="text-sm text-slate-400">(اختياري - لتغيير الأذونات)</span></label>
                            <input type="password" value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} placeholder="كلمة مرور للتحكم الكامل" className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                    </div>
                    <div>
                        <h4 className="text-md font-semibold text-slate-300 mb-3 pt-4 border-t border-slate-700">أذونات المستخدم:</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-slate-300">
                           
                            <Tooltip text="يسمح للمستخدمين بطباعة المستند.">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" checked={allowPrinting} onChange={e => setAllowPrinting(e.target.checked)} className="w-5 h-5 rounded bg-slate-700 border-slate-500 text-blue-500 focus:ring-blue-500" />
                                    السماح بالطباعة
                                    <QuestionMarkCircleIcon className="w-5 h-5 text-slate-500" />
                                </label>
                            </Tooltip>
                             
                            <Tooltip text="يسمح للمستخدمين بنسخ النصوص والصور من المستند.">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" checked={allowCopying} onChange={e => setAllowCopying(e.target.checked)} className="w-5 h-5 rounded bg-slate-700 border-slate-500 text-blue-500 focus:ring-blue-500" />
                                    السماح بنسخ المحتوى
                                    <QuestionMarkCircleIcon className="w-5 h-5 text-slate-500" />
                                </label>
                            </Tooltip>

                            <Tooltip text="يسمح للمستخدمين بتعديل المستند، مثل تحرير المحتوى أو تدوير الصفحات.">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" checked={allowModifying} onChange={e => setAllowModifying(e.target.checked)} className="w-5 h-5 rounded bg-slate-700 border-slate-500 text-blue-500 focus:ring-blue-500" />
                                    السماح بالتعديل
                                    <QuestionMarkCircleIcon className="w-5 h-5 text-slate-500" />
                                </label>
                            </Tooltip>

                             <Tooltip text="يسمح للمستخدمين بإضافة التعليقات وملء حقول النماذج.">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" checked={allowAnnotating} onChange={e => setAllowAnnotating(e.target.checked)} className="w-5 h-5 rounded bg-slate-700 border-slate-500 text-blue-500 focus:ring-blue-500" />
                                    السماح بالتعليقات والنماذج
                                    <QuestionMarkCircleIcon className="w-5 h-5 text-slate-500" />
                                </label>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            )}

            {protectionType === 'redact' && (
                 <div className="p-6 bg-red-900/20 border border-red-700 rounded-lg text-center animate-fade-in max-w-3xl mx-auto">
                    <h3 className="text-xl font-bold text-red-400 mb-3">إجراء لا يمكن التراجع عنه!</h3>
                    <p className="text-slate-300 max-w-lg mx-auto">
                        سيقوم هذا الخيار برسم مستطيل أسود فوق كل صفحة، مما يخفي المحتوى بشكل دائم. استخدم هذا الخيار بحذر شديد.
                    </p>
                </div>
            )}
            
             <div className="text-center p-4 pt-6 border-t border-slate-800">
                <button 
                    onClick={handleProtect}
                    disabled={isButtonDisabled}
                    className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center mx-auto"
                >
                    {isLoading ? <LoadingSpinner/> : 'تطبيق الحماية'}
                </button>
            </div>
        </div>
    );
    
    return (
        <div>
            {!file ? (
                <FileUploader onFilesSelected={onFilesSelected} multiple={false} accept=".pdf" />
            ) : (
                renderOptions()
            )}
            {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
        </div>
    );
};

export default ProtectPdf;