import { useEffect, useState, useCallback, useRef } from 'react';
import {
  MonitorDot, Thermometer, Zap, Gauge, RefreshCw, CheckCircle2,
  AlertTriangle, Settings, Flame, Gem, Scale, Crosshair, Shield,
  Paintbrush, Cpu, Wind, Activity, Wifi, HardDrive, ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { useI18n } from '../lib/i18n';
import type { NvidiaPreset, NvidiaSystemInfo } from '../lib/types';

function AnimatedValue({ target, suffix = '' }: { target: number | null; suffix?: string }) {
  const [val, setVal] = useState(0);
  const frameRef = useRef(0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (target == null) return;
    const start = performance.now();
    fromRef.current = val;
    const from = fromRef.current;
    const step = (now: number) => {
      const t = Math.min((now - start) / 600, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(from + (target - from) * ease));
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target]);
  return <>{target != null ? val : '—'}{suffix}</>;
}

function VramBar({ used, total }: { used: number | null; total: number }) {
  const pct = used !== null ? Math.min((used / total) * 100, 100) : 0;
  const color = pct > 85 ? '#ef4444' : pct > 60 ? '#eab308' : '#76b900';
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-gdim font-mono">{used != null ? `${used} MB` : '—'}</span>
        <span className="text-gdim font-mono">{total} MB</span>
      </div>
      <div className="w-full h-2 bg-gbase3 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 10px ${color}80` }}
        />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, barPct, barColor }: {
  icon: typeof Cpu; label: string; value: React.ReactNode; color: string; barPct?: number; barColor?: string;
}) {
  return (
    <div className="bg-gpanel2/50 border border-gborder/30 rounded-2xl p-4 stat-card">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={17} />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gdim">{label}</span>
      </div>
      <div className="text-[22px] font-extrabold font-mono text-gtext leading-none mb-1">{value}</div>
      {barPct != null && (
        <div className="mt-3 h-1.5 bg-gbase3 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${barPct}%`, background: barColor || 'var(--color-gaccent)', boxShadow: `0 0 8px ${barColor || 'var(--color-gaccent)'}60` }}
          />
        </div>
      )}
    </div>
  );
}

type NvidiaTab = 'overview' | 'tweaks' | 'advanced';

