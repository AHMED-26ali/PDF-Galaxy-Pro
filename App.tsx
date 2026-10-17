import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import ToolsView from './views/ToolsView';
import ToolWrapper from './views/ToolWrapper';
import { Tool, ToolCategory } from './types';
import { tools } from './constants';

declare const pdfjsLib: any;

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<string>('tools');
    const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<ToolCategory>('all');

    useEffect(() => {
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
        }
    }, []);

    // Synchronize selected tool with URL query parameter or hash
    useEffect(() => {
        const updateFromUrl = () => {
            const urlParams = new URLSearchParams(window.location.search);
            const toolFromQuery = urlParams.get('tool');
            const hash = window.location.hash.replace('#', '').trim();
            const targetToolId = toolFromQuery || hash;

            if (targetToolId) {
                const found = tools.find(t => t.id === targetToolId);
                if (found) {
                    setSelectedTool(found);
                    setCurrentView('tool');
                    document.title = `${found.title} - PDF Galaxy Pro`;
                    return;
                }
            }
            setSelectedTool(null);
            setCurrentView('tools');
            document.title = 'PDF Galaxy Pro - محرر وأدوات PDF الاحترافية';
        };

        updateFromUrl();
        window.addEventListener('popstate', updateFromUrl);
        return () => window.removeEventListener('popstate', updateFromUrl);
    }, []);

    const handleSelectTool = (tool: Tool) => {
        setSelectedTool(tool);
        setCurrentView('tool');
        const url = new URL(window.location.href);
        url.searchParams.set('tool', tool.id);
        window.history.pushState(null, '', url.pathname + url.search);
        document.title = `${tool.title} - PDF Galaxy Pro`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBackToTools = () => {
        setSelectedTool(null);
        setCurrentView('tools');
        const url = new URL(window.location.href);
        url.searchParams.delete('tool');
        window.history.pushState(null, '', url.pathname);
        document.title = 'PDF Galaxy Pro - محرر وأدوات PDF الاحترافية';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    
    const handleNavigate = (view: string, category?: ToolCategory) => {
        if (view !== 'tool') {
            setSelectedTool(null);
            const url = new URL(window.location.href);
            url.searchParams.delete('tool');
            window.history.pushState(null, '', url.pathname);
            document.title = 'PDF Galaxy Pro - محرر وأدوات PDF الاحترافية';
        }
        if (category) {
            setSelectedCategory(category);
        }
        setCurrentView(view);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const renderContent = () => {
        if (currentView === 'tool' && selectedTool) {
            return (
                <ToolWrapper tool={selectedTool} onBack={handleBackToTools}>
                    {React.createElement(selectedTool.component)}
                </ToolWrapper>
            );
        }
        return (
            <ToolsView 
                key={selectedCategory}
                tools={tools} 
                initialCategory={selectedCategory} 
                onSelectTool={handleSelectTool} 
            />
        );
    };
    
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            {/* Top Navigation Bar (راس للموقع) */}
            <Header 
                currentView={currentView} 
                selectedTool={selectedTool} 
                onNavigate={handleNavigate} 
            />

            {/* Main Content Viewport */}
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
                {renderContent()}
            </main>

            {/* Footer */}
            <Footer />
        </div>
    );
};

export default App;
