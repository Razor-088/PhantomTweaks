import React from 'react';

interface Props extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  noPadding?: boolean;
}

export function Card({ title, subtitle, actions, noPadding, className = '', children, ...rest }: Props) {
  return (
    <div className={`panel ${className}`} {...rest}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2 border-b border-gborder/60">
          <div className="min-w-0">
            {title && <div className="text-[13px] font-semibold text-gtext truncate">{title}</div>}
            {subtitle && <div className="text-[11px] text-gdim mt-0.5">{subtitle}</div>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-4'}>{children}</div>
    </div>
  );
}
