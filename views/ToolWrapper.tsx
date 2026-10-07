import React from 'react';
import { Tool } from '../types';
import { ArrowRightIcon } from '../components/icons';

interface ToolWrapperProps {
    tool: Tool;
    onBack: () => void;
    children: React.ReactNode;
}

const ToolWrapper: React.FC<ToolWrapperProps> = ({ tool, onBack, children }) => {
    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-12">
            {/* Top Navigation & Status */}
            <div className="flex items-center justify-between">
                <button 
                    onClick={onBack} 
                    className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-600 border border-slate-200 text-sm font-bold transition-all shadow-xs group"
                >
                    <ArrowRightIcon className="w-4 h-4 transform group-hover:translate-x-1 transition-transform text-slate-400 group-hover:text-blue-600" />
                    <span>العودة إلى جميع الأدوات</span>
                </button>

                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>ملفك آمن 100% على جهازك</span>
                </div>
            </div>

            {/* Main Tool Container */}
            <div className="rounded-3xl bg-white border border-slate-200/90 shadow-sm p-6 sm:p-10">
                {/* Tool Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-8 mb-8 border-b border-slate-100">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 shrink-0">
                            <tool.icon className="w-8 h-8" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5 mb-1.5">
                                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                                    {tool.title}
                                </h1>
                                {tool.badge && (
                                    <span className="text-[11px] font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                                        {tool.badge}
                                    </span>
                                )}
                            </div>
                            <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                                {tool.description}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tool Action Interface */}
                <div>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default ToolWrapper;
