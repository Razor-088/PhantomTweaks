import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Gamepad2, Power, PowerOff, CheckCircle2, Zap, ShieldCheck,
  Crosshair, RefreshCw, Play, Plus, Trash2, Search, X,
  Gauge, Star, Swords, Target, Flame, Crown, Skull, Shield, Heart,
  FolderOpen, Monitor, Download, HardDrive, Filter,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { useI18n } from '../lib/i18n';
import { loadGameLogo, preloadGameLogos } from '../lib/gameLogos';
import type { GamingModeResult, DetectedGame, GameOptimization, GameBoostStatus, GameProfile } from '../lib/types';

const FALLBACK_ICONS: Record<string, { color: string; bg: string; gradient: string; icon: typeof Flame }> = {
  overwatch: { color: 'text-orange-400', bg: 'bg-orange-500/15', gradient: 'from-orange-500/20 to-transparent', icon: Target },
  'overwatch 2': { color: 'text-orange-400', bg: 'bg-orange-500/15', gradient: 'from-orange-500/20 to-transparent', icon: Target },
  valorant: { color: 'text-red-400', bg: 'bg-red-500/15', gradient: 'from-red-500/20 to-transparent', icon: Crosshair },
  fortnite: { color: 'text-blue-400', bg: 'bg-blue-500/15', gradient: 'from-blue-500/20 to-transparent', icon: Zap },
  'league of legends': { color: 'text-yellow-400', bg: 'bg-yellow-500/15', gradient: 'from-yellow-500/20 to-transparent', icon: Crown },
  cs2: { color: 'text-amber-400', bg: 'bg-amber-500/15', gradient: 'from-amber-500/20 to-transparent', icon: Shield },
  minecraft: { color: 'text-green-400', bg: 'bg-green-500/15', gradient: 'from-green-500/20 to-transparent', icon: Heart },
  gta: { color: 'text-emerald-400', bg: 'bg-emerald-500/15', gradient: 'from-emerald-500/20 to-transparent', icon: Star },
  apex: { color: 'text-rose-400', bg: 'bg-rose-500/15', gradient: 'from-rose-500/20 to-transparent', icon: Swords },
  'the first descendant': { color: 'text-cyan-400', bg: 'bg-cyan-500/15', gradient: 'from-cyan-500/20 to-transparent', icon: Skull },
  'marvel rivals': { color: 'text-red-400', bg: 'bg-red-500/15', gradient: 'from-red-500/20 to-transparent', icon: Star },
  'elden ring': { color: 'text-yellow-400', bg: 'bg-yellow-500/15', gradient: 'from-yellow-500/20 to-transparent', icon: Crown },
  'cyberpunk': { color: 'text-yellow-300', bg: 'bg-yellow-300/15', gradient: 'from-yellow-300/20 to-transparent', icon: Zap },
};

const HASH_COLORS = [
  { color: 'text-gaccent', bg: 'bg-gaccent/15', gradient: 'from-gaccent/15 to-transparent' },
  { color: 'text-blue-400', bg: 'bg-blue-500/15', gradient: 'from-blue-500/15 to-transparent' },
  { color: 'text-purple-400', bg: 'bg-purple-500/15', gradient: 'from-purple-500/15 to-transparent' },
  { color: 'text-cyan-400', bg: 'bg-cyan-500/15', gradient: 'from-cyan-500/15 to-transparent' },
  { color: 'text-pink-400', bg: 'bg-pink-500/15', gradient: 'from-pink-500/15 to-transparent' },
  { color: 'text-orange-400', bg: 'bg-orange-500/15', gradient: 'from-orange-500/15 to-transparent' },
];

function getFallback(name: string) {
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(FALLBACK_ICONS)) {
    if (lower.includes(key)) return val;
  }
  const hash = lower.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const c = HASH_COLORS[hash % HASH_COLORS.length];
  return { ...c, icon: Gamepad2 };
}

function GameLogo({ name, size = 40, fullWidth, className }: { name: string; size?: number; fullWidth?: boolean; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const loaded = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (loaded.current.has(name)) return;
    loaded.current.add(name);
    loadGameLogo(name).then((s) => { if (s) setSrc(s); }).catch(() => {});
  }, [name]);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setSrc(null)}
        className={`object-cover shrink-0 ${fullWidth ? 'w-full' : 'rounded-xl border border-gborder/50'} ${className || ''}`}
        style={fullWidth ? undefined : { width: size, height: size }}
      />
    );
  }

  const fb = getFallback(name);
  const Icon = fb.icon;
  if (fullWidth) {
    return (
      <div className={`flex items-center justify-center shrink-0 ${fb.bg} ${className || ''}`}>
        <Icon size={36} className={fb.color} />
      </div>
    );
  }
  return (
    <div className={`rounded-xl border border-gborder/30 flex items-center justify-center shrink-0 ${fb.bg}`} style={{ width: size, height: size }}>
      <Icon size={size * 0.45} className={fb.color} />
    </div>
  );
}

const PLATFORM_ICONS: Record<string, string> = {
  steam: '🎮',
  epic: '🎯',
  riot: '⚔️',
  xbox: '🟢',
  gog: '🟡',
  'battle.net': '🔵',
  other: '🎲',
};

const PLATFORM_LABELS: Record<string, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  riot: 'Riot Games',
  xbox: 'Xbox / Game Pass',
  gog: 'GOG',
  'battle.net': 'Battle.net',
  other: 'Otro',
};

function genId() { return `prf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }

type Tab = 'gaming' | 'optimizer' | 'profiles';

export default function GamingHub() {
  const { t } = useI18n();
  const toast = useAppStore((s) => s.toast);
  const setBadges = useAppStore((s) => s.setBadges);
  const [tab, setTab] = useState<Tab>('gaming');

  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applyPowerPlan, setApplyPowerPlan] = useState(true);
  const [memoryClean, setMemoryClean] = useState(true);
  const [confirmOn, setConfirmOn] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const [games, setGames] = useState<DetectedGame[]>([]);
  const [optimizations, setOptimizations] = useState<GameOptimization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  const [showNewOpt, setShowNewOpt] = useState(false);
  const [selectedGame, setSelectedGame] = useState<DetectedGame | null>(null);
  const [newOpt, setNewOpt] = useState({
    name: '',
    applyPowerPlan: true,
    memoryClean: true,
    priority: 'high' as const,
    gameDvrOff: true,
    fullscreenOptOff: true,
    gameModeOn: true,
    networkOptimize: false,
  });

  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [rtGames, setRtGames] = useState<string[]>([]);
  const [rtLoading, setRtLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [applyingOpt, setApplyingOpt] = useState<string | null>(null);
  const [lastApplied, setLastApplied] = useState<string | null>(null);
  const [quickOptGame, setQuickOptGame] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formGame, setFormGame] = useState('');
  const [formPower, setFormPower] = useState('8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
  const [formPriority, setFormPriority] = useState<'normal' | 'high' | 'realtime'>('high');
  const [formMemClean, setFormMemClean] = useState(true);

  useEffect(() => {
    api.gaming.status().then((s) => setActive(s.active)).catch(() => undefined);
    loadGames();
    loadProfiles();
  }, []);

  const activate = async () => {
    setBusy(true);
    const r: GamingModeResult = await api.gaming.activate({ applyPowerPlan, memoryClean }).catch(() => ({
      active: false, applied: [], failed: ['error'], messages: [t('gaming.commError')],
    }));
    setBusy(false);
    if (r.active) {
      setActive(true);
      toast('success', t('gaming.activated'), t('gaming.activatedDesc', { n: r.applied.length }));
    } else {
      toast('warning', t('gaming.notActivated'), r.messages.join(' '));
    }
    if (r.failed.length) {
      toast('info', t('gaming.someFailed'), t('gaming.someFailedDesc'));
    }
  };

  const deactivate = async () => {
    setBusy(true);
    const r = await api.gaming.deactivate().catch(() => ({ active: false, applied: [], failed: [], messages: [] }));
    setBusy(false);
    setActive(false);
    toast('info', t('gaming.deactivated'), t('gaming.deactivatedDesc', { n: r.applied.length }));
  };

  const loadGames = async () => {
    setLoading(true);
    try {
      const [installed, opts] = await Promise.all([
        api.games.installed(),
        api.games.optimizations(),
      ]);
      setGames(installed);
      setOptimizations(opts);
      preloadGameLogos(installed.map((g) => g.name));
      const running = installed.filter((g) => g.running).length;
      setBadges({ gaminghub: running > 0 ? running : null });
    } catch { /* ignore */ }
    setLoading(false);
  };

  const createOptimization = async () => {
    if (!selectedGame) return;
    const opt: GameOptimization = {
      id: `gameopt-${Date.now().toString(36)}`,
      gameId: selectedGame.id,
      ...newOpt,
      name: newOpt.name || selectedGame.name,
      cpuCoreAffinity: null,
      autoApply: false,
      createdAt: new Date().toISOString(),
    };
    const saved = await api.games.saveOptimization(opt).catch(() => null);
    if (saved) {
      toast('success', t('gameOpt.saved'), t('gameOpt.savedDesc'));
      setShowNewOpt(false);
      setSelectedGame(null);
      setNewOpt({ name: '', applyPowerPlan: true, memoryClean: true, priority: 'high', gameDvrOff: true, fullscreenOptOff: true, gameModeOn: true, networkOptimize: false });
      loadGames();
    } else {
      toast('error', t('common.error'), t('gameOpt.saveError'));
    }
  };

  const applyOpt = async (id: string) => {
    setApplyingOpt(id);
    const r = await api.games.applyOptimization(id).catch(() => ({ ok: false, applied: [], errors: ['Error'] }));
    setApplyingOpt(null);
    if (r.ok) {
      setLastApplied(id);
      toast('success', t('gameOpt.applied'), r.applied.length ? r.applied.join(' · ') : t('gameOpt.appliedDesc'));
      loadGames();
      setTimeout(() => setLastApplied(null), 3000);
    } else {
      toast('error', t('common.error'), r.errors[0]);
    }
  };

  const deactivateOpt = async (id: string) => {
    const r = await api.games.deactivateOptimization(id).catch(() => ({ ok: false, applied: [], errors: ['Error'] }));
    if (r.ok) { toast('info', t('gameOpt.deactivated'), t('gameOpt.deactivatedDesc')); loadGames(); }
  };

  const deleteOpt = async (id: string) => {
    await api.games.deleteOptimization(id).catch(() => {});
    toast('info', t('gameOpt.deleted'), '');
    loadGames();
  };

  const quickOptimize = async (game: DetectedGame) => {
    setQuickOptGame(game.id);
    const opt: GameOptimization = {
      id: `gameopt-${Date.now().toString(36)}`,
      gameId: game.id,
      name: game.name,
      applyPowerPlan: true,
      memoryClean: true,
      priority: 'high',
      gameDvrOff: true,
      fullscreenOptOff: true,
      gameModeOn: true,
      networkOptimize: true,
      cpuCoreAffinity: null,
      autoApply: false,
      createdAt: new Date().toISOString(),
    };
    const saved = await api.games.saveOptimization(opt).catch(() => null);
    if (saved) {
      const r = await api.games.applyOptimization(saved.id).catch(() => ({ ok: false, applied: [], errors: ['Error'] }));
      setQuickOptGame(null);
      if (r.ok) {
        setLastApplied(saved.id);
        toast('success', t('gameOpt.quickOptimized'), r.applied.length ? r.applied.join(' · ') : game.name);
        loadGames();
        setTimeout(() => setLastApplied(null), 3000);
      } else {
        toast('error', t('common.error'), r.errors[0]);
      }
    } else {
      setQuickOptGame(null);
      toast('error', t('common.error'), t('gameOpt.saveError'));
    }
  };

  const loadProfiles = async () => {
    setRtLoading(true);
    const [p, g] = await Promise.all([
      api.profiles.list().catch(() => []),
      api.profiles.detectGames().catch(() => []),
    ]);
    setProfiles(p);
    setRtGames(g);
    setRtLoading(false);
  };

  const saveProfile = async () => {
    if (!formName.trim()) { toast('warning', t('realtime.nameRequired')); return; }
    const profile: GameProfile = {
      id: genId(), name: formName.trim(), game: formGame.trim(),
      powerPlan: formPower, priority: formPriority, memoryClean: formMemClean,
      tweaks: [], autoApply: false, createdAt: new Date().toISOString(),
    };
    await api.profiles.save(profile);
    toast('success', t('realtime.profileSaved'));
    setShowForm(false); setFormName(''); setFormGame('');
    loadProfiles();
  };

  const applyProfile = async (id: string) => {
    setApplying(id);
    const r = await api.profiles.apply(id).catch(() => ({ ok: false, applied: [], errors: ['Error'] }));
    setApplying(null);
    if (r.ok) { toast('success', t('realtime.profileApplied'), r.applied.join(' · ')); loadProfiles(); }
    else { toast('error', t('common.error'), r.errors.join(' · ')); }
  };

  const deleteProfile = async (id: string) => {
    await api.profiles.delete(id);
    toast('info', t('realtime.profileDeleted'));
    loadProfiles();
  };

  const runningGames = games.filter(g => g.running);
  const installedGames = games.filter(g => !g.running);
  const platforms = [...new Set(games.map(g => g.platform))];

  const filteredInstalled = installedGames.filter(g => {
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (platformFilter !== 'all' && g.platform !== platformFilter) return false;
    return true;
  });

  const filteredRunning = runningGames.filter(g => {
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (platformFilter !== 'all' && g.platform !== platformFilter) return false;
    return true;
  });

  const TABS: { id: Tab; label: string; icon: typeof Gamepad2 }[] = [
    { id: 'gaming', label: t('gaming.modeInactive'), icon: Zap },
    { id: 'optimizer', label: t('gameOpt.title'), icon: Crosshair },
    { id: 'profiles', label: t('realtime.title'), icon: Gauge },
  ];

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader title={t('gaming.title')} subtitle={t('gaming.subtitle')} />

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        {TABS.map((c) => (
          <button
            key={c.id}
            onClick={() => setTab(c.id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium border transition-all duration-200 ${
              tab === c.id
                ? 'bg-gaccent-dim text-gaccent border-gaccent/40 shadow-[0_0_12px_rgba(0,255,136,0.15)]'
                : 'text-gmuted border-gborder hover:text-gtext hover:border-gborder2 hover:-translate-y-px'
            }`}
          >
            <c.icon size={14} />
            {c.label}
          </button>
        ))}
      </div>

      {/* ==================== GAMING TAB ==================== */}
      {tab === 'gaming' && (
        <>
          {/* Hero Optimizer Card */}
          <Card className="mb-5 relative overflow-hidden" noPadding>
            <div className="absolute inset-0 bg-gradient-to-br from-gaccent/5 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-gaccent/8 to-transparent rounded-bl-full pointer-events-none" />

            <div className="relative p-6 flex flex-col md:flex-row items-center gap-6">
              {/* Big Button */}
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={() => active ? setConfirmOff(true) : setConfirmOn(true)}
                  disabled={busy}
                  className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 border-2 cursor-pointer group ${
                    active
                      ? 'border-gaccent shadow-[0_0_50px_rgba(0,255,136,0.35)] bg-gaccent/5 hover:shadow-[0_0_60px_rgba(0,255,136,0.5)]'
                      : 'border-gborder2 hover:border-gaccent/50 hover:shadow-[0_0_30px_rgba(0,255,136,0.15)] bg-gpanel2'
                  }`}
                >
                  {active ? (
                    <PowerOff size={36} className="text-gaccent group-hover:scale-110 transition-transform" />
                  ) : (
                    <Power size={36} className="text-gdim group-hover:text-gaccent group-hover:scale-110 transition-all" />
                  )}
                </button>
                <div className="text-center">
                  <div className="font-mono text-[13px] font-bold tracking-widest uppercase">
                    {active ? (
                      <span className="text-gaccent text-glow flex items-center gap-1.5">
                        <span className="live-dot w-2 h-2 rounded-full bg-gaccent inline-block" />
                        {t('gaming.modeActive')}
                      </span>
                    ) : (
                      <span className="text-gmuted">{t('gaming.modeInactive')}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Options + Facts */}
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] text-gmuted leading-relaxed mb-4">
                  {active ? t('gaming.activeDesc') : t('gaming.inactiveDesc')}
                </p>

                <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4">
                  <div className="flex items-center justify-between text-[12px] text-gmuted">
                    <span className="mr-2">{t('gaming.powerPlan')}</span>
                    <Toggle checked={applyPowerPlan} onChange={setApplyPowerPlan} disabled={active} />
                  </div>
                  <div className="flex items-center justify-between text-[12px] text-gmuted">
                    <span className="mr-2">{t('gaming.memoryClean')}</span>
                    <Toggle checked={memoryClean} onChange={setMemoryClean} disabled={active} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  {['gaming.fact1', 'gaming.fact2', 'gaming.fact3', 'gaming.fact4'].map((k) => (
                    <div key={k} className="flex items-center gap-2 py-1">
                      <CheckCircle2 size={12} className="text-gaccent shrink-0" />
                      <span className="text-[11.5px] text-gdim leading-relaxed">{t(k)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <ShieldCheck size={12} className="text-gaccent shrink-0" />
                  <span className="text-[10.5px] text-gdim leading-relaxed">{t('gaming.safetyNote')}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <Card className="text-center py-3">
              <div className="text-[24px] font-bold text-gaccent">{games.length}</div>
              <div className="text-[10px] text-gdim uppercase tracking-wider">{t('gameOpt.installed')}</div>
            </Card>
            <Card className="text-center py-3">
              <div className="text-[24px] font-bold text-green-400">{runningGames.length}</div>
              <div className="text-[10px] text-gdim uppercase tracking-wider">{t('gameOpt.running')}</div>
            </Card>
            <Card className="text-center py-3">
              <div className="text-[24px] font-bold text-blue-400">{optimizations.length}</div>
              <div className="text-[10px] text-gdim uppercase tracking-wider">{t('gameOpt.optimizations')}</div>
            </Card>
          </div>

          {/* Search + Filter */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gdim" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('gaming.search')}
                className="w-full pl-9 pr-8 py-2 rounded-lg bg-gpanel border border-gborder text-[12.5px] text-gtext placeholder:text-gdim/50 focus:outline-none focus:border-gaccent/50 transition-colors"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gdim hover:text-gtext">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 bg-gpanel border border-gborder rounded-lg px-1.5 py-1">
              <button
                onClick={() => setPlatformFilter('all')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${platformFilter === 'all' ? 'bg-gaccent/15 text-gaccent' : 'text-gdim hover:text-gtext'}`}
              >
                <Filter size={12} />
              </button>
              {platforms.map(p => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p === platformFilter ? 'all' : p)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${platformFilter === p ? 'bg-gaccent/15 text-gaccent' : 'text-gdim hover:text-gtext'}`}
                  title={PLATFORM_LABELS[p]}
                >
                  {PLATFORM_ICONS[p] || '🎲'}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={loadGames} loading={loading} />
          </div>

          {/* Running Games */}
          {filteredRunning.length > 0 && (
            <div className="mb-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gdim mb-3 flex items-center gap-2">
                <span className="live-dot inline-block w-2 h-2 rounded-full bg-green-400" />
                {t('gameOpt.runningNow')}
              </h3>
              <div className="space-y-2">
                {filteredRunning.map(game => {
                  const opt = optimizations.find(o => o.gameId === game.id);
                  return (
                    <Card key={game.id} className="relative overflow-hidden border-green-500/20 bg-green-500/[0.03]">
                      <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-transparent pointer-events-none" />
                      <div className="relative flex items-center gap-4">
                        <GameLogo name={game.name} size={52} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold text-gtext">{game.name}</span>
                            <StatusBadge tone="ok"><CheckCircle2 size={10} /> {t('gameOpt.active')}</StatusBadge>
                          </div>
                          <p className="text-[11px] text-gmuted mt-0.5">
                            {PLATFORM_ICONS[game.platform]} {PLATFORM_LABELS[game.platform]} · PID {game.pid}
                          </p>
                        </div>
                        {opt && (
                          <Button
                            variant={lastApplied === opt.id ? 'success' : 'primary'}
                            size="sm"
                            loading={applyingOpt === opt.id}
                            onClick={() => applyOpt(opt.id)}
                          >
                            {lastApplied === opt.id ? <><CheckCircle2 size={13} /> {t('gameOpt.applied')}</> : t('gameOpt.apply')}
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Installed Games Grid */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gdim">
                {t('gameOpt.installedGames')} <span className="text-gaccent/60">({filteredInstalled.length})</span>
              </h3>
              <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setShowNewOpt(true)}>
                {t('gameOpt.newOpt')}
              </Button>
            </div>
            {filteredInstalled.length === 0 ? (
              <Card className="text-center py-10">
                <Gamepad2 size={40} className="text-gdim/40 mx-auto mb-3" />
                <p className="text-[13px] text-gmuted">{search || platformFilter !== 'all' ? t('gaming.noResults') : t('gameOpt.noGamesFound')}</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredInstalled.map(game => {
                  const opt = optimizations.find(o => o.gameId === game.id);
                  const fb = getFallback(game.name);
                  return (
                    <Card key={game.id} className="group relative overflow-hidden p-0 hover:border-gaccent/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(0,0,0,0.3)]">
                      {/* Cover */}
                      <div className="relative h-[140px] overflow-hidden">
                        <GameLogo name={game.name} size={0} fullWidth className="w-full h-full" />
                        <div className="absolute inset-0 bg-gradient-to-t from-gpanel via-gpanel/40 to-transparent" />

                        {/* Platform badge */}
                        <div className="absolute top-2 right-2">
                          <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[9px] font-medium text-white/80">
                            {PLATFORM_ICONS[game.platform]} {PLATFORM_LABELS[game.platform]}
                          </span>
                        </div>

                        {/* Optimized badge */}
                        {opt && (
                          <div className="absolute top-2 left-2">
                            <span className="px-1.5 py-0.5 rounded bg-gaccent/20 backdrop-blur-sm text-[9px] font-bold text-gaccent flex items-center gap-1">
                              <CheckCircle2 size={9} /> OPTIMIZADO
                            </span>
                          </div>
                        )}

                        {/* Game name overlay */}
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <p className="text-[13px] font-bold text-white leading-tight drop-shadow-lg">{game.name}</p>
                        </div>
                      </div>

                      {/* Info + Actions */}
                      <div className="p-3 pt-2">
                        {game.installPath && (
                          <p className="text-[10px] text-gdim font-mono truncate mb-2.5 opacity-60">{game.installPath}</p>
                        )}
                        {opt ? (
                          <div className="flex gap-1.5">
                            <Button
                              variant={lastApplied === opt.id ? 'success' : 'primary'}
                              size="sm"
                              loading={applyingOpt === opt.id}
                              onClick={() => applyOpt(opt.id)}
                              className="flex-1"
                            >
                              {lastApplied === opt.id ? <><CheckCircle2 size={12} /> {t('gameOpt.applied')}</> : t('gameOpt.apply')}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => deactivateOpt(opt.id)}>
                              {t('gameOpt.deactivate')}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1.5">
                            <Button
                              variant="primary"
                              size="sm"
                              className="flex-1"
                              icon={<Zap size={12} />}
                              loading={quickOptGame === game.id}
                              onClick={() => quickOptimize(game)}
                            >
                              {quickOptGame === game.id ? t('gameOpt.quickOptimizing') : t('gameOpt.quickOptimize')}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => {
                              setSelectedGame(game);
                              setNewOpt(prev => ({ ...prev, name: game.name }));
                              setShowNewOpt(true);
                            }} icon={<Plus size={12} />} />
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ==================== OPTIMIZER TAB ==================== */}
      {tab === 'optimizer' && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <Card className="text-center py-3">
              <div className="text-[28px] font-bold text-gaccent">{games.length}</div>
              <div className="text-[11px] text-gdim uppercase tracking-wider mt-1">{t('gameOpt.installed')}</div>
            </Card>
            <Card className="text-center py-3">
              <div className="text-[28px] font-bold text-green-400">{runningGames.length}</div>
              <div className="text-[11px] text-gdim uppercase tracking-wider mt-1">{t('gameOpt.running')}</div>
            </Card>
            <Card className="text-center py-3">
              <div className="text-[28px] font-bold text-blue-400">{optimizations.length}</div>
              <div className="text-[11px] text-gdim uppercase tracking-wider mt-1">{t('gameOpt.optimizations')}</div>
            </Card>
          </div>

          {/* Active Profiles */}
          {optimizations.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gdim mb-3 flex items-center gap-2">
                <Crosshair size={12} className="text-blue-400" /> {t('gameOpt.activeProfiles')}
              </h3>
              <div className="space-y-2">
                {optimizations.map(opt => (
                  <Card key={opt.id} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-500/10 shrink-0">
                      <Crosshair size={18} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gtext">{opt.name}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gdim">
                        {opt.applyPowerPlan && <span className="flex items-center gap-1"><Zap size={9} /> Power</span>}
                        {opt.memoryClean && <span className="flex items-center gap-1"><HardDrive size={9} /> RAM</span>}
                        {opt.gameDvrOff && <span>DVR Off</span>}
                        {opt.gameModeOn && <span>Game Mode</span>}
                        <span className="capitalize">P: {opt.priority}</span>
                      </div>
                    </div>
                    <Button variant={lastApplied === opt.id ? 'success' : 'primary'} size="sm" loading={applyingOpt === opt.id} onClick={() => applyOpt(opt.id)}>
                      {lastApplied === opt.id ? <><CheckCircle2 size={13} /> {t('gameOpt.applied')}</> : t('gameOpt.apply')}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => deleteOpt(opt.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Installed Games */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gdim">
                {t('gameOpt.installedGames')} <span className="text-gaccent/60">({installedGames.length})</span>
              </h3>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={loadGames}>
                  {t('common.refresh')}
                </Button>
                <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowNewOpt(true)}>
                  {t('gameOpt.newOpt')}
                </Button>
              </div>
            </div>
            {installedGames.length === 0 ? (
              <Card className="text-center py-8">
                <Gamepad2 size={36} className="text-gdim mx-auto mb-3" />
                <p className="text-[13px] text-gmuted">{t('gameOpt.noGamesFound')}</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {installedGames.map(game => {
                  const opt = optimizations.find(o => o.gameId === game.id);
                  return (
                    <Card key={game.id} className="group relative overflow-hidden p-0 hover:border-gaccent/30 transition-all">
                      <div className="relative h-[110px] overflow-hidden">
                        <GameLogo name={game.name} size={0} fullWidth className="w-full h-full" />
                        <div className="absolute inset-0 bg-gradient-to-t from-gpanel via-gpanel/40 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <p className="text-[13px] font-bold text-white drop-shadow-lg">{game.name}</p>
                          <p className="text-[10px] text-white/50">{PLATFORM_ICONS[game.platform]} {PLATFORM_LABELS[game.platform]}</p>
                        </div>
                      </div>
                      <div className="p-3 pt-2">
                        {opt ? (
                          <div className="flex gap-1.5">
                            <Button variant={lastApplied === opt.id ? 'success' : 'primary'} size="sm" loading={applyingOpt === opt.id} onClick={() => applyOpt(opt.id)} className="flex-1">
                              {lastApplied === opt.id ? <><CheckCircle2 size={12} /> {t('gameOpt.applied')}</> : t('gameOpt.apply')}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => deactivateOpt(opt.id)}>
                              {t('gameOpt.deactivate')}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1.5">
                            <Button variant="primary" size="sm" className="flex-1" icon={<Zap size={12} />} loading={quickOptGame === game.id} onClick={() => quickOptimize(game)}>
                              {quickOptGame === game.id ? t('gameOpt.quickOptimizing') : t('gameOpt.quickOptimize')}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => { setSelectedGame(game); setNewOpt(prev => ({ ...prev, name: game.name })); setShowNewOpt(true); }} icon={<Plus size={12} />} />
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ==================== PROFILES TAB ==================== */}
      {tab === 'profiles' && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-6">
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={loadProfiles}>{t('common.refresh')}</Button>
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowForm(!showForm)}>{t('realtime.newProfile')}</Button>
          </div>

          {rtGames.length > 0 && (
            <Card className="mb-4">
              <div className="flex items-center gap-2 text-[13px]">
                <Gamepad2 size={16} className="text-gaccent" />
                <span className="text-gtext font-semibold">{t('realtime.detectedGames')}:</span>
                <span className="text-gmuted">{rtGames.join(', ')}</span>
              </div>
            </Card>
          )}

          {showForm && (
            <Card title={t('realtime.newProfile')} className="mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gdim uppercase tracking-wider">{t('realtime.profileName')}</label>
                  <input className="mt-1 w-full bg-gpanel border border-gborder rounded-lg px-3 py-2 text-[13px] text-gtext focus:outline-none focus:border-gaccent" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={t('realtime.profileNamePlaceholder')} />
                </div>
                <div>
                  <label className="text-[11px] text-gdim uppercase tracking-wider">{t('realtime.game')}</label>
                  <select className="mt-1 w-full bg-gpanel border border-gborder rounded-lg px-3 py-2 text-[13px] text-gtext focus:outline-none focus:border-gaccent" value={formGame} onChange={(e) => setFormGame(e.target.value)}>
                    <option value="">{t('realtime.selectGame')}</option>
                    {rtGames.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-gdim uppercase tracking-wider">{t('realtime.priority')}</label>
                  <select className="mt-1 w-full bg-gpanel border border-gborder rounded-lg px-3 py-2 text-[13px] text-gtext focus:outline-none focus:border-gaccent" value={formPriority} onChange={(e) => setFormPriority(e.target.value as any)}>
                    <option value="normal">{t('realtime.normal')}</option>
                    <option value="high">{t('realtime.high')}</option>
                    <option value="realtime">{t('realtime.realtime')}</option>
                  </select>
                </div>
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 text-[13px] text-gmuted cursor-pointer">
                    <input type="checkbox" checked={formMemClean} onChange={(e) => setFormMemClean(e.target.checked)} className="accent-gaccent" />
                    {t('realtime.memoryClean')}
                  </label>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="primary" size="sm" onClick={() => saveProfile()}>{t('common.confirm')}</Button>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {profiles.map((p) => (
              <Card key={p.id} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gpanel2 shrink-0">
                  <Gauge size={20} className="text-gdim" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-gtext">{p.name}</span>
                    {p.game && <StatusBadge tone="ok">{p.game}</StatusBadge>}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-[10px] text-gdim">
                    <span>{t('realtime.priority')}: <span className="text-gtext">{p.priority}</span></span>
                    <span>{t('realtime.powerPlan')}: <span className="text-gtext">{p.powerPlan.includes('8c5e7fda') ? t('realtime.powerPlanHigh') : t('realtime.powerPlanBalanced')}</span></span>
                    <span>{t('realtime.memoryClean')}: <span className="text-gtext">{p.memoryClean ? t('common.yes') : t('common.no')}</span></span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" loading={applying === p.id} icon={<Play size={14} />} onClick={() => applyProfile(p.id)}>{t('common.apply')}</Button>
                  <Button variant="outline-danger" size="sm" icon={<Trash2 size={14} />} onClick={() => deleteProfile(p.id)} />
                </div>
              </Card>
            ))}
            {profiles.length === 0 && !rtLoading && (
              <Card className="text-center py-8">
                <p className="text-gdim text-[13px]">{t('realtime.noProfiles')}</p>
              </Card>
            )}
          </div>
        </>
      )}

      {/* ==================== NEW OPTIMIZATION MODAL ==================== */}
      <Modal open={showNewOpt} onClose={() => { setShowNewOpt(false); setSelectedGame(null); }} title={t('gameOpt.newProfile')}>
        <div className="space-y-4">
          {!selectedGame && (
            <div>
              <label className="text-[11px] text-gdim uppercase tracking-wider mb-2 block">{t('gameOpt.selectGame')}</label>
              <div className="max-h-[240px] overflow-y-auto space-y-1">
                {games.map(game => (
                  <button
                    key={game.id}
                    onClick={() => { setSelectedGame(game); setNewOpt(prev => ({ ...prev, name: game.name })); }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gpanel2 transition text-[13px] text-gtext flex items-center gap-2"
                  >
                    <GameLogo name={game.name} size={22} />
                    <span className="truncate flex-1">{game.name}</span>
                    <span className="text-[10px] text-gdim shrink-0">{PLATFORM_LABELS[game.platform]}</span>
                    {game.running && <StatusBadge tone="ok"><Play size={8} /></StatusBadge>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedGame && (
            <>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-gpanel2">
                <GameLogo name={selectedGame.name} size={28} />
                <span className="text-[13px] font-semibold text-gtext">{selectedGame.name}</span>
                <button onClick={() => setSelectedGame(null)} className="ml-auto text-gdim hover:text-gtext"><X size={14} /></button>
              </div>

              <div>
                <label className="text-[11px] text-gdim uppercase tracking-wider mb-1 block">{t('gameOpt.profileName')}</label>
                <input type="text" value={newOpt.name} onChange={e => setNewOpt(prev => ({ ...prev, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-gbase2 border border-gborder text-[13px] text-gtext focus:outline-none focus:border-gaccent" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-[12px] text-gtext">
                  <input type="checkbox" checked={newOpt.applyPowerPlan} onChange={e => setNewOpt(prev => ({ ...prev, applyPowerPlan: e.target.checked }))} className="accent-green-500" />
                  {t('gameOpt.powerPlan')}
                </label>
                <label className="flex items-center gap-2 text-[12px] text-gtext">
                  <input type="checkbox" checked={newOpt.memoryClean} onChange={e => setNewOpt(prev => ({ ...prev, memoryClean: e.target.checked }))} className="accent-green-500" />
                  {t('gameOpt.memoryClean')}
                </label>
                <label className="flex items-center gap-2 text-[12px] text-gtext">
                  <input type="checkbox" checked={newOpt.gameDvrOff} onChange={e => setNewOpt(prev => ({ ...prev, gameDvrOff: e.target.checked }))} className="accent-green-500" />
                  Game DVR Off
                </label>
                <label className="flex items-center gap-2 text-[12px] text-gtext">
                  <input type="checkbox" checked={newOpt.gameModeOn} onChange={e => setNewOpt(prev => ({ ...prev, gameModeOn: e.target.checked }))} className="accent-green-500" />
                  Game Mode
                </label>
                <label className="flex items-center gap-2 text-[12px] text-gtext">
                  <input type="checkbox" checked={newOpt.fullscreenOptOff} onChange={e => setNewOpt(prev => ({ ...prev, fullscreenOptOff: e.target.checked }))} className="accent-green-500" />
                  {t('gameOpt.fullscreenOpt')}
                </label>
                <label className="flex items-center gap-2 text-[12px] text-gtext">
                  <input type="checkbox" checked={newOpt.networkOptimize} onChange={e => setNewOpt(prev => ({ ...prev, networkOptimize: e.target.checked }))} className="accent-green-500" />
                  {t('gameOpt.networkOpt')}
                </label>
              </div>

              <div>
                <label className="text-[11px] text-gdim uppercase tracking-wider mb-1 block">{t('gameOpt.priority')}</label>
                <select value={newOpt.priority} onChange={e => setNewOpt(prev => ({ ...prev, priority: e.target.value as any }))} className="w-full px-3 py-2 rounded-lg bg-gbase2 border border-gborder text-[13px] text-gtext focus:outline-none focus:border-gaccent">
                  <option value="normal">{t('gameOpt.priorityNormal')}</option>
                  <option value="high">{t('gameOpt.priorityHigh')}</option>
                  <option value="realtime">{t('gameOpt.priorityRealtime')}</option>
                </select>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => { setShowNewOpt(false); setSelectedGame(null); }}>{t('common.cancel')}</Button>
            {selectedGame && (
              <Button variant="primary" size="sm" onClick={createOptimization}>{t('gameOpt.create')}</Button>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOn}
        title={t('gaming.confirmOnTitle')}
        confirmLabel={t('gaming.confirmOnBtn')}
        message={t('gaming.confirmOnMsg', {
          power: applyPowerPlan ? t('gaming.confirmOnPower') : '',
          memory: memoryClean ? t('gaming.confirmOnMemory') : '',
        })}
        onCancel={() => setConfirmOn(false)}
        onConfirm={() => { setConfirmOn(false); activate(); }}
      />
      <ConfirmDialog
        open={confirmOff}
        title={t('gaming.confirmOffTitle')}
        danger
        confirmLabel={t('gaming.confirmOffBtn')}
        message={t('gaming.confirmOffMsg')}
        onCancel={() => setConfirmOff(false)}
        onConfirm={() => { setConfirmOff(false); deactivate(); }}
      />
    </div>
  );
}
