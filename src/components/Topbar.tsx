import React from 'react';
import { Cpu, GpuIcon as Gpu, MemoryStick, Network, ShieldAlert, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { cls } from '../lib/format';
import { useI18n } from '../lib/i18n';

const LIVE_PAGES = new Set(['dashboard', 'performance', 'gaminghub']);

function MetricPill({ icon: Icon, label, value, pct }: { icon: typeof Cpu; label: string; value: string; pct: number }) {
  const isHigh = pct >= 80;
  const isMed = pct >= 50;
  const accentClass = isHigh ? 'text-gdanger' : isMed ? 'text-gwarn' : 'text-gaccent';
  const bgClass = isHigh ? 'bg-gdanger/10' : isMed ? 'bg-gwarn/10' : 'bg-gaccent/10';
  const borderClass = isHigh ? 'border-gdanger/15' : isMed ? 'border-gwarn/15' : 'border-gaccent/15';
  const glowClass = isHigh ? 'shadow-[0_0_12px_rgba(255,77,109,0.15)]' : isMed ? 'shadow-[0_0_12px_rgba(255,184,77,0.12)]' : 'shadow-[0_0_12px_rgba(0,255,136,0.1)]';

  return (
    <div className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-gpanel/50 border ${borderClass} backdrop-blur-sm hover:border-gborder2/60 transition-all duration-300 stat-card ${glowClass}`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${bgClass} transition-colors duration-300`}>
        <Icon size={15} className={accentClass} />
      </div>
      <div className="leading-none">
        <div className="text-[9px] uppercase tracking-[0.14em] text-gdim font-semibold">{label}</div>
        <div className={`text-[13px] font-mono font-bold mt-0.5 ${accentClass}`}>{value}</div>
      </div>
      {/* Mini bar */}
      <div className="w-8 h-1 rounded-full bg-gborder/50 overflow-hidden ml-1">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isHigh ? 'bg-gdanger' : isMed ? 'bg-gwarn' : 'bg-gaccent'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function Topbar() {
  const page = useAppStore((s) => s.page);
  const snapshot = useAppStore((s) => s.snapshot);
  const online = useAppStore((s) => s.online);
  const appInfo = useAppStore((s) => s.appInfo);
  const { t } = useI18n();

  const cpu = snapshot?.cpu.pct ?? 0;
  const gpu = snapshot?.gpu.pct;
  const ram = snapshot?.ram.pct ?? 0;
  const net = snapshot?.net;
  const showLive = LIVE_PAGES.has(page);

  return (
    <header
      className="relative z-10 flex items-center justify-between gap-4 h-[68px] px-6 border-b border-gborder/40 shrink-0"
      style={{
        background: 'linear-gradient(90deg, color-mix(in srgb, var(--color-gbase2) 80%, transparent), color-mix(in srgb, var(--color-gbase2) 65%, transparent))',
        backdropFilter: 'blur(16px) saturate(1.3)',
      }}
    >
      {/* Subtle bottom glow line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gaccent/10 to-transparent pointer-events-none" />

      <div className="flex items-center gap-3 min-w-0">
        <h1 className="font-extrabold text-[15px] text-gtext tracking-wide">
          Phantom<span className="text-gaccent text-glow">Tweaks</span>
        </h1>
        <span className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full transition-all duration-300 ${
          online
            ? 'text-gaccent bg-gaccent/8 border border-gaccent/15 shadow-[0_0_10px_rgba(0,255,136,0.1)]'
            : 'text-gwarn bg-gwarn/8 border border-gwarn/15'
        }`}>
          <span className={`relative w-1.5 h-1.5 rounded-full ${online ? 'bg-gaccent' : 'bg-gwarn'}`}>
            {online && <span className="absolute inset-0 rounded-full bg-gaccent live-dot" />}
          </span>
          {online ? t('topbar.online') : t('topbar.offline')}
        </span>
        {!appInfo?.isAdmin && (
          <span className="flex items-center gap-1 text-[11px] text-gwarn/80 bg-gwarn/5 border border-gwarn/15 rounded-full px-2 py-0.5">
            <ShieldAlert size={11} />
            {t('topbar.standardUser')}
          </span>
        )}
      </div>

      {showLive && (
        <div className="flex items-center gap-2 stagger">
          <MetricPill icon={Cpu} label={t('topbar.cpu')} value={`${Math.round(cpu)}%`} pct={cpu} />
          <MetricPill icon={Gpu} label={t('topbar.gpu')} value={gpu != null ? `${Math.round(gpu)}%` : '—'} pct={gpu ?? 0} />
          <MetricPill icon={MemoryStick} label={t('topbar.ram')} value={`${Math.round(ram)}%`} pct={ram} />
          <MetricPill
            icon={net ? (net.downMbps > net.upMbps ? TrendingDown : TrendingUp) : Activity}
            label={t('topbar.net')}
            value={net ? `↓${net.downMbps} ↑${net.upMbps}` : '—'}
            pct={net ? Math.min((net.downMbps / 100) * 100, 100) : 0}
          />
        </div>
      )}
    </header>
  );
}
