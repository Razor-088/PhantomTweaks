import React from 'react';
import { Loader2 } from 'lucide-react';

export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin text-gaccent ${className}`} />;
}

export function PageSpinner({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-gdim">
      <Loader2 size={28} className="animate-spin text-gaccent" />
      <span className="text-[12px] tracking-wider uppercase">{text}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && <div className="mb-3 text-gdim">{icon}</div>}
      <div className="text-[14px] font-semibold text-gmuted">{title}</div>
      {description && <div className="text-[12px] text-gdim mt-1 max-w-sm leading-relaxed">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
