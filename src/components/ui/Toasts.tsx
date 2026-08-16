import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useAppStore, Toast } from '../../store/useAppStore';

const ICONS = {
  success: <CheckCircle2 size={18} className="text-gaccent shrink-0" />,
  error: <XCircle size={18} className="text-gdanger shrink-0" />,
  info: <Info size={18} className="text-ginfo shrink-0" />,
  warning: <AlertTriangle size={18} className="text-gwarn shrink-0" />,
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useAppStore((s) => s.dismissToast);
  return (
    <div className="w-[340px] panel bg-gpanel border-gborder2 px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.55)] animate-slideup">
      <div className="flex items-start gap-3">
        {ICONS[toast.type]}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-gtext">{toast.title}</div>
          {toast.message && <div className="text-[12px] text-gmuted mt-0.5 leading-snug">{toast.message}</div>}
        </div>
        <button onClick={() => dismiss(toast.id)} className="text-gdim hover:text-gtext transition-colors">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 items-end">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
