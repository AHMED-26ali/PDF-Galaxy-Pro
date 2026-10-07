import React from 'react';
import { Tool } from '../types';

interface ToolCardProps {
  tool: Tool;
  onSelect: () => void;
}

const themeStyles = {
  sky: {
    iconGrad: 'from-blue-500 via-sky-500 to-cyan-400 shadow-blue-500/30',
    tagBg: 'bg-blue-50 text-blue-700 border-blue-100',
    hoverBorder: 'group-hover:border-blue-400',
    buttonColor: 'group-hover:bg-blue-600 group-hover:text-white',
    accentLine: 'bg-gradient-to-r from-blue-500 to-cyan-400',
  },
  indigo: {
    iconGrad: 'from-indigo-600 via-purple-600 to-violet-500 shadow-indigo-500/30',
    tagBg: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    hoverBorder: 'group-hover:border-indigo-400',
    buttonColor: 'group-hover:bg-indigo-600 group-hover:text-white',
    accentLine: 'bg-gradient-to-r from-indigo-500 to-purple-500',
  },
  emerald: {
    iconGrad: 'from-emerald-500 via-teal-500 to-green-400 shadow-emerald-500/30',
    tagBg: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    hoverBorder: 'group-hover:border-emerald-400',
    buttonColor: 'group-hover:bg-emerald-600 group-hover:text-white',
    accentLine: 'bg-gradient-to-r from-emerald-500 to-teal-400',
  },
  amber: {
    iconGrad: 'from-amber-500 via-orange-500 to-yellow-400 shadow-amber-500/30',
    tagBg: 'bg-amber-50 text-amber-700 border-amber-100',
    hoverBorder: 'group-hover:border-amber-400',
    buttonColor: 'group-hover:bg-amber-600 group-hover:text-white',
    accentLine: 'bg-gradient-to-r from-amber-500 to-orange-400',
  },
  rose: {
    iconGrad: 'from-rose-500 via-pink-500 to-red-400 shadow-rose-500/30',
    tagBg: 'bg-rose-50 text-rose-700 border-rose-100',
    hoverBorder: 'group-hover:border-rose-400',
    buttonColor: 'group-hover:bg-rose-600 group-hover:text-white',
    accentLine: 'bg-gradient-to-r from-rose-500 to-pink-400',
  },
  violet: {
    iconGrad: 'from-violet-600 via-purple-600 to-fuchsia-500 shadow-violet-500/30',
    tagBg: 'bg-violet-50 text-violet-700 border-violet-100',
    hoverBorder: 'group-hover:border-violet-400',
    buttonColor: 'group-hover:bg-violet-600 group-hover:text-white',
    accentLine: 'bg-gradient-to-r from-violet-500 to-fuchsia-400',
  },
};

const ToolCard: React.FC<ToolCardProps> = ({ tool, onSelect }) => {
  const theme = themeStyles[tool.colorTheme || 'sky'];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group relative flex flex-col justify-between p-6 bg-white hover:bg-slate-50/50 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden transform hover:-translate-y-1.5 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${theme.hoverBorder}`}
    >
      {/* Top colorful gradient accent on hover */}
      <div 
        className={`absolute inset-x-0 top-0 h-1.5 ${theme.accentLine} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} 
      />

      <div>
        {/* Card Header: Big Colorful Icon + Category / Badge */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${theme.iconGrad} flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform duration-300`}>
            <tool.icon className="w-7 h-7" />
          </div>

          <div className="flex flex-col items-end gap-1.5">
            {tool.categoryLabel && (
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${theme.tagBg}`}>
                {tool.categoryLabel}
              </span>
            )}
            {tool.badge && (
              <span className="text-[10px] font-extrabold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                ★ {tool.badge}
              </span>
            )}
          </div>
        </div>

        {/* Title & Description */}
        <h3 className="text-xl font-extrabold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
          {tool.title}
        </h3>
        <p className="text-slate-600 text-sm leading-relaxed mb-6">
          {tool.description}
        </p>
      </div>

      {/* Card Footer: Cheerful Action Button */}
      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400">
          معالجة فورية
        </span>

        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold transition-all duration-200 ${theme.buttonColor}`}>
          <span>ابدأ الآن</span>
          <svg 
            className="w-3.5 h-3.5 transform group-hover:-translate-x-1 transition-transform duration-200" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 12H5m0 0l7 7m-7-7l7-7" />
          </svg>
        </span>
      </div>
    </div>
  );
};

export default ToolCard;
