import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Cpu, GpuIcon as Gpu, MemoryStick, Zap, RefreshCw, CheckCircle2, Shield, ArrowRight, Activity } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { LogoLarge } from '../components/Logo';
import { cls } from '../lib/format';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { HealthReport, OptimizationPreview } from '../lib/types';

/* Animated counter hook */
function useAnimatedNumber(target: number, duration = 800): number {
  const [current, setCurrent] = useState(0);
  const frameRef = useRef<number>(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const start = performance.now();
    fromRef.current = current;
    const from = fromRef.current;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const val = Math.round(from + (target - from) * ease);
      setCurrent(val);
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);
  return current;
}

function ScoreCircle({ score, size = 120, strokeWidth = 8 }: { score: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#00ff88' : score >= 45 ? '#ffb84d' : '#ff4d6d';
  const animScore = useAnimatedNumber(score, 1200);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--color-gborder)" strokeWidth={strokeWidth} opacity={0.4} />
        {/* Glow */}
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth + 4} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} opacity={0.15}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
        {/* Fill */}
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22, 1, 0.36, 1)', filter: `drop-shadow(0 0 10px ${color}60)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[30px] font-extrabold font-mono leading-none" style={{ color, textShadow: `0 0 20px ${color}50` }}>
          {animScore}
        </span>
        <span className="text-[9px] text-gdim uppercase tracking-[0.15em] font-bold mt-1">Score</span>
      </div>
    </div>
  );
}

