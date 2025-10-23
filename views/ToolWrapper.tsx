
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
        <div className="max-w-7xl mx-auto px-4 animate-fade-in">
            <button 
                onClick={onBack} 
                className="flex items-center gap-2 text-slate-300 hover:text-white mb-6 group transition-colors"
            >
                <ArrowRightIcon className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" />
                <span>العودة إلى الأدوات</span>
            </button>
            <div className="bg-slate-900/50 backdrop-blur-lg border border-slate-800 rounded-xl p-8">
                <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-800">
                    <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center">
                        <tool.icon className="w-7 h-7 text-blue-500" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white">{tool.title}</h1>
                        <p className="text-slate-400">{tool.description}</p>
                    </div>
                </div>
                {children}
            </div>
        </div>
    );
};

export default ToolWrapper;