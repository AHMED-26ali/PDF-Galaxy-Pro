import React from 'react';

const Footer: React.FC = () => {
    return (
        <footer className="mt-auto bg-white border-t border-slate-200/80 py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/20">
                            PDF
                        </div>
                        <div>
                            <span className="text-lg font-black text-slate-900">PDF Galaxy Pro</span>
                            <p className="text-xs text-slate-500 font-medium">أدوات PDF ذكية وسريعة ومجانية للجميع</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-semibold text-slate-600">
                        <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                            <span>✓</span>
                            <span>معالجة آمنة محلياً</span>
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1.5 text-blue-600 font-bold">
                            <span>⚡</span>
                            <span>سرعة فائقة</span>
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1.5 text-purple-600 font-bold">
                            <span>🎁</span>
                            <span>استخدام مجاني غير محدود</span>
                        </span>
                    </div>
                </div>

                <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-medium">
                    <p>© {new Date().getFullYear()} PDF Galaxy Pro. جميع الحقوق محفوظة.</p>
                    <p className="text-slate-400">تتم معالجة جميع المستندات على جهاز المستخدم محلياً لضمان أقصى درجات الخصوصية.</p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
