import React from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline-danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gaccent text-gbase font-semibold hover:bg-gaccent3 active:bg-gaccent2 btn-glow disabled:hover:bg-gaccent',
  secondary:
    'bg-gpanel2 text-gtext border border-gborder2 hover:border-gaccent/50 hover:text-gaccent',
  ghost: 'bg-transparent text-gmuted hover:text-gtext hover:bg-gpanel2',
  danger:
    'bg-gdanger2 text-white font-semibold hover:bg-gdanger disabled:bg-gdanger2/60',
  'outline-danger':
    'bg-transparent text-gdanger border border-gdanger/40 hover:bg-gdanger/10',
};

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-[12px] rounded-md gap-1.5',
  md: 'px-4 py-2 text-[13px] rounded-lg gap-2',
  lg: 'px-6 py-3 text-[14px] rounded-lg gap-2',
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
  return (
    <button
      className={`inline-flex items-center justify-center transition-all duration-150 select-none disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-gaccent/50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
