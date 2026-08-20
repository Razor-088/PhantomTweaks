import React from 'react';

interface Props extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  noPadding?: boolean;
  variant?: 'default' | 'glass' | 'glow';
}

export function Card({ title, subtitle, actions, noPadding, variant = 'default', className = '', children, ...rest }: Props) {
  const variantClass = variant === 'glass'
    ? 'glass border-gborder/30'
    : variant === 'glow'
    ? 'panel border-gaccent/15 shadow-[0_0_24px_-4px_rgba(0,255,136,0.12),inset_0_1px_0_rgba(255,255,255,0.04)]'
    : '';

  return (
    <div className={`${variantClass || 'panel'} ${className}`} {...rest}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-gborder/30">
          <div className="min-w-0">
            {title && <div className="text-[13px] font-bold text-gtext truncate">{title}</div>}
            {subtitle && <div className="text-[10.5px] text-gdim mt-0.5">{subtitle}</div>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-5'}>{children}</div>
    </div>
  );
}
