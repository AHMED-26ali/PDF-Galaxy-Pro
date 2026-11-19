import React from 'react';
import Brand from './Brand';
import { Tool, ToolCategory } from '../types';

interface HeaderProps {
    currentView: string;
    selectedTool: Tool | null;
    onNavigate: (view: string, category?: ToolCategory) => void;
}

const Header: React.FC<HeaderProps> = ({ currentView, selectedTool, onNavigate }) => {
    return (
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-20">
                    <button type="button" onClick={() => onNavigate('tools')} className="rounded-xl text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                        <Brand subtitle="أدوات PDF أونلاين" />
                    </button>

                    {/* Navigation Links */}
                    <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60">
                        <button
                            onClick={() => onNavigate('tools', 'all')}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                currentView === 'tools' && !selectedTool
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                            }`}
                        >
                            جميع الأدوات
                        </button>
                        <button
                            onClick={() => onNavigate('tools', 'organize')}
                            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:text-blue-600 hover:bg-white/60 transition-all"
                        >
                            دمج وتنظيم
                        </button>
                        <button
                            onClick={() => onNavigate('tools', 'convert')}
                            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:text-blue-600 hover:bg-white/60 transition-all"
                        >
                            تحويل وتصدير
                        </button>
                        <button
                            onClick={() => onNavigate('tools', 'security')}
                            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:text-blue-600 hover:bg-white/60 transition-all"
                        >
                            أمان وحماية
                        </button>
                        <button
                            onClick={() => onNavigate('tools', 'extract')}
                            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:text-blue-600 hover:bg-white/60 transition-all"
                        >
                            استخراج OCR
                        </button>
                    </nav>

                    {/* Action & Trust Badge */}
                    <div className="flex items-center gap-3">
                        <div className="hidden lg:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>100% معالجة آمنة داخل المتصفح</span>
                        </div>

                        {selectedTool && (
                            <button
                                onClick={() => onNavigate('tools')}
                                className="px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-bold border border-blue-200 transition-colors"
                            >
                                ← العودة للأدوات
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
