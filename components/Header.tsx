

import React from 'react';
import { MagnifyingGlassIcon } from './icons';
import { Tool } from '../types';

interface HeaderProps {
    currentView: string;
    selectedTool: Tool | null;
}

const Header: React.FC<HeaderProps> = ({ currentView, selectedTool }) => {
    
    const getTitle = () => {
        if (currentView === 'tool' && selectedTool) {
            return selectedTool.title;
        }
        return 'أدوات PDF';
    };

    return (
        <header className="py-4 px-8 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">{getTitle()}</h2>
                <div className="relative w-1/3">
                    <MagnifyingGlassIcon className="w-5 h-5 absolute top-1/2 right-3 -translate-y-1/2 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="ابحث في المستندات..." 
                        className="w-full bg-slate-800 border border-slate-700 rounded-md py-2 pr-10 pl-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>
        </header>
    );
};

export default Header;