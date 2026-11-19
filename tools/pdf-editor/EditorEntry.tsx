import { lazy, Suspense } from 'react';
import LoadingSpinner from '../../components/LoadingSpinner';

const PdfEditor = lazy(() => import('./PdfEditor'));

export default function EditorEntry() {
    return <Suspense fallback={<div role="status" className="flex items-center gap-2 text-sm text-slate-700"><LoadingSpinner /> جاري تجهيز محرّر PDF…</div>}>
        <PdfEditor />
    </Suspense>;
}
