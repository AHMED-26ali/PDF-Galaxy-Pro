import Brand from '../../components/Brand';
import { ArrowRightIcon } from '../../components/icons';

export default function EditorIdentity({ onBack }: { onBack?: () => void }) {
    return (
        <div className="flex shrink-0 items-center gap-2.5">
            <button type="button" aria-label="العودة إلى جميع الأدوات" title="العودة إلى جميع الأدوات" onClick={onBack}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-700">
                <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">العودة إلى جميع الأدوات</span>
            </button>
            <Brand compact />
            <h1 className="sr-only">محرّر PDF</h1>
        </div>
    );
}
