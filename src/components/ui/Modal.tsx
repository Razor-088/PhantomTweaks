import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  danger?: boolean;
}

export function Modal({ open, onClose, title, children, footer, width = 480, danger }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-fadein"
      onClick={onClose}
    >
      <div
        className="bg-gpanel border border-gborder2 rounded-2xl shadow-[0_24px_80px_-20px_rgba(0,0,0,0.6)] animate-scale-in overflow-hidden"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            danger ? 'border-gdanger/30' : 'border-gborder/40'
          }`}
        >
          <div className={`text-[14px] font-bold ${danger ? 'text-gdanger' : 'text-gtext'}`}>{title}</div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-gdim hover:text-gtext hover:bg-gpanel2 transition-all duration-200"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 text-[13px] text-gmuted leading-relaxed max-h-[60vh] overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-gborder/40 bg-gpanel2/30">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger, busy, onConfirm, onCancel,
}: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      danger={danger}
      width={440}
      footer={
        <>
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-[13px] rounded-xl text-gmuted hover:text-gtext border border-gborder hover:border-gborder2 transition-all duration-200 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 text-[13px] font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 ${
              danger
                ? 'bg-gdanger2 text-white hover:bg-gdanger btn-glow'
                : 'bg-gaccent text-gbase hover:bg-gaccent3 btn-glow'
            }`}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </>
      }
    >
      {message}
    </Modal>
  );
}
