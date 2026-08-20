import React from 'react';

interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 animate-slideup">
      <div>
        <h2 className="text-[24px] font-extrabold tracking-tight text-gtext uppercase leading-tight">
          {title}
        </h2>
        {subtitle && <p className="text-[12px] text-gmuted mt-1.5 max-w-2xl leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
