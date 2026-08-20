import { useState } from 'react';
import {
  MemoryStick,
  FlaskConical,
  RefreshCw,
  Wrench,
  Cpu,
  Activity,
  Gauge,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/i18n';
import { ProgressBar } from './ui/ProgressBar';
import { Card } from './ui/Card';

type ActionId = 'memory' | 'standby' | 'dns' | 'maintenance';

const ACTIONS: Array<{
  id: ActionId;
  labelKey: string;
  descKey: string;
  icon: typeof MemoryStick;
  tone: string;
  box: string;
}> = [
  { id: 'memory', labelKey: 'rt.memory', descKey: 'rt.memoryDesc', icon: MemoryStick, tone: 'text-gaccent', box: 'bg-gaccent-dim' },
  { id: 'standby', labelKey: 'rt.standby', descKey: 'rt.standbyDesc', icon: FlaskConical, tone: 'text-ginfo', box: 'bg-ginfo/10' },
  { id: 'dns', labelKey: 'rt.dns', descKey: 'rt.dnsDesc', icon: RefreshCw, tone: 'text-gwarn', box: 'bg-gwarn/10' },
  { id: 'maintenance', labelKey: 'rt.maintenance', descKey: 'rt.maintenanceDesc', icon: Wrench, tone: 'text-gaccent2', box: 'bg-gaccent2/10' },
];

function Bar({ icon, label, value, display, color }: { icon: React.ReactNode; label: string; value: number; display: string; color: string }) {
  const textColor = color.includes('danger') ? '#ff4d6d' : color.includes('warn') ? '#ffb84d' : color.includes('info') ? '#4dc3ff' : color.includes('accent2') ? '#00d66b' : '#00ff88';
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-widest text-gdim">
          {icon}
          {label}
        </span>
        <span className="font-mono text-[13px] font-semibold" style={{ color: textColor }}>
          {display}
        </span>
      </div>
      <ProgressBar
        value={value}
        barClassName={color}
        className="bg-gbase3"
        height={7}
        animated
      />
    </div>
  );
}

export function RealTimeOptimizer({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const snapshot = useAppStore((s) => s.snapshot);
  const toast = useAppStore((s) => s.toast);
  const [busy, setBusy] = useState<ActionId | null>(null);

  const run = async (id: ActionId) => {
    setBusy(id);
    try {
      const a = ACTIONS.find((x) => x.id === id)!;
      if (id === 'dns') {
        await api.network.flushDns();
        toast('success', t('rt.dnsDone'), t('rt.dnsDoneDesc'));
      } else if (id === 'maintenance') {
        const r = await api.maintenance.run();
        toast(r.ok ? 'success' : 'warning', t('rt.maintenance'), r.message);
      } else if (id === 'memory') {
        const r = await api.rt.memoryClean();
        toast(r.ok ? 'success' : 'warning', t('rt.memoryDone'), r.message);
      } else {
        const r = await api.rt.cleanStandby();
        toast(r.ok ? 'success' : 'warning', t(a.labelKey), r.message);
      }
    } catch (e: any) {
      toast('error', t('common.error'), e.message);
    } finally {
      setBusy(null);
    }
  };

  const cpu = snapshot?.cpu.pct ?? 0;
  const ram = snapshot?.ram.pct ?? 0;
  const gpu = snapshot?.gpu.pct;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Gauge size={15} className="text-gaccent" />
          {t('rt.title')}
        </span>
      }
      subtitle={t('rt.subtitleLive')}
      className={compact ? '' : 'relative overflow-hidden shimmer-sweep'}
    >
      {!compact && <div className="scanline" />}

      {snapshot ? (
        <div className={`flex gap-4 ${compact ? 'flex-wrap' : 'flex-col sm:flex-row'}`}>
          <Bar icon={<Cpu size={12} className="text-gaccent" />} label="CPU" value={cpu} display={`${cpu}%`} color={cpu >= 85 ? 'bg-gdanger' : cpu >= 60 ? 'bg-gwarn' : 'bg-gaccent'} />
          <Bar icon={<MemoryStick size={12} className="text-ginfo" />} label="RAM" value={ram} display={`${ram}% · ${snapshot.ram.usedGb}/${snapshot.ram.totalGb} GB`} color={ram >= 85 ? 'bg-gdanger' : ram >= 60 ? 'bg-gwarn' : 'bg-ginfo'} />
          {gpu != null && (
            <Bar icon={<Activity size={12} className="text-gaccent2" />} label="GPU" value={gpu} display={`${gpu}%`} color={gpu >= 85 ? 'bg-gdanger' : gpu >= 60 ? 'bg-gwarn' : 'bg-gaccent2'} />
          )}
        </div>
      ) : (
        <div className="text-[12px] text-gdim animate-blink">{t('rt.connecting')}</div>
      )}

      <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 lg:grid-cols-4'} mt-4`}>
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          const loading = busy === a.id;
          const disabled = busy !== null;
          return (
            <button
              key={a.id}
              onClick={() => run(a.id)}
              disabled={disabled}
              className={`panel panel-hover p-3 text-left group disabled:opacity-60 disabled:pointer-events-none ${
                loading ? 'border-gaccent/60' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-8 h-8 rounded-lg ${a.box} flex items-center justify-center`}>
                  <Icon size={15} className={loading ? 'animate-spin text-gaccent' : a.tone} />
                </span>
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-gtext truncate">{t(a.labelKey)}</div>
                  <div className="text-[10px] text-gdim leading-tight">{t(a.descKey)}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