function LiveBar({ icon: Icon, label, value, barClass, valueText }: { icon: typeof Cpu; label: string; value: number; barClass: string; valueText?: string }) {
  const animVal = useAnimatedNumber(Math.round(value), 600);
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-gpanel2/40 border border-gborder/30 hover:border-gborder2/50 transition-all duration-300 stat-card">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300 ${
        barClass.includes('accent') ? 'bg-gaccent/10' : barClass.includes('warn') ? 'bg-gwarn/10' : barClass.includes('danger') ? 'bg-gdanger/10' : 'bg-gpanel3'
      }`}>
        <Icon size={18} className={barClass.includes('accent') ? 'text-gaccent' : barClass.includes('warn') ? 'text-gwarn' : barClass.includes('danger') ? 'text-gdanger' : 'text-gdim'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-[0.14em] text-gdim font-semibold">{label}</span>
          <span className="font-mono text-[13px] font-bold text-gtext">{valueText ?? `${animVal}%`}</span>
        </div>
        <ProgressBar value={value} barClassName={barClass} height={5} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const setPage = useAppStore((s) => s.setPage);
  const setBadges = useAppStore((s) => s.setBadges);
  const cpuPct = useAppStore((s) => s.snapshot?.cpu.pct ?? 0);
  const gpuPct = useAppStore((s) => s.snapshot?.gpu.pct);
  const ramPct = useAppStore((s) => s.snapshot?.ram.pct ?? 0);
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [opt, setOpt] = useState<OptimizationPreview | null>(null);
  const [optLoading, setOptLoading] = useState(true);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    const h = await api.system.health().catch(() => null);
    setHealth(h);
    setHealthLoading(false);
  }, []);

  const loadOpt = useCallback(async () => {
    setOptLoading(true);
    const p = await api.optimization.scan().catch(() => null);
    setOpt(p);
    setOptLoading(false);
    if (p && p.availableCount > 0) setBadges({ optimizer: p.availableCount });
  }, [setBadges]);

  useEffect(() => {
    loadHealth();
    loadOpt();
  }, [loadHealth, loadOpt]);

  const cpu = cpuPct;
  const gpu = gpuPct;
  const ram = ramPct;

  return (
    <div className="max-w-[1200px] mx-auto animate-pageload">
      {/* Hero Section */}
      <div className="relative mb-6 p-6 rounded-2xl overflow-hidden border border-gborder/30" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-gpanel) 80%, transparent), var(--color-gpanel2))' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-gaccent/5 via-transparent to-ginfo/3 pointer-events-none" />
        <div className="absolute top-0 right-0 w-40 h-40 bg-gaccent/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-6">
          <LogoLarge />
          <div className="flex-1">
            <h2 className="text-2xl font-extrabold text-gtext tracking-wide">
              {t('dashboard.title')}
            </h2>
            <p className="text-[13px] text-gdim mt-1 max-w-md">{t('dashboard.subtitle')}</p>
          </div>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} loading={healthLoading} onClick={() => { loadHealth(); loadOpt(); }}>
            {t('dashboard.refreshHealth')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5 stagger">
        {/* Health Score Card */}
        <Card variant="glow" className="relative overflow-hidden shimmer-sweep">
          <div className="absolute inset-0 bg-gradient-to-br from-gaccent/5 via-transparent to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gaccent/10 flex items-center justify-center shadow-[0_0_12px_rgba(0,255,136,0.1)]">
                  <Shield size={18} className="text-gaccent" />
                </div>
                <div>
                  <h3 className="text-[13px] font-bold text-gtext">{t('dashboard.statusTitle')}</h3>
                  <p className="text-[10.5px] text-gdim mt-0.5">{t('dashboard.statusSubtitle')}</p>
                </div>
              </div>
              {health && (
                <StatusBadge tone={health.score >= 70 ? 'ok' : health.score >= 45 ? 'warn' : 'bad'}>
                  {t(`health.${health.label.toLowerCase()}`)}
                </StatusBadge>
              )}
            </div>

            {healthLoading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : health ? (
              <div className="flex items-start gap-8">
                <ScoreCircle score={health.score} size={120} strokeWidth={8} />
                <div className="flex-1 space-y-3 mt-1">
                  {health.factors.map((f, i) => (
                    <div key={f.name} className="flex items-center gap-2.5 animate-slideleft" style={{ animationDelay: `${i * 0.06}s` }}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${f.status === 'ok' ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : f.status === 'warn' ? 'bg-gwarn shadow-[0_0_8px_rgba(255,184,77,0.4)]' : 'bg-gdanger shadow-[0_0_8px_rgba(255,77,109,0.4)]'}`} />
                      <span className="text-[12px] text-gmuted flex-1 truncate">{f.name}</span>
                      <span className="text-[11px] text-gdim truncate max-w-[45%] font-mono">{f.detail}</span>
                    </div>
                  ))}
                  {health.factors.length === 0 && <div className="text-[12px] text-gdim">{t('health.noFactors')}</div>}
                </div>
              </div>
            ) : (
              <div className="text-[12px] text-gdim py-4">{t('health.failed')}</div>
            )}
          </div>
        </Card>

        {/* Optimization Card */}
        <Card variant="glow" className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-gaccent/3 via-transparent to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gaccent/10 flex items-center justify-center shadow-[0_0_12px_rgba(0,255,136,0.1)]">
                  <Zap size={18} className="text-gaccent" />
                </div>
                <div>
                  <h3 className="text-[13px] font-bold text-gtext">{t('optimization.title')}</h3>
                  <p className="text-[10.5px] text-gdim mt-0.5">{t('dashboard.optSubtitle')}</p>
                </div>
              </div>
            </div>

            {optLoading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : opt ? (
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-3 flex-wrap">
                  {opt.availableCount > 0 ? (
                    <>
                      <StatusBadge tone="active" dot>
                        <span className="font-mono font-bold">{opt.availableCount}</span> {t('optimization.available', { n: opt.availableCount })}
                      </StatusBadge>
                      {opt.requiresAdmin > 0 && (
                        <StatusBadge tone="warn">
                          {t('optimization.adminCount', { n: opt.requiresAdmin })}
                        </StatusBadge>
                      )}
                    </>
                  ) : (
                    <span className="flex items-center gap-2 text-[13px] text-green-400 font-semibold">
                      <CheckCircle2 size={16} className="drop-shadow-[0_0_6px_rgba(74,222,128,0.5)]" /> {t('optimization.optimized')}
                    </span>
                  )}
                </div>
                {opt.lastRun && (
                  <div className="text-[11px] text-gdim font-mono">{t('optimization.lastRun', { date: opt.lastRun })}</div>
                )}
                <Button size="lg" icon={<ArrowRight size={16} />} onClick={() => setPage('optimizer')} className="w-full">
                  {t('optimization.runButton')}
                </Button>
              </div>
            ) : (
              <div className="text-[12px] text-gdim py-4">{t('optimization.error')}</div>
            )}
          </div>
        </Card>
      </div>

      {/* Live Performance */}
      <Card variant="glass" title={
        <span className="flex items-center gap-2">
          <Activity size={15} className="text-gaccent" />
          {t('dashboard.liveTitle')}
        </span>
      } subtitle={t('dashboard.liveSubtitle')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
          <LiveBar icon={Cpu} label={t('topbar.cpu')} value={cpu} barClass={cls(cpu)} />
          <LiveBar icon={Gpu} label={t('topbar.gpu')} value={gpu ?? 0} barClass={gpu != null ? cls(gpu) : 'bg-gborder2'} valueText={gpu != null ? `${Math.round(gpu)}%` : '—'} />
          <LiveBar icon={MemoryStick} label={t('topbar.ram')} value={ram} barClass={cls(ram)} />
        </div>
      </Card>
    </div>
  );
}
