import React from 'react';
import { Cpu, GpuIcon as Gpu, MemoryStick, Network, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { cls } from '../lib/format';
import { useI18n } from '../lib/i18n';

const Mini = React.memo(function Mini({ icon: Icon, label, value, color }: { icon: typeof Cpu; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gpanel border border-gborder">
      <Icon size={15} className={color} />
      <div className="leading-none">
        <div className="text-[9px] uppercase tracking-wider text-gdim">{label}</div>
        <div className="text-[12px] font-mono font-semibold text-gtext mt-0.5">{value}</div>
      </div>
    </div>
  );
});

const LIVE_PAGES = new Set(['dashboard', 'performance', 'gaming']);

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
    <header className="relative z-10 flex items-center justify-between gap-4 h-[58px] px-5 border-b border-gborder bg-gbase2/80 backdrop-blur shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="font-semibold text-[15px] text-gtext tracking-wide">
          PhantomTweaks
        </h1>
        <span className={`flex items-center gap-1.5 text-[11px] font-medium ${online ? 'text-gaccent' : 'text-gwarn'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-gaccent animate-pulse-soft' : 'bg-gwarn'}`} />
          {online ? t('topbar.online') : t('topbar.offline')}
        </span>
        {!appInfo?.isAdmin && (
          <span className="flex items-center gap-1 text-[11px] text-gwarn/90">
            <ShieldCheck size={12} />
            {t('topbar.standardUser')}
          </span>
        )}
      </div>

      {showLive && (
        <div className="flex items-center gap-2">
          <Mini icon={Cpu} label={t('topbar.cpu')} value={`${Math.round(cpu)}%`} color={cls(cpu)} />
          <Mini icon={Gpu} label={t('topbar.gpu')} value={gpu != null ? `${Math.round(gpu)}%` : '—'} color={gpu != null ? cls(gpu) : 'text-gdim'} />
          <Mini icon={MemoryStick} label={t('topbar.ram')} value={`${Math.round(ram)}%`} color={cls(ram)} />
          <Mini icon={Network} label={t('topbar.net')} value={net ? `↓${net.downMbps} ↑${net.upMbps}` : '—'} color="text-gmuted" />
        </div>
      )}
    </header>
  );
}
