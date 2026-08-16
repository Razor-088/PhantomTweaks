import React from 'react';
import { ProgressBar } from './ui/ProgressBar';
import { LiveChart } from './ui/LiveChart';
import { cls } from '../lib/format';

interface Props {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  display: string;
  detail?: string;
  history: number[];
  footer?: React.ReactNode;
  warnThreshold?: number;
}

export function MonitorCard({ icon, label, value, display, detail, history, footer, warnThreshold = 85 }: Props) {
  const pct = value ?? 0;
  const color = value == null ? '#6f7c76' : pct >= warnThreshold ? '#ff4d6d' : pct >= 60 ? '#ffb84d' : '#00ff88';
  return (
    <div className="panel panel-hover p-4 flex flex-col gap-2.5 hover:border-gborder2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-gaccent transition-transform duration-300 ${value != null && pct >= warnThreshold ? 'animate-pulse-soft' : ''}`}>{icon}</span>
          <span className="text-[11px] uppercase tracking-widest text-gdim">{label}</span>
        </div>
        <span className="font-mono text-[22px] font-bold leading-none" style={{ color }}>
          {display}
        </span>
      </div>
      {value != null && (
        <ProgressBar
          value={pct}
          barClassName={pct >= warnThreshold ? 'bg-gdanger' : pct >= 60 ? 'bg-gwarn' : 'bg-gaccent'}
          className="bg-gbase3"
        />
      )}
      {detail && <div className="text-[11.5px] text-gmuted">{detail}</div>}
      {history.length > 1 && <LiveChart data={history} color={color} height={56} />}
      {footer && <div className="text-[11px] text-gdim">{footer}</div>}
    </div>
  );
}
