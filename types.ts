
import React from 'react';

export interface Tool {
    id: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    component: React.ComponentType;
}