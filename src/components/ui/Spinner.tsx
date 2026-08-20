import React from 'react';
import { Loader2 } from 'lucide-react';

export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin text-gaccent ${className}`} />;
}

export function PageSpinner({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-24">
      <div className="relative">
        {/* Outer ring */}
        <div className="w-12 h-12 rounded-full border-2 border-gborder/50" />
        {/* Spinning accent ring */}
        <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-t-gaccent border-r-gaccent/50 animate-spin" />
        {/* Inner spinning ring (reverse) */}
        <div className="absolute inset-2 w-8 h-8 rounded-full border-2 border-transparent border-b-gaccent/40 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        {/* Center dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-gaccent shadow-[0_0_10px_rgba(0,255,136,0.6)]" />
        </div>
      </div>
      <div className="w-48 h-1.5 bg-gbase3 rounded-full overflow-hidden">
        <div className="h-full w-0 bg-gradient-to-r from-gaccent/60 to-gaccent rounded-full animate-progress" />
      </div>
      <span className="text-[11px] tracking-[0.16em] uppercase text-gdim font-semibold">{text}</span>
    </div>
  );
}

export function ProgressLoader({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24">
      <div className="relative w-48 h-1.5 bg-gbase3 rounded-full overflow-hidden">
        <div className="h-full w-0 bg-gradient-to-r from-gaccent2 to-gaccent rounded-full animate-progress" />
      </div>
      <span className="text-[11px] tracking-[0.14em] uppercase text-gdim font-medium">{text}</span>
    </div>
  );
}

export function EmptyState({
  icon, title, description, action,
}: {
  icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-fadein">
      {icon && (
        <div className="mb-5 w-16 h-16 rounded-2xl bg-gpanel3/60 flex items-center justify-center text-gdim/50 animate-float">
          {icon}
        </div>
      )}
      <div className="text-[15px] font-bold text-gmuted">{title}</div>
      {description && <div className="text-[12px] text-gdim mt-2 max-w-sm leading-relaxed">{description}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
