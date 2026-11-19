import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import ToolsView from './views/ToolsView';
import ToolWrapper from './views/ToolWrapper';
import { Tool, ToolCategory } from './types';
import { tools } from './constants';
import { toolPath, updatePageMetadata } from './brand';
import EditorEntry from './tools/pdf-editor/EditorEntry';

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
            const toolFromPath = /^\/tools\/([a-z-]+)\/?$/.exec(window.location.pathname)?.[1];
            const toolFromQuery = urlParams.get('tool');
            const hash = window.location.hash.replace('#', '').trim();
            const targetToolId = toolFromPath || toolFromQuery || hash;

            if (targetToolId) {
                const found = tools.find(t => t.id === targetToolId);
                if (found) {
                    setSelectedTool(found);
                    setCurrentView('tool');
                    updatePageMetadata(found);
                    return;
                }
            }
            setSelectedTool(null);
            setCurrentView('tools');
            updatePageMetadata();
        };

        updateFromUrl();
        window.addEventListener('popstate', updateFromUrl);
        return () => window.removeEventListener('popstate', updateFromUrl);
    }, []);

    const handleSelectTool = (tool: Tool) => {
        setSelectedTool(tool);
        setCurrentView('tool');
        const url = new URL(window.location.href);
        url.pathname = toolPath(tool.id);
        url.searchParams.delete('tool');
        window.history.pushState(null, '', url.pathname + url.search);
        updatePageMetadata(tool);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBackToTools = () => {
        setSelectedTool(null);
        setCurrentView('tools');
        window.history.pushState(null, '', '/');
        updatePageMetadata();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    
    const handleNavigate = (view: string, category?: ToolCategory) => {
        if (view !== 'tool') {
            setSelectedTool(null);
            window.history.pushState(null, '', '/');
            updatePageMetadata();
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
    
    if (currentView === 'tool' && selectedTool?.id === 'edit-pdf') {
        return <EditorEntry onBack={handleBackToTools} />;
    }

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
