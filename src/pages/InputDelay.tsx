import { useEffect, useState, useMemo, useRef } from 'react';
import { Timer, CheckCircle2, Monitor, MousePointer, Zap, Power, RefreshCw, Globe, Rocket, ChevronDown, ChevronUp, Sparkles, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Spinner } from '../components/ui/Spinner';
import { useI18n } from '../lib/i18n';
import type { InputDelayItem } from '../lib/types';

const CATEGORY_META: Record<string, { icon: typeof Monitor; color: string; glow: string; bg: string; label: string }> = {
  display: { icon: Monitor, color: 'text-blue-400', glow: 'shadow-[0_0_12px_rgba(96,165,250,0.3)]', bg: 'bg-blue-500/10', label: 'Pantalla' },
  power: { icon: Power, color: 'text-red-400', glow: 'shadow-[0_0_12px_rgba(248,113,113,0.3)]', bg: 'bg-red-500/10', label: 'Energía' },
  mouse: { icon: MousePointer, color: 'text-purple-400', glow: 'shadow-[0_0_12px_rgba(192,132,252,0.3)]', bg: 'bg-purple-500/10', label: 'Ratón' },
  system: { icon: Zap, color: 'text-gaccent', glow: 'shadow-[0_0_12px_rgba(0,255,136,0.3)]', bg: 'bg-gaccent/10', label: 'Sistema' },
  network: { icon: Globe, color: 'text-cyan-400', glow: 'shadow-[0_0_12px_rgba(34,211,238,0.3)]', bg: 'bg-cyan-500/10', label: 'Red' },
};

const CATEGORY_ORDER = ['system', 'display', 'mouse', 'power', 'network'];

function useAnimatedNumber(target: number, duration = 800): number {
  const [current, setCurrent] = useState(0);
  const frameRef = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const from = current;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setCurrent(Math.round(from + (target - from) * ease));
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, duration]);
  return current;
}

function ScoreGauge({ score, size = 140 }: { score: number; size?: number }) {
  const animScore = useAnimatedNumber(score, 1200);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';
  const glowColor = score >= 80 ? 'rgba(34,197,94,0.3)' : score >= 50 ? 'rgba(234,179,8,0.3)' : 'rgba(239,68,68,0.3)';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* Outer glow ring */}
      <div className="absolute inset-[-8px] rounded-full" style={{ boxShadow: `0 0 30px ${glowColor}, inset 0 0 30px ${glowColor}` }} />
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--color-gborder)" strokeWidth={6} opacity={0.3} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22, 1, 0.36, 1)', filter: `drop-shadow(0 0 12px ${color}80)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[36px] font-extrabold font-mono leading-none" style={{ color, textShadow: `0 0 20px ${color}50` }}>
          {animScore}
        </span>
        <span className="text-[9px] text-gdim uppercase tracking-[0.18em] font-bold mt-1">/ 100</span>
      </div>
    </div>
  );
}

