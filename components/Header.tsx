import React from 'react';
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
                    {/* Brand Logo & Title */}
                    <div 
                        onClick={() => onNavigate('tools')}
                        className="flex items-center gap-3.5 cursor-pointer group"
                    >
                        <div className="relative w-12 h-12 rounded-2xl overflow-hidden shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-all duration-200 border border-white/50 bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center p-0.5">
                            <img 
                                src="/logo.svg" 
                                alt="PDF Galaxy Pro Logo" 
                                className="w-full h-full object-contain rounded-xl"
                            />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-black bg-gradient-to-l from-blue-700 via-indigo-700 to-purple-700 bg-clip-text text-transparent tracking-tight">
                                    PDF Galaxy
                                </span>
                                <span className="text-[11px] font-bold text-blue-700 bg-blue-100/80 border border-blue-200 px-2 py-0.5 rounded-full">
                                    PRO
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium">أدوات PDF احترافية ومجانية بالكامل</p>
                        </div>
                    </div>

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
