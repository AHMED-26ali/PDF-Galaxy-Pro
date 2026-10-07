import React from 'react';

export type ToolCategory = 'all' | 'organize' | 'convert' | 'security' | 'extract';

export interface Tool {
    id: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    component: React.ComponentType;
    category?: ToolCategory;
    categoryLabel?: string;
    colorTheme?: 'sky' | 'indigo' | 'emerald' | 'amber' | 'violet' | 'rose';
    badge?: string;
}
