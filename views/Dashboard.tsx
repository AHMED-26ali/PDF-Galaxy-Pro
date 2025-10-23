
import React from 'react';
import { DocumentTextIcon } from '../components/icons';

const Dashboard: React.FC = () => {
    // This is a placeholder. In a real app, you would fetch recent documents.
    const recentDocuments: any[] = [];

    return (
        <div className="animate-fade-in">
            <h1 className="text-3xl font-bold text-white mb-6">المستندات الأخيرة</h1>
            {recentDocuments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Map through recent documents here */}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-96 bg-slate-800/50 rounded-lg">
                    <DocumentTextIcon className="w-24 h-24 text-slate-600 mb-4" />
                    <h2 className="text-2xl font-semibold text-slate-300">لا توجد مستندات حديثة</h2>
                    <p className="text-slate-400 mt-2">ابدأ باستخدام أداة لترى مستنداتك هنا.</p>
                </div>
            )}
        </div>
    );
};

export default Dashboard;