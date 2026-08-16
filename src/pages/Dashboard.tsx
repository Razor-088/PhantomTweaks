import { useEffect, useState } from 'react';
import { Cpu, GpuIcon as Gpu, MemoryStick, Zap, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { cls } from '../lib/format';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { HealthReport, OptimizationPreview } from '../lib/types';

function LiveBar({ icon: Icon, label, value, barClass, valueText }: { icon: typeof Cpu; label: string; value: number; barClass: string; valueText?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gpanel2 border border-gborder">
      <Icon size={17} className="text-gaccent shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10.5px] uppercase tracking-wider text-gdim">{label}</span>
          <span className="font-mono text-[12.5px] font-semibold text-gtext">{valueText ?? `${Math.round(value)}%`}</span>
        </div>
        <ProgressBar value={value} barClassName={barClass} height={6} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const setPage = useAppStore((s) => s.setPage);
  const snapshot = useAppStore((s) => s.snapshot);
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [opt, setOpt] = useState<OptimizationPreview | null>(null);
  const [optLoading, setOptLoading] = useState(true);

  const loadHealth = async () => {
    setHealthLoading(true);
    const h = await api.system.health().catch(() => null);
    setHealth(h);
    setHealthLoading(false);
  };

  const loadOpt = async () => {
    setOptLoading(true);
    const p = await api.optimization.scan().catch(() => null);
    setOpt(p);
    setOptLoading(false);
  };

  useEffect(() => {
    loadHealth();
    loadOpt();
  }, []);

  const healthColor = health ? (health.score >= 70 ? '#00ff88' : health.score >= 45 ? '#ffb84d' : '#ff4d6d') : '#00ff88';
  const cpu = snapshot?.cpu.pct ?? 0;
  const gpu = snapshot?.gpu.pct;
  const ram = snapshot?.ram.pct ?? 0;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} loading={healthLoading} onClick={loadHealth}>
            {t('dashboard.refreshHealth')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title={t('dashboard.statusTitle')}
          subtitle={t('dashboard.statusSubtitle')}
          actions={health ? <StatusBadge tone={health.score >= 70 ? 'ok' : health.score >= 45 ? 'warn' : 'bad'}>{t(`health.${health.label.toLowerCase()}`)}</StatusBadge> : undefined}
        >
          {healthLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : health ? (
            <div>
              <div className="flex items-end justify-between mb-1.5">
                <span className="text-[12px] text-gdim">{t('dashboard.score')}</span>
                <span className="font-mono text-[28px] font-bold leading-none" style={{ color: healthColor, textShadow: `0 0 14px ${healthColor}55` }}>
                  {health.score}%
                </span>
              </div>
              <ProgressBar value={health.score} barClassName={healthColor === '#ffb84d' ? 'bg-gwarn' : healthColor === '#ff4d6d' ? 'bg-gdanger' : 'bg-gaccent'} height={10} />
              <div className="mt-4 space-y-2">
                {health.factors.map((f) => (
                  <div key={f.name} className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.status === 'ok' ? 'bg-gaccent' : f.status === 'warn' ? 'bg-gwarn' : 'bg-gdanger'}`}
                    />
                    <span className="text-[12px] text-gmuted flex-1 truncate">{f.name}</span>
                    <span className="text-[11.5px] text-gdim truncate max-w-[45%]">{f.detail}</span>
                  </div>
                ))}
                {health.factors.length === 0 && <div className="text-[12px] text-gdim">{t('health.noFactors')}</div>}
              </div>
            </div>
          ) : (
            <div className="text-[12px] text-gdim">{t('health.failed')}</div>
          )}
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <Zap size={14} className="text-gaccent" />
              {t('optimization.title')}
            </span>
          }
          subtitle={t('dashboard.optSubtitle')}
        >
          {optLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : opt ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5 flex-wrap">
                {opt.availableCount > 0 ? (
                  <>
                    <StatusBadge tone="active" dot>
                      <span className="font-mono">{opt.availableCount}</span> {t('optimization.available', { n: opt.availableCount })}
                    </StatusBadge>
                    {opt.requiresAdmin > 0 && (
                      <StatusBadge tone="warn">
                        {t('optimization.adminCount', { n: opt.requiresAdmin })}
                      </StatusBadge>
                    )}
                  </>
                ) : (
                  <span className="flex items-center gap-1.5 text-[13px] text-gaccent">
                    <CheckCircle2 size={15} /> {t('optimization.optimized')}
                  </span>
                )}
              </div>
              {opt.lastRun && (
                <div className="text-[11.5px] text-gdim">{t('optimization.lastRun', { date: opt.lastRun })}</div>
              )}
              <Button size="lg" icon={<Zap size={16} />} onClick={() => setPage('optimizer')}>
                {t('optimization.runButton')}
              </Button>
            </div>
          ) : (
            <div className="text-[12px] text-gdim">{t('optimization.error')}</div>
          )}
        </Card>
      </div>

      <Card className="mt-4" title={t('dashboard.liveTitle')} subtitle={t('dashboard.liveSubtitle')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <LiveBar icon={Cpu} label={t('topbar.cpu')} value={cpu} barClass={cls(cpu)} />
          <LiveBar
            icon={Gpu}
            label={t('topbar.gpu')}
            value={gpu ?? 0}
            barClass={gpu != null ? cls(gpu) : 'bg-gborder2'}
            valueText={gpu != null ? `${Math.round(gpu)}%` : '—'}
          />
          <LiveBar icon={MemoryStick} label={t('topbar.ram')} value={ram} barClass={cls(ram)} />
        </div>
      </Card>
    </div>
  );
}