export default function NvidiaSettings() {
  const { t } = useI18n();
  const toast = useAppStore((s) => s.toast);
  const [info, setInfo] = useState<NvidiaSystemInfo | null>(null);
  const [presets, setPresets] = useState<NvidiaPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showSmi, setShowSmi] = useState(false);
  const [smiOutput, setSmiOutput] = useState('');
  const [quickBusy, setQuickBusy] = useState<string | null>(null);
  const [powerLimit, setPowerLimit] = useState<number>(0);
  const [maxFps, setMaxFps] = useState<number>(0);
  const [preRender, setPreRender] = useState<number>(2);
  const [tab, setTab] = useState<NvidiaTab>('overview');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scan = async () => {
    setLoading(true);
    try {
      const [sysInfo, presetList] = await Promise.all([api.nvidia.systemInfo(), api.nvidia.presets()]);
      setInfo(sysInfo);
      setPresets(presetList);
      if (sysInfo.gpus[0]?.powerLimitW) setPowerLimit(sysInfo.gpus[0].powerLimitW);
    } catch {
      setInfo({ available: false, gpus: [], driverOutdated: false, driverVersion: null });
    }
    setLoading(false);
  };

  const refreshGpu = useCallback(async () => {
    try { const gpus = await api.nvidia.gpus(); setInfo((p) => p ? { ...p, gpus } : p); } catch { /* */ }
  }, []);

  useEffect(() => { scan(); }, []);

  const refreshGpuSilent = useCallback(async () => {
    if (tab !== 'overview' || !info?.available || document.hidden) return;
    try { const gpus = await api.nvidia.gpus(); setInfo((p) => p ? { ...p, gpus } : p); } catch { /* */ }
  }, [tab, info?.available]);

  useEffect(() => {
    if (tab === 'overview' && info?.available) {
      pollRef.current = setInterval(refreshGpuSilent, 15000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
    if (pollRef.current) clearInterval(pollRef.current);
  }, [tab, info?.available, refreshGpuSilent]);

  const applyPreset = async (id: string) => {
    setApplying(id);
    const r = await api.nvidia.applyPreset(id).catch(() => ({ ok: false, applied: [], errors: ['Error'] }));
    setApplying(null);
    if (r.ok) { setActivePreset(id); toast('success', t('nvidia.applied'), t('nvidia.appliedDesc')); }
    else toast('error', t('common.error'), r.errors[0] || t('nvidia.applyError'));
  };

  const loadSmi = async () => { setSmiOutput(await api.nvidia.smi().catch(() => 'No disponible')); setShowSmi(true); };

  const applyQuick = useCallback(async (s: string) => {
    setQuickBusy(s);
    const r = await api.nvidia.quickSetting(s).catch(() => ({ ok: false, message: 'Error' }));
    setQuickBusy(null);
    if (r.ok) toast('success', t('nvidia.appliedSetting'), r.message);
    else toast('error', t('common.error'), r.message);
  }, [toast, t]);

  const applyPowerLimit = useCallback(async () => {
    const r = await api.nvidia.powerLimit(powerLimit).catch(() => ({ ok: false, message: 'Error' }));
    if (r.ok) toast('success', t('nvidia.appliedSetting'), r.message);
    else toast('error', t('common.error'), r.message);
  }, [powerLimit, toast, t]);

  const applyMaxFps = useCallback(async () => {
    const r = await api.nvidia.maxFps(maxFps).catch(() => ({ ok: false, message: 'Error' }));
    if (r.ok) toast('success', t('nvidia.appliedSetting'), r.message);
    else toast('error', t('common.error'), r.message);
  }, [maxFps, toast, t]);

  const applyPreRender = useCallback(async () => {
    const r = await api.nvidia.preRender(preRender).catch(() => ({ ok: false, message: 'Error' }));
    if (r.ok) toast('success', t('nvidia.appliedSetting'), r.message);
    else toast('error', t('common.error'), r.message);
  }, [preRender, toast, t]);

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <PageHeader title={t('nvidia.title')} subtitle={t('nvidia.subtitle')} />
        <div className="flex justify-center py-20"><Spinner size={28} /></div>
      </div>
    );
  }

  if (!info?.available) {
    return (
      <div className="max-w-[1200px] mx-auto animate-pageload">
        <PageHeader title={t('nvidia.title')} subtitle={t('nvidia.subtitle')} />
        <Card className="text-center py-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-gpanel3/30 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gpanel3/60 flex items-center justify-center mx-auto mb-5 animate-float">
              <MonitorDot size={36} className="text-gdim/40" />
            </div>
            <h3 className="text-lg font-extrabold text-gtext mb-2">{t('nvidia.notFound')}</h3>
            <p className="text-[13px] text-gmuted max-w-sm mx-auto">{t('nvidia.notFoundDesc')}</p>
          </div>
        </Card>
      </div>
    );
  }

  const gpu = info.gpus[0];
  const tempPct = gpu.temperature != null ? Math.min(gpu.temperature / 100, 1) : 0;
  const tempColor = tempPct > 0.8 ? '#ef4444' : tempPct > 0.6 ? '#eab308' : '#22c55e';

  const TABS: { id: NvidiaTab; label: string; icon: typeof Activity }[] = [
    { id: 'overview', label: t('nvidia.tabOverview'), icon: Activity },
    { id: 'tweaks', label: t('nvidia.tabTweaks'), icon: Zap },
    { id: 'advanced', label: t('nvidia.tabAdvanced'), icon: Settings },
  ];

  return (
    <div className="max-w-[1200px] mx-auto animate-pageload">
      <PageHeader
        title={t('nvidia.title')}
        subtitle={t('nvidia.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={scan}>{t('common.refresh')}</Button>
            <Button variant="secondary" size="sm" icon={<Settings size={14} />} onClick={loadSmi}>nvidia-smi</Button>
          </div>
        }
      />

      {/* ─── GPU BANNER ─── */}
      <div className="mb-6 relative rounded-2xl overflow-hidden border border-[#76b900]/20" style={{ background: 'linear-gradient(135deg, var(--color-gpanel), var(--color-gpanel2))' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#76b900]/5 to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#76b900]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="scanline" style={{ animationDuration: '4s' }} />
        <div className="relative flex items-center gap-6 p-6">
          {/* GPU icon */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#76b900]/15 to-[#76b900]/5 border border-[#76b900]/25 flex items-center justify-center shrink-0 shadow-[0_0_24px_rgba(118,185,0,0.12)]">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="4" y="10" width="40" height="28" rx="3" stroke="#76b900" strokeWidth="2" fill="none" />
              <rect x="8" y="14" width="14" height="10" rx="1" fill="#76b900" opacity="0.3" />
              <rect x="26" y="14" width="14" height="10" rx="1" fill="#76b900" opacity="0.2" />
              <rect x="14" y="28" width="20" height="4" rx="1" fill="#76b900" opacity="0.4" />
              <circle cx="10" cy="34" r="1.5" fill="#76b900" opacity="0.6" />
              <circle cx="16" cy="34" r="1.5" fill="#76b900" opacity="0.4" />
              <circle cx="22" cy="34" r="1.5" fill="#76b900" opacity="0.6" />
            </svg>
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#76b900]">NVIDIA GEFORCE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#76b900] shadow-[0_0_6px_#76b900] animate-pulse-soft" />
              {gpu.fanSpeedPct !== null && (
                <span className="text-[10px] text-gdim font-mono ml-1"><Wind size={10} className="inline" /> {gpu.fanSpeedPct}%</span>
              )}
            </div>
            <h2 className="text-xl font-extrabold text-gtext truncate">{gpu.name}</h2>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] mt-1.5">
              <span className="text-gdim">Driver <span className="text-gtext font-mono font-bold">{gpu.driverVersion}</span></span>
              {gpu.pcieGen && <span className="text-gdim">PCIe <span className="text-gtext font-mono font-bold">Gen {gpu.pcieGen}</span></span>}
              <span className="text-gdim">VRAM <span className="text-gtext font-mono font-bold">{gpu.vramMb} MB</span></span>
              {gpu.memoryClockMhz && <span className="text-gdim">Mem <span className="text-gtext font-mono font-bold">{gpu.memoryClockMhz} MHz</span></span>}
            </div>
            {gpu.vramUsedMb !== null && <VramBar used={gpu.vramUsedMb} total={gpu.vramMb} />}
          </div>
        </div>
      </div>

      {/* ─── TABS ─── */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-gpanel2/40 border border-gborder/20">
        {TABS.map((c) => (
          <button
            key={c.id}
            onClick={() => setTab(c.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12.5px] font-semibold transition-all duration-200 flex-1 justify-center ${
              tab === c.id
                ? 'bg-gaccent-dim text-gaccent border border-gaccent/30 shadow-[0_0_12px_rgba(0,255,136,0.12)]'
                : 'text-gdim border border-transparent hover:text-gtext hover:bg-gpanel3/40'
            }`}
          >
            <c.icon size={15} />
            {c.label}
          </button>
        ))}
      </div>

      {/* ─── DRIVER WARNING ─── */}
      {info.driverOutdated && (
        <div className="mb-5 flex items-center gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
          <AlertTriangle size={18} className="text-yellow-400 shrink-0" />
          <div>
            <p className="text-[13px] font-bold text-yellow-400">{t('nvidia.driverOutdated')}</p>
            <p className="text-[11px] text-gmuted">{t('nvidia.driverOutdatedDesc')}</p>
          </div>
        </div>
      )}

      {/* ═══════ TAB: OVERVIEW ═══════ */}
      {tab === 'overview' && (
        <div className="space-y-5 stagger">
          {/* Live Stats */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gdim mb-3 flex items-center gap-2">
              <Activity size={12} className="text-[#76b900]" /> {t('nvidia.liveStats')}
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard icon={Thermometer} label={t('nvidia.temp')} color="bg-red-500/10 text-red-400"
                value={<><AnimatedValue target={gpu.temperature} suffix="°C" /></>}
                barPct={tempPct * 100} barColor={tempColor} />
              <StatCard icon={Gauge} label={t('nvidia.usage')} color="bg-gaccent/10 text-gaccent"
                value={<><AnimatedValue target={gpu.utilizationPct} suffix="%" /></>}
                barPct={gpu.utilizationPct ?? 0} barColor="#76b900" />
              <StatCard icon={Zap} label={t('nvidia.power')} color="bg-yellow-500/10 text-yellow-400"
                value={<><AnimatedValue target={gpu.powerDrawW != null ? Math.round(gpu.powerDrawW) : null} suffix="W" /></>}
                barPct={gpu.powerDrawW != null && gpu.powerLimitW ? (gpu.powerDrawW / gpu.powerLimitW) * 100 : undefined}
                barColor="#eab308" />
              <StatCard icon={Cpu} label={t('nvidia.clock')} color="bg-blue-500/10 text-blue-400"
                value={<><AnimatedValue target={gpu.clockMhz} suffix=" MHz" /></>} />
            </div>
          </div>

          {/* GPU Health */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gdim mb-3">{t('nvidia.gpuHealth')}</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: t('nvidia.healthTemp'), ok: (gpu.temperature ?? 0) < 80, value: gpu.temperature != null ? `${gpu.temperature}°C` : '—', icon: Thermometer },
                { label: t('nvidia.healthPower'), ok: gpu.powerDrawW == null || gpu.powerLimitW == null || gpu.powerDrawW < gpu.powerLimitW, value: gpu.powerDrawW != null ? `${gpu.powerDrawW.toFixed(0)}W` : '—', icon: Zap },
                { label: t('nvidia.healthVram'), ok: gpu.vramUsedMb == null || gpu.vramUsedMb < gpu.vramMb * 0.9, value: gpu.vramUsedMb != null ? `${((gpu.vramUsedMb / gpu.vramMb) * 100).toFixed(0)}%` : '—', icon: HardDrive },
                { label: t('nvidia.healthDriver'), ok: !info.driverOutdated, value: gpu.driverVersion, icon: Wifi },
              ].map((h, i) => (
                <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl bg-gpanel2/40 border border-gborder/25">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${h.ok ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    <h.icon size={16} className={h.ok ? 'text-green-400' : 'text-red-400'} />
                  </div>
                  <div>
                    <div className="text-[9px] text-gdim uppercase tracking-wider font-semibold">{h.label}</div>
                    <div className="text-[13px] font-mono font-bold text-gtext">{h.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* nvidia-smi */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-gpanel2/40 border border-gborder/25">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gpanel3 flex items-center justify-center">
                <Settings size={15} className="text-gdim" />
              </div>
              <div>
                <span className="text-[12px] font-semibold text-gtext">nvidia-smi</span>
                <p className="text-[10px] text-gdim">Ver salida completa del sistema</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" icon={<MonitorDot size={13} />} onClick={loadSmi}>
              {t('nvidia.viewSmi')}
            </Button>
          </div>
        </div>
      )}

      {/* ═══════ TAB: TWEAKS ═══════ */}
      {tab === 'tweaks' && (
        <div className="space-y-6 stagger">
          {/* Preset Profiles */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gdim mb-3">{t('nvidia.presetProfiles')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {presets.map((preset) => {
                const isActive = activePreset === preset.id;
                const colors: Record<string, { icon: typeof Flame; color: string; bg: string; border: string }> = {
                  perf_max: { icon: Flame, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/25' },
                  quality_max: { icon: Gem, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/25' },
                  balanced: { icon: Scale, color: 'text-gaccent', bg: 'bg-gaccent/10', border: 'border-gaccent/25' },
                  esports: { icon: Crosshair, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/25' },
                };
                const c = colors[preset.id] || { icon: Zap, color: 'text-gdim', bg: 'bg-gpanel3', border: 'border-gborder/30' };
                const Ic = c.icon;
                return (
                  <div key={preset.id} className={`rounded-2xl p-4 border transition-all duration-300 ${
                    isActive ? `${c.bg} ${c.border} shadow-[0_0_20px_rgba(0,255,136,0.08)]` : 'bg-gpanel2/40 border-gborder/25 hover:border-gborder2/50'
                  }`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? c.bg : 'bg-gpanel3'}`}>
                        <Ic size={18} className={isActive ? c.color : 'text-gdim'} />
                      </div>
                      {isActive && <CheckCircle2 size={16} className="text-green-400 ml-auto drop-shadow-[0_0_6px_rgba(74,222,128,0.5)]" />}
                    </div>
                    <h4 className="text-[13px] font-bold text-gtext mb-0.5">{preset.name}</h4>
                    <p className="text-[10px] text-gmuted mb-3 leading-relaxed">{preset.description}</p>
                    <Button
                      variant={isActive ? 'secondary' : 'primary'}
                      size="sm"
                      loading={applying === preset.id}
                      onClick={() => applyPreset(preset.id)}
                      className="w-full"
                      icon={isActive ? <CheckCircle2 size={13} /> : undefined}
                    >
                      {isActive ? t('nvidia.appliedBtn') : t('nvidia.applyPreset')}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Tweaks */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gdim mb-1">{t('nvidia.quickTweaks')}</h3>
            <p className="text-[10px] text-gmuted mb-3">{t('nvidia.quickTweaksDesc')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { id: 'lowLatency', icon: Zap, label: t('nvidia.lowLatency'), desc: t('nvidia.lowLatencyDesc'), color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                { id: 'vsyncOff', icon: MonitorDot, label: t('nvidia.vsync'), desc: t('nvidia.vsyncDesc'), color: 'text-blue-400', bg: 'bg-blue-500/10' },
                { id: 'shaderCache', icon: Shield, label: t('nvidia.shaderCache'), desc: t('nvidia.shaderCacheDesc'), color: 'text-purple-400', bg: 'bg-purple-500/10' },
                { id: 'texturePerf', icon: Paintbrush, label: t('nvidia.textureQuality'), desc: t('nvidia.textureQualityDesc'), color: 'text-orange-400', bg: 'bg-orange-500/10' },
                { id: 'powerMax', icon: Flame, label: t('nvidia.powerMode'), desc: t('nvidia.powerModeDesc'), color: 'text-red-400', bg: 'bg-red-500/10' },
              ].map((item) => (
                <div key={item.id} className="panel-hover flex items-center gap-3.5 p-3.5 bg-gpanel2/40 border border-gborder/25 rounded-xl">
                  <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
                    <item.icon size={17} className={item.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[12.5px] font-bold text-gtext">{item.label}</h4>
                    <p className="text-[10px] text-gmuted truncate">{item.desc}</p>
                  </div>
                  <Button variant="primary" size="sm" loading={quickBusy === item.id} onClick={() => applyQuick(item.id)} className="shrink-0" icon={<Zap size={12} />}>
                    Apply
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ TAB: ADVANCED ═══════ */}
      {tab === 'advanced' && (
        <div className="space-y-5 stagger">
          <p className="text-[11px] text-gmuted">{t('nvidia.advancedDesc')}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Power Limit */}
            <div className="bg-gpanel2/40 border border-gborder/25 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={14} className="text-yellow-400" />
                <h4 className="text-[13px] font-bold text-gtext">{t('nvidia.powerLimit')}</h4>
              </div>
              <p className="text-[10px] text-gmuted mb-4">{t('nvidia.powerLimitDesc')}</p>
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="range"
                  min={gpu.powerLimitW ? Math.round(gpu.powerLimitW * 0.5) : 50}
                  max={gpu.powerLimitW ? Math.round(gpu.powerLimitW * 1.2) : 400}
                  value={powerLimit}
                  onChange={(e) => setPowerLimit(Number(e.target.value))}
                  className="gt-range flex-1"
                />
                <span className="text-[14px] font-mono font-bold text-gtext w-16 text-right">{powerLimit}W</span>
              </div>
              <Button variant="primary" size="sm" onClick={applyPowerLimit} className="w-full">{t('nvidia.applyPreset')}</Button>
            </div>

            {/* Max FPS */}
            <div className="bg-gpanel2/40 border border-gborder/25 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <Gauge size={14} className="text-gaccent" />
                <h4 className="text-[13px] font-bold text-gtext">{t('nvidia.maxFps')}</h4>
              </div>
              <p className="text-[10px] text-gmuted mb-4">{t('nvidia.maxFpsDesc')}</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {[0, 60, 120, 144, 165, 240].map((v) => (
                  <button
                    key={v}
                    onClick={() => setMaxFps(v)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all border ${
                      maxFps === v
                        ? 'bg-gaccent/15 text-gaccent border-gaccent/30 shadow-[0_0_8px_rgba(0,255,136,0.12)]'
                        : 'bg-gbase3 text-gdim border-transparent hover:text-gtext hover:bg-gpanel3'
                    }`}
                  >
                    {v === 0 ? t('nvidia.fpsUnlimited') : v}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={maxFps}
                  onChange={(e) => setMaxFps(Number(e.target.value))}
                  className="w-full bg-gbase2 border border-gborder rounded-xl px-3 py-2 text-[13px] text-gtext font-mono focus:outline-none focus:border-gaccent/50 transition-colors"
                />
                <Button variant="primary" size="sm" onClick={applyMaxFps} className="shrink-0 px-4">{t('nvidia.applyPreset')}</Button>
              </div>
            </div>

            {/* Pre-Render */}
            <div className="bg-gpanel2/40 border border-gborder/25 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <Cpu size={14} className="text-blue-400" />
                <h4 className="text-[13px] font-bold text-gtext">{t('nvidia.preRenderFrames')}</h4>
              </div>
              <p className="text-[10px] text-gmuted mb-4">{t('nvidia.preRenderFramesDesc')}</p>
              <div className="flex gap-2 mb-4">
                {[1, 2, 3, 4].map((v) => (
                  <button
                    key={v}
                    onClick={() => setPreRender(v)}
                    className={`flex-1 h-11 rounded-xl text-[13px] font-mono font-bold transition-all border ${
                      preRender === v
                        ? 'bg-gaccent/15 text-gaccent border-gaccent/30 shadow-[0_0_8px_rgba(0,255,136,0.12)]'
                        : 'bg-gbase3 text-gdim border-transparent hover:text-gtext hover:bg-gpanel3'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <Button variant="primary" size="sm" onClick={applyPreRender} className="w-full">{t('nvidia.applyPreset')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* nvidia-smi Modal */}
      <Modal open={showSmi} onClose={() => setShowSmi(false)} title="nvidia-smi">
        <pre className="text-[11px] font-mono text-green-400 bg-gbase2 p-4 rounded-xl overflow-auto max-h-[400px] whitespace-pre-wrap border border-gborder/30">
          {smiOutput}
        </pre>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setShowSmi(false)}>{t('common.cancel')}</Button>
        </div>
      </Modal>
    </div>
  );
}
