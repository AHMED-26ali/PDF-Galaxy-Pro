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
                <span className={`block whitespace-nowrap font-extrabold leading-tight text-slate-950 ${compact ? 'text-base' : 'text-2xl'}`}>
                    <bdi
                        dir="ltr"
                        lang="en"
                        className="block tracking-[-0.055em]"
                        style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
                    ><span className="text-[#12213a]">PDF</span><span className="text-[#08786d]">ix</span></bdi>
                </span>
                {subtitle && <span className="mt-0.5 block text-xs font-semibold text-slate-500">{subtitle}</span>}
            </span>
        </span>
    );
}
