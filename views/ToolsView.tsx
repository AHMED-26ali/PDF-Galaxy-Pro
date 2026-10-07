import React, { useState, useMemo } from 'react';
import { Tool, ToolCategory } from '../types';
import ToolCard from '../components/ToolCard';
import { MagnifyingGlassIcon } from '../components/icons';

interface ToolsViewProps {
    tools: Tool[];
    onSelectTool: (tool: Tool) => void;
    initialCategory?: ToolCategory;
}

const categories: { id: ToolCategory; label: string; icon: string }[] = [
    { id: 'all', label: 'جميع الأدوات', icon: '✨' },
    { id: 'organize', label: 'دمج وتنظيم', icon: '📑' },
    { id: 'convert', label: 'تحويل وتصدير', icon: '🔄' },
    { id: 'security', label: 'أمان وحماية', icon: '🛡️' },
    { id: 'extract', label: 'استخراج وقراءة', icon: '🔍' },
];

const ToolsView: React.FC<ToolsViewProps> = ({ tools, onSelectTool, initialCategory = 'all' }) => {
    const [selectedCategory, setSelectedCategory] = useState<ToolCategory>(initialCategory);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredTools = useMemo(() => {
        return tools.filter((tool) => {
            const matchesCategory =
                selectedCategory === 'all' || tool.category === selectedCategory;
            const matchesSearch =
                searchQuery.trim() === '' ||
                tool.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                tool.description.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [tools, selectedCategory, searchQuery]);

    const countsByCategory = useMemo(() => {
        const counts: Record<string, number> = { all: tools.length };
        tools.forEach((t) => {
            if (t.category) {
                counts[t.category] = (counts[t.category] || 0) + 1;
            }
        });
        return counts;
    }, [tools]);

    return (
        <div className="space-y-10 animate-fade-in">
            {/* Cheerful Hero Banner */}
            <div className="relative rounded-3xl overflow-hidden p-8 sm:p-12 md:p-14 bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white shadow-xl shadow-indigo-500/15">
                {/* Cheerful background decorative shapes */}
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-80 h-80 rounded-full bg-cyan-400/20 blur-2xl pointer-events-none" />

                <div className="relative z-10 max-w-3xl">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white text-xs font-bold mb-5 shadow-sm">
                        <span>🚀</span>
                        <span>مجموعة الأدوات الأسهل والأسرع لملفات PDF</span>
                    </div>

                    <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight mb-5">
                        كل ما تحتاجه لإدارة وتعديل ملفاتك في مكان واحد
                    </h1>

                    <p className="text-blue-100 text-base sm:text-lg leading-relaxed mb-8 max-w-2xl font-medium">
                        أدوات سريعة وسهلة الاستخدام، تعمل بالكامل داخل متصفحك للحفاظ التام على خصوصية ملفاتك بدون رفعها إلى أي سيرفر أو تسجيل حساب.
                    </p>

                    {/* Highlights */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-white/20">
                        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm p-3 rounded-2xl border border-white/10">
                            <span className="text-2xl">⚡</span>
                            <div>
                                <h4 className="text-sm font-bold text-white">معالجة فورية</h4>
                                <p className="text-xs text-blue-100">بسرعة فائقة دون انتظار</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm p-3 rounded-2xl border border-white/10">
                            <span className="text-2xl">🔒</span>
                            <div>
                                <h4 className="text-sm font-bold text-white">أمان وخصوصية</h4>
                                <p className="text-xs text-blue-100">ملفاتك لا تغادر جهازك أبداً</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm p-3 rounded-2xl border border-white/10">
                            <span className="text-2xl">🎁</span>
                            <div>
                                <h4 className="text-sm font-bold text-white">مجاني 100%</h4>
                                <p className="text-xs text-blue-100">استخدام بلا حدود أو اشتراكات</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cheerful Category Filter & Search Bar */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-2.5 bg-white rounded-3xl border border-slate-200 shadow-sm">
                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
                    {categories.map((cat) => {
                        const isActive = selectedCategory === cat.id;
                        const count = countsByCategory[cat.id] || 0;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 ${
                                    isActive
                                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                                        : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'
                                }`}
                            >
                                <span>{cat.icon}</span>
                                <span>{cat.label}</span>
                                <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                                        isActive
                                            ? 'bg-white/20 text-white'
                                            : 'bg-slate-100 text-slate-500'
                                    }`}
                                >
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Instant Search Bar */}
                <div className="relative min-w-[260px] lg:w-80">
                    <MagnifyingGlassIcon className="w-5 h-5 absolute top-1/2 right-3.5 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="ابحث عن أداة معينة (دمج، ضغط، تحويل...)"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 pr-11 pl-4 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all font-medium"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute top-1/2 left-3 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 p-1"
                            title="مسح البحث"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Tools Grid */}
            {filteredTools.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredTools.map((tool) => (
                        <ToolCard key={tool.id} tool={tool} onSelect={() => onSelectTool(tool)} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 px-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500 text-2xl">
                        🔍
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">لم نجد أي أداة مطابقة</h3>
                    <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
                        لا توجد نتائج تطابق بحثك عن "{searchQuery}". جرب البحث بكلمة أخرى أو اختر من الأقسام بالأعلى.
                    </p>
                    <button
                        onClick={() => {
                            setSearchQuery('');
                            setSelectedCategory('all');
                        }}
                        className="px-6 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all"
                    >
                        عرض جميع الأدوات
                    </button>
                </div>
            )}
        </div>
    );
};

export default ToolsView;
