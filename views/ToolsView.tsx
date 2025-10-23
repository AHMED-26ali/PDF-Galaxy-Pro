
import React from 'react';
import { Tool } from '../types';
import ToolCard from '../components/ToolCard';

interface ToolsViewProps {
    tools: Tool[];
    onSelectTool: (tool: Tool) => void;
}

const ToolsView: React.FC<ToolsViewProps> = ({ tools, onSelectTool }) => {
    return (
        <div className="container mx-auto px-4 animate-fade-in">
            <div className="text-center mb-12">
                <h1 className="text-5xl md:text-6xl font-extrabold text-white leading-tight">
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
                        Master PDF
                    </span>
                </h1>
                <p className="mt-4 text-xl text-slate-300">
                    قوة PDF الخارقة. أدوات من المستقبل.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {tools.map(tool => (
                    <ToolCard key={tool.id} tool={tool} onSelect={() => onSelectTool(tool)} />
                ))}
            </div>
        </div>
    );
};

export default ToolsView;