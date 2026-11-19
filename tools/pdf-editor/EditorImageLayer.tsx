import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { EditorImage } from './editorDocument';

type Action = 'move' | 'resize' | 'rotate';
type Gesture = { action: Action; startX: number; startY: number; image: EditorImage; bounds: DOMRect };

const clamp = (number: number, min: number, max: number) => Math.min(max, Math.max(min, number));

function imageTransform(event: PointerEvent<HTMLDivElement>, drag: Gesture) {
    const { action, bounds, image } = drag;
    const next = { ...image };
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (action === 'move') {
        next.x = clamp(image.x + (x - drag.startX) / bounds.width * 100, 0, 100);
        next.y = clamp(image.y + (y - drag.startY) / bounds.height * 100, 0, 100);
    } else {
        const centerX = image.x / 100 * bounds.width;
        const centerY = image.y / 100 * bounds.height;
        const origin = [drag.startX - centerX, drag.startY - centerY];
        const current = [x - centerX, y - centerY];
        if (action === 'resize') {
            next.width = clamp(image.width * Math.hypot(...current) / Math.max(1, Math.hypot(...origin)), 2, 180);
        } else {
            const angle = image.angle + (Math.atan2(current[1], current[0]) - Math.atan2(origin[1], origin[0])) * 180 / Math.PI;
            next.angle = ((angle + 180) % 360 + 360) % 360 - 180;
        }
    }
    return next;
}

export default function EditorImageLayer({ image, selected, pageRatio, onSelect, onChange }: {
    image: EditorImage;
    selected: boolean;
    pageRatio: number;
    onSelect: () => void;
    onChange: (value: EditorImage) => void;
}) {
    const drag = useRef<Gesture | null>(null);
    const [pending, setPending] = useState<EditorImage | null>(null);
    const [url, setUrl] = useState('');
    const shown = pending ?? image;
    useEffect(() => {
        const url = URL.createObjectURL(image.blob);
        setUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [image.blob]);

    return (
        <div
            role="group"
            aria-label="صورة مضافة"
            className={`absolute touch-none cursor-move select-none ${selected ? 'z-20 outline outline-2 outline-blue-600' : 'z-10 hover:outline hover:outline-2 hover:outline-blue-400'}`}
            style={{
                left: `${shown.x}%`, top: `${shown.y}%`, width: `${shown.width}%`,
                height: `${shown.width * pageRatio / shown.ratio}%`,
                transform: `translate(-50%, -50%) rotate(${shown.angle}deg)`,
            }}
            onPointerDown={event => {
                if (!event.isPrimary || event.button !== 0) return;
                const bounds = event.currentTarget.closest('[data-editor-stage]')?.getBoundingClientRect();
                if (!bounds) return;
                const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-image-action]');
                drag.current = {
                    action: (handle?.dataset.imageAction as Action | undefined) ?? 'move',
                    startX: event.clientX - bounds.left,
                    startY: event.clientY - bounds.top,
                    image,
                    bounds,
                };
                onSelect();
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
                event.stopPropagation();
            }}
            onPointerMove={event => {
                if (drag.current && event.isPrimary) setPending(imageTransform(event, drag.current));
            }}
            onPointerUp={event => {
                if (!drag.current || !event.isPrimary) return;
                const next = imageTransform(event, drag.current);
                if (next.x !== image.x || next.y !== image.y || next.width !== image.width || next.angle !== image.angle) onChange(next);
                drag.current = null;
                setPending(null);
            }}
            onPointerCancel={() => { drag.current = null; setPending(null); }}
            onLostPointerCapture={() => { drag.current = null; setPending(null); }}
        >
            {url && <img src={url} alt="صورة داخل الصفحة" draggable={false} className="pointer-events-none block h-full w-full" />}
            {selected && (
                <>
                    <button type="button" aria-label="مقبض تدوير الصورة" data-image-action="rotate" className="absolute -top-9 left-1/2 grid h-7 w-7 -translate-x-1/2 cursor-crosshair place-items-center rounded-full border-2 border-blue-600 bg-white text-sm font-bold text-blue-700 shadow-md">↻</button>
                    <button type="button" aria-label="مقبض تغيير حجم الصورة" data-image-action="resize" className="absolute -bottom-3 -right-3 grid h-7 w-7 cursor-nwse-resize place-items-center rounded-full border-2 border-blue-600 bg-white text-sm font-bold text-blue-700 shadow-md">↘</button>
                </>
            )}
        </div>
    );
}
