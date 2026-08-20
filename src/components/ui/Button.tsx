import React, { useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline-danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gaccent text-gbase font-semibold hover:bg-gaccent3 active:bg-gaccent2 btn-glow ripple-btn disabled:hover:bg-gaccent',
  secondary:
    'bg-gpanel2/80 text-gtext border border-gborder2/60 hover:border-gaccent/40 hover:text-gaccent hover:bg-gpanel3/50 hover:shadow-[0_0_16px_-3px_rgba(0,255,136,0.12)] ripple-btn',
  ghost: 'bg-transparent text-gmuted hover:text-gtext hover:bg-gpanel2/60',
  danger:
    'bg-gdanger2 text-white font-semibold hover:bg-gdanger disabled:bg-gdanger2/60 btn-glow',
  'outline-danger':
    'bg-transparent text-gdanger border border-gdanger/30 hover:bg-gdanger/10 hover:border-gdanger/50 hover:shadow-[0_0_12px_-3px_rgba(255,77,109,0.15)]',
  success:
    'bg-green-500/15 text-green-400 border border-green-500/25 font-semibold hover:bg-green-500/25 hover:shadow-[0_0_16px_-3px_rgba(34,197,94,0.18)] ripple-btn',
};

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-[12px] rounded-xl gap-1.5',
  md: 'px-4 py-2 text-[13px] rounded-xl gap-2',
  lg: 'px-6 py-2.5 text-[14px] rounded-xl gap-2.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className = '',
  children,
  disabled,
  ...rest
}: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    const diameter = Math.max(btn.clientWidth, btn.clientHeight);
    ripple.style.width = ripple.style.height = `${diameter}px`;
    ripple.style.left = `${e.clientX - rect.left - diameter / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - diameter / 2}px`;
    ripple.className = 'ripple';
    const existing = btn.querySelector('.ripple');
    if (existing) existing.remove();
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
    rest.onClick?.(e);
  }, [rest.onClick]);

  return (
    <button
      ref={btnRef}
      className={`inline-flex items-center justify-center transition-all duration-200 select-none disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-gaccent/40 active:scale-[0.97] ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={disabled || loading}
      onClick={handleClick}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
