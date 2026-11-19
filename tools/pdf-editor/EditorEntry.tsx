import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import LoadingSpinner from '../../components/LoadingSpinner';
import EditorIdentity from './EditorIdentity';

const PdfEditor = lazy(() => import('./PdfEditor'));

export type EditorViewControls = {
    onBack?: () => void;
    onFullscreen?: () => void;
    fullscreen?: boolean;
};

export default function EditorEntry({ onBack }: { onBack?: () => void }) {
    const root = useRef<HTMLDivElement>(null);
    const [fullscreen, setFullscreen] = useState(false);
    const [screenError, setScreenError] = useState('');
    const supportsFullscreen = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);
    useEffect(() => {
        const update = () => setFullscreen(document.fullscreenElement === root.current);
        document.addEventListener('fullscreenchange', update);
        return () => document.removeEventListener('fullscreenchange', update);
    }, []);

    async function toggleFullscreen() {
        if (!root.current) return;
        setScreenError('');
        try {
            if (document.fullscreenElement === root.current) await document.exitFullscreen();
            else await root.current.requestFullscreen();
        } catch {
            setScreenError('تعذّر تفعيل ملء الشاشة في هذا المتصفح.');
        }
    }

    return (
        <div ref={root} className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-slate-100">
            {screenError && <p role="status" className="bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">{screenError}</p>}
            <Suspense fallback={
                <>
                    <header className="border-b border-slate-200 bg-white p-3"><EditorIdentity onBack={onBack} /></header>
                    <div role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-700"><LoadingSpinner /> جاري تجهيز محرّر PDF…</div>
                </>
            }>
                <PdfEditor onBack={onBack} onFullscreen={supportsFullscreen ? toggleFullscreen : undefined} fullscreen={fullscreen} />
            </Suspense>
        </div>
    );
}