export default function InputDelay() {
  const { t } = useI18n();
  const toast = useAppStore((s) => s.toast);
  const [items, setItems] = useState<InputDelayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const scan = async () => {
    setLoading(true);
    const r = await api.inputDelay.scan().catch(() => []);
    setItems(r);
    setLoading(false);
  };

  useEffect(() => { scan(); }, []);

  const apply = async (id: string) => {
    setApplying(id);
    const r = await api.inputDelay.apply(id).catch(() => ({ ok: false, error: 'Error de conexión' }));
    setApplying(null);
    if (r.ok) {
      toast('success', t('inputDelay.applied'), t('inputDelay.appliedDesc'));
      scan();
    } else {
      toast('error', t('common.error'), r.error || t('inputDelay.applyError'));
    }
  };

  const applyAll = async () => {
    setApplyingAll(true);
    const r = await api.inputDelay.applyAll().catch(() => ({ ok: false, applied: 0, failed: 0, errors: ['Error de conexión'] }));
    setApplyingAll(false);
    if (r.applied > 0) {
      toast('success', t('inputDelay.appliedAll'), t('inputDelay.appliedAllDesc', { n: r.applied }));
    }
    if (r.failed > 0) {
      toast('warning', t('inputDelay.someFailed'), t('inputDelay.someFailedDesc', { n: r.failed }));
    }
    scan();
  };

  const applied = items.filter((i) => i.applied).length;
  const total = items.length;
  const score = total > 0 ? Math.round((applied / total) * 100) : 0;

  const grouped = useMemo(() => {
    const groups: Record<string, InputDelayItem[]> = {};
    for (const item of items) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [items]);

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="max-w-[1200px] mx-auto animate-pageload">
      <PageHeader
        title={t('inputDelay.title')}
        subtitle={t('inputDelay.subtitle')}
        actions={
          <div className="flex gap-2">
            {applied < total && (
              <Button variant="primary" size="sm" icon={<Rocket size={14} />} loading={applyingAll} onClick={applyAll}>
                {t('inputDelay.applyAll')}
              </Button>
            )}
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={scan}>
              {t('common.refresh')}
            </Button>
          </div>
        }
      />

      {/* Hero Score Card */}
      <div className="mb-6 relative rounded-2xl overflow-hidden border border-gborder/30" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-gpanel) 80%, transparent), var(--color-gpanel2))' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-gaccent/5 via-transparent to-transparent pointer-events-none" />
        <div className="scanline" />
        <div className="relative flex items-center gap-8 p-6">
          <ScoreGauge score={score} size={150} />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-[18px] font-extrabold text-gtext">{t('inputDelay.latencyScore')}</h3>
              <StatusBadge tone={score >= 80 ? 'ok' : score >= 50 ? 'warn' : 'bad'} dot>
                {score >= 80 ? 'Excelente' : score >= 50 ? 'Mejorable' : 'Crítico'}
              </StatusBadge>
            </div>
            <p className="text-[12px] text-gmuted leading-relaxed mb-5 max-w-md">
              {score >= 80 ? t('inputDelay.scoreGreat') : score >= 50 ? t('inputDelay.scoreOk') : t('inputDelay.scoreBad')}
            </p>
            <div className="flex gap-5">
              <div className="px-4 py-2.5 rounded-xl bg-green-500/8 border border-green-500/15">
                <div className="text-[20px] font-extrabold font-mono text-green-400">{applied}</div>
                <div className="text-[9px] text-gdim uppercase tracking-[0.14em] font-semibold">{t('inputDelay.applied')}</div>
              </div>
              <div className="px-4 py-2.5 rounded-xl bg-yellow-500/8 border border-yellow-500/15">
                <div className="text-[20px] font-extrabold font-mono text-yellow-400">{total - applied}</div>
                <div className="text-[9px] text-gdim uppercase tracking-[0.14em] font-semibold">{t('inputDelay.pending')}</div>
              </div>
              <div className="px-4 py-2.5 rounded-xl bg-gpanel3/60 border border-gborder/40">
                <div className="text-[20px] font-extrabold font-mono text-gtext">{total}</div>
                <div className="text-[9px] text-gdim uppercase tracking-[0.14em] font-semibold">{t('inputDelay.total')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Groups */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={28} /></div>
      ) : (
        <div className="space-y-5 stagger">
          {CATEGORY_ORDER.map((cat) => {
            const catItems = grouped[cat];
            if (!catItems || catItems.length === 0) return null;
            const meta = CATEGORY_META[cat] || { icon: Zap, color: 'text-gdim', glow: '', bg: 'bg-gpanel3', label: cat };
            const Icon = meta.icon;
            const catApplied = catItems.filter(i => i.applied).length;
            const catPct = Math.round((catApplied / catItems.length) * 100);
            const isCollapsed = collapsed.has(cat);

            return (
              <div key={cat}>
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(cat)}
                  className="flex items-center gap-3 w-full mb-3 group p-3 rounded-xl hover:bg-gpanel2/40 transition-all duration-300"
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta.bg} ${meta.glow} transition-shadow duration-300`}>
                    <Icon size={17} className={meta.color} />
                  </div>
                  <div className="text-left">
                    <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-gtext group-hover:text-gaccent transition-colors">
                      {meta.label}
                    </span>
                    <div className="text-[10px] text-gdim font-mono mt-0.5">{catApplied}/{catItems.length} optimizados</div>
                  </div>
                  {/* Mini progress bar */}
                  <div className="flex-1 mx-3">
                    <div className="h-1.5 bg-gbase3 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${catPct === 100 ? 'bg-green-400' : catPct > 0 ? 'bg-gaccent' : 'bg-gborder'}`}
                        style={{ width: `${catPct}%` }}
                      />
                    </div>
                  </div>
                  <ChevronDown size={14} className={`text-gdim transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} />
                </button>

                {/* Items */}
                {!isCollapsed && (
                  <div className="space-y-2.5 ml-2 pl-4 border-l-2 border-gborder/30">
                    {catItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className={`relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 animate-slideleft ${
                          item.applied
                            ? 'border-green-500/20 bg-green-500/3 hover:bg-green-500/5'
                            : 'border-gborder/30 bg-gpanel/40 hover:border-gborder2/50 hover:bg-gpanel2/40'
                        }`}
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        {/* Applied indicator line */}
                        {item.applied && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                        )}

                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 ${
                          item.applied ? 'bg-green-500/10 shadow-[0_0_10px_rgba(74,222,128,0.15)]' : `${meta.bg}`
                        }`}>
                          {item.applied ? (
                            <CheckCircle2 size={20} className="text-green-400 drop-shadow-[0_0_6px_rgba(74,222,128,0.5)]" />
                          ) : (
                            <Icon size={20} className={meta.color} />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-gtext">{item.name}</span>
                            {item.applied && (
                              <StatusBadge tone="ok"><CheckCircle2 size={10} /> {t('common.on')}</StatusBadge>
                            )}
                          </div>
                          <p className="text-[11px] text-gmuted mt-0.5 leading-relaxed">{item.description}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gpanel3/60">
                              <span className="text-[9px] text-gdim uppercase tracking-wider">{t('inputDelay.before')}</span>
                              <span className="text-[11px] text-gwarn font-mono font-bold">{item.before}</span>
                            </div>
                            <ArrowRight size={12} className="text-gaccent" />
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gaccent/8 border border-gaccent/15">
                              <span className="text-[9px] text-gdim uppercase tracking-wider">{t('inputDelay.after')}</span>
                              <span className="text-[11px] text-gaccent font-mono font-bold">{item.after}</span>
                            </div>
                          </div>
                        </div>

                        {!item.applied && (
                          <Button variant="primary" size="sm" loading={applying === item.id} onClick={() => apply(item.id)} className="shrink-0">
                            {t('common.apply')}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
