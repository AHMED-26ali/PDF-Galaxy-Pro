import React from 'react';
import { ChartPieIcon, WrenchScrewdriverIcon, DocumentIcon, Cog6ToothIcon, CubeTransparentIcon } from './icons';

interface SidebarProps {
    currentView: string;
    navigate: (view: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, navigate }) => {
    const navItems = [
        { id: 'dashboard', name: 'لوحة التحكم', icon: ChartPieIcon },
        { id: 'tools', name: 'الأدوات', icon: WrenchScrewdriverIcon },
        { id: 'documents', name: 'كل المستندات', icon: DocumentIcon },
        { id: 'settings', name: 'الإعدادات', icon: Cog6ToothIcon },
    ];

    const getNavItemClass = (id: string) => {
        const baseClass = "flex items-center p-3 my-1 rounded-lg transition-all duration-300 group cursor-pointer";
        if (currentView === id) {
            return `${baseClass} bg-blue-600/30 text-white shadow-lg`;
        }
        return `${baseClass} text-slate-300 hover:bg-slate-700/50 hover:text-white`;
    };
    
    const getNavIconClass = (id: string) => {
        const baseClass = "w-6 h-6 transition-colors duration-300";
         if (currentView === id) {
            return `${baseClass} text-blue-400`;
        }
        return `${baseClass} text-slate-400 group-hover:text-blue-400`;
    }

    return (
        <aside className="w-64 bg-slate-900/70 backdrop-blur-lg border-l border-slate-800 flex flex-col p-6">
            <div className="flex items-center gap-3 mb-10">
                <CubeTransparentIcon className="w-10 h-10 text-blue-500"/>
                <h1 className="text-2xl font-bold text-white">PDF Galaxy Pro</h1>
            </div>
            <nav className="flex-1">
                <ul>
                    {navItems.map(item => (
                         <li key={item.id}>
                            <a onClick={() => navigate(item.id)} className={getNavItemClass(item.id)}>
                                <item.icon className={getNavIconClass(item.id)} />
                                <span className="mr-4 text-lg">{item.name}</span>
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>
            <div className="mt-auto pt-6 border-t border-slate-800/50">
                <div className="p-3 bg-slate-800/50 rounded-lg flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-700 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-xl font-bold text-white">ع</span>
                    </div>
                    <div className="overflow-hidden">
                        <p className="font-semibold text-white truncate">علي أحمد</p>
                        <p className="text-xs text-slate-400 truncate">ali.ahmed@galaxy.pro</p>
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
