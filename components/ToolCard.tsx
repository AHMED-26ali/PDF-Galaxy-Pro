
import React, { useRef, MouseEvent } from 'react';
import { Tool } from '../types';

interface ToolCardProps {
  tool: Tool;
  onSelect: () => void;
}

const ToolCard: React.FC<ToolCardProps> = ({ tool, onSelect }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const { clientX, clientY, currentTarget } = e;
    const { left, top, width, height } = currentTarget.getBoundingClientRect();
    const x = clientX - left;
    const y = clientY - top;
    const rotateX = (y / height - 0.5) * -20; // -10deg to 10deg
    const rotateY = (x / width - 0.5) * 20; // -10deg to 10deg
    cardRef.current.style.setProperty('--rotate-x', `${rotateX}deg`);
    cardRef.current.style.setProperty('--rotate-y', `${rotateY}deg`);
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.setProperty('--rotate-x', '0deg');
    cardRef.current.style.setProperty('--rotate-y', '0deg');
  };

  return (
    <div
      ref={cardRef}
      className="tool-card relative p-6 bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 cursor-pointer overflow-hidden"
      onClick={onSelect}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
        <div className="tool-card-glow"></div>
        <div className="relative z-10 flex flex-col h-full">
            <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center mb-4">
                    <tool.icon className="w-7 h-7 text-blue-500" />
                </div>
            </div>
            <div className="flex-grow">
                <h3 className="text-xl font-semibold text-white mb-2">{tool.title}</h3>
                <p className="text-slate-400">{tool.description}</p>
            </div>
        </div>
    </div>
  );
};

export default ToolCard;