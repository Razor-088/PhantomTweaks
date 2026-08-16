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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadein"
      onClick={onClose}
    >
      <div
        className="panel bg-gpanel shadow-2xl border-gborder2 animate-slideup overflow-hidden"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b ${
            danger ? 'border-gdanger/30' : 'border-gborder'
          }`}
        >
          <div className={`text-[14px] font-semibold ${danger ? 'text-gdanger' : 'text-gtext'}`}>{title}</div>
          <button onClick={onClose} className="text-gdim hover:text-gtext transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 text-[13px] text-gmuted leading-relaxed max-h-[60vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gborder">{footer}</div>
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
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger,
  busy,
  onConfirm,
  onCancel,
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
            className="px-4 py-2 text-[13px] rounded-lg text-gmuted hover:text-gtext border border-gborder hover:border-gborder2 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 text-[13px] font-semibold rounded-lg transition-colors disabled:opacity-50 ${
              danger
                ? 'bg-gdanger2 text-white hover:bg-gdanger'
                : 'bg-gaccent text-gbase hover:bg-gaccent3'
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
