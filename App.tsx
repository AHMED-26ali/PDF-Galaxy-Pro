import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ToolsView from './views/ToolsView';
import Dashboard from './views/Dashboard';
import ToolWrapper from './views/ToolWrapper';
import Chatbot from './components/Chatbot';
import { Tool } from './types';
import { tools } from './constants';

declare const pdfjsLib: any;

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<string>('tools');
    const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

    useEffect(() => {
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
        }
    }, []);

    const handleSelectTool = (tool: Tool) => {
        setSelectedTool(tool);
        setCurrentView('tool');
    };

    const handleBackToTools = () => {
        setSelectedTool(null);
        setCurrentView('tools');
    };
    
    const navigate = (view: string) => {
        setSelectedTool(null);
        setCurrentView(view);
    };

    const renderContent = () => {
        if (currentView === 'tool' && selectedTool) {
            return (
                <ToolWrapper tool={selectedTool} onBack={handleBackToTools}>
                    {React.createElement(selectedTool.component)}
                </ToolWrapper>
            );
        }
        switch (currentView) {
            case 'dashboard':
                return <Dashboard />;
            case 'tools':
            default:
                return <ToolsView tools={tools} onSelectTool={handleSelectTool} />;
        }
    };
    
    return (
        <div className="min-h-screen bg-slate-900 bg-pan-animation" style={{backgroundImage: "radial-gradient(circle, rgba(147, 51, 234, 0.2) 0%, transparent 40%), radial-gradient(circle, rgba(59, 130, 246, 0.2) 100%, transparent 70%)"}}>
            <div className="flex h-screen">
                <Sidebar currentView={currentView} navigate={navigate} />
                <div className="flex-1 flex flex