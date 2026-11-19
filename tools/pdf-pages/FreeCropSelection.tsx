import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { Edges } from './pdfOperations';

type Point = { x: number; y: number };
type Bounds = { left: number; top: number; right: number; bottom: number };
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type Action = Handle | 'draw' | 'move';

const handles: { id: Handle; label: string; left: string; top: string; cursor: string }[] = [
    { id: 'nw', label: 'الزاوية العلوية اليسرى', left: '0%', top: '0%', cursor: 'nwse-resize' },
    { id: 'n', label: 'الحافة العلوية', left: '50%', top: '0%', cursor: 'ns-resize' },
    { id: 'ne', label: 'الزاوية العلوية اليمنى', left: '100%', top: '0%', cursor: 'nesw-resize' },
    { id: 'e', label: 'الحافة اليمنى', left: '100%', top: '50%', cursor: 'ew-resize' },
    { id: 'se', label: 'الزاوية السفلية اليمنى', left: '100%', top: '100%', cursor: 'nwse-resize' },
    { id: 's', label: 'الحافة السفلية', left: '50%', top: '100%', cursor: 'ns-resize' },
    { id: 'sw', label: 'الزاوية السفلية اليسرى', left: '0%', top: '100%', cursor: 'nesw-resize' },
    { id: 'w', label: 'الحافة اليسرى', left: '0%', top: '50%', cursor: 'ew-resize' },
];

function limit(value: number, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
}

function getPoint(event: PointerEvent<HTMLDivElement>): Point {
    const element = event.currentTarget.getBoundingClientRect();
    return {
        x: limit((event.clientX - element.left) * 100 / element.width),
        y: limit((event.clientY - element.top) * 100 / element.height),
    };
}

function getEdges(bounds: Bounds): Edges {
    const round = (value: number) => Math.round(value * 10) / 10;
    return { top: round(bounds.top), right: round(100 - bounds.right), bottom: round(100 - bounds.bottom), left: round(bounds.left) };
}

function adjust(bounds: Bounds, action: Exclude<Action, 'draw'>, dx: number, dy: number): Bounds {
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    if (action === 'move') {
        const left = limit(bounds.left + dx, 0, 100 - width);
        const top = limit(bounds.top + dy, 0, 100 - height);
        return { left, top, right: left + width, bottom: top + height };
    }
    const minWidth = Math.min(1.5, width);
    const minHeight = Math.min(1.5, height);
    return {
        left: action.includes('w') ? limit(bounds.left + dx, 0, bounds.right - minWidth) : bounds.left,
        right: action.includes('e') ? limit(bounds.right + dx, bounds.left + minWidth) : bounds.right,
        top: action.includes('n') ? limit(bounds.top + dy, 0, bounds.bottom - minHeight) : bounds.top,
        bottom: action.includes('s') ? limit(bounds.bottom + dy, bounds.top + minHeight) : bounds.bottom,
    };
}

export default function FreeCropSelection({ edges, onChange, selected }: {
    edges: Edges;
    onChange: (edges: Edges) => void;
    selected: boolean;
}) {
    const bounds = { left: edges.left, top: edges.top, right: 100 - edges.right, bottom: 100 - edges.bottom };
    const gesture = useRef<{ pointer: number; action: Action; start: Point; bounds: Bounds } | null>(null);

    function update(event: PointerEvent<HTMLDivElement>, final: boolean) {
        const drag = gesture.current;
        if (drag?.pointer !== event.pointerId) return;
        const point = getPoint(event);
        const dx = point.x - drag.start.x;
        const dy = point.y - drag.start.y;
        if (drag.action === 'draw') {
            if (Math.abs(dx) >= 1.5 && Math.abs(dy) >= 1.5) {
                onChange(getEdges({
                    left: Math.min(point.x, drag.start.x), right: Math.max(point.x, drag.start.x),
                    top: Math.min(point.y, drag.start.y), bottom: Math.max(point.y, drag.start.y),
                }));
            }
        } else {
            onChange(getEdges(adjust(drag.bounds, drag.action, dx, dy)));
        }
        if (final) gesture.current = null;
    }

    function cancel(event: PointerEvent<HTMLDivElement>) {
        if (gesture.current?.pointer !== event.pointerId) return;
        onChange(getEdges(gesture.current.bounds));
        gesture.current = null;
    }

    function nudge(event: KeyboardEvent<HTMLButtonElement>, action: Exclude<Action, 'draw'>) {
        const increments: Record<string, [number, number]> = {
            ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
        };
        const direction = increments[event.key];
        if (!direction) return;
        event.preventDefault();
        const step = event.shiftKey ? 5 : 0.5;
        onChange(getEdges(adjust(bounds, action, direction[0] * step, direction[1] * step)));
    }

    return (
        <div
            role="group"
            aria-label="تحديد القص الحر على الصفحة"
            className="absolute inset-0 cursor-crosshair touch-none select-none overflow-hidden"
            onPointerDown={event => {
                if (!event.isPrimary || event.button !== 0) return;
                const button = (event.target as HTMLElement).closest<HTMLElement>('[data-crop-action]');
                gesture.current = {
                    pointer: event.pointerId,
                    action: (button?.dataset.cropAction as Action | undefined) ?? 'draw',
                    start: getPoint(event),
                    bounds,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
            }}
            onPointerMove={event => update(event, false)}
            onPointerUp={event => update(event, true)}
            onPointerCancel={cancel}
            onLostPointerCapture={cancel}
        >
            {selected && (
                <div
                    className="absolute border-2 border-sky-400 shadow-[0_0_0_100vmax_rgba(15,23,42,0.60)]"
                    style={{ top: `${edges.top}%`, right: `${edges.right}%`, bottom: `${edges.bottom}%`, left: `${edges.left}%` }}
                >
                    <button type="button" data-crop-action="move" aria-label="تحريك منطقة القص" onKeyDown={event => nudge(event, 'move')} className="absolute inset-0 cursor-move focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" />
                    {handles.map(handle => (
                        <button
                            key={handle.id}
                            type="button"
                            data-crop-action={handle.id}
                            aria-label={handle.label}
                            onKeyDown={event => nudge(event, handle.id)}
                            className="absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                            style={{ left: handle.left, top: handle.top, cursor: handle.cursor }}
                        >
                            <span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-white bg-blue-600 shadow-md sm:h-3.5 sm:w-3.5" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
