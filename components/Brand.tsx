import { brandIcon } from '../brand';

export default function Brand({ compact = false, subtitle }: { compact?: boolean; subtitle?: string }) {
    return (
        <span className="inline-flex min-w-0 items-center gap-2.5">
            <img
                src={brandIcon}
                alt=""
                width={48}
                height={48}
                aria-hidden="true"
                className={`shrink-0 ${compact ? 'h-9 w-9' : 'h-12 w-12'}`}
            />
            <span className="min-w-0 text-start">
                <span className={`flex items-baseline gap-1.5 whitespace-nowrap font-black leading-tight text-slate-950 ${compact ? 'text-base' : 'text-2xl'}`}>
                    <span>مدار</span> <bdi className="tracking-tight text-blue-700">PDF</bdi>
                </span>
                {subtitle && <span className="mt-0.5 block text-xs font-semibold text-slate-500">{subtitle}</span>}
            </span>
        </span>
    );
}
