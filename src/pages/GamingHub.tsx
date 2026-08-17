import { useEffect, useState } from 'react';
import {
  Gamepad2, Power, PowerOff, CheckCircle2, AlertTriangle, Rocket, Zap, ShieldCheck,
  Crosshair, RefreshCw, Power as PowerIcon, Cpu, Wifi, Play, Square, Plus, Trash2,
  Gauge,
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
import type { GamingModeResult, BoostStatus, DetectedGame, GameOptimization, GameBoostStatus, GameProfile } from '../lib/types';

const PLATFORM_ICONS: Record<string, string> = {
  steam: '🎮',
  epic: '🎯',
  riot: '⚔️',
  xbox: '🟢',
  gog: '🟡',
  other: '🎲',
};

const PLATFORM_LABELS: Record<string, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  riot: 'Riot Games',
  xbox: 'Xbox / Game Pass',
  gog: 'GOG',
  other: 'Otro',
};

function genId() { return `prf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }

type Tab = 'gaming' | 'optimizer' | 'profiles';

export default function GamingHub() {
  const { t } = useI18n();
  const toast = useAppStore((s) => s.toast);
  const [tab, setTab] = useState<Tab>('gaming');

  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applyPowerPlan, setApplyPowerPlan] = useState(true);
  const [memoryClean, setMemoryClean] = useState(true);
  const [confirmOn, setConfirmOn] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [boost, setBoost] = useState<BoostStatus | null>(null);
  const [boostBusy, setBoostBusy] = useState(false);

  const [games, setGames] = useState<DetectedGame[]>([]);
  const [optimizations, setOptimizations] = useState<GameOptimization[]>([]);
  const [boostStatus, setBoostStatus] = useState<GameBoostStatus | null>(null);
  const [loading, setLoading] = useState(true);
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
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formGame, setFormGame] = useState('');
  const [formPower, setFormPower] = useState('8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
  const [formPriority, setFormPriority] = useState<'normal' | 'high' | 'realtime'>('high');
  const [formMemClean, setFormMemClean] = useState(true);

  useEffect(() => {
    api.gaming.status().then((s) => setActive(s.active)).catch(() => undefined);
    api.boost.status().then(setBoost).catch(() => undefined);
    loadGames();
    loadProfiles();
  }, []);

  const activate = async () => {
    setBusy(true);
    const r: GamingModeResult = await api.gaming.activate({ applyPowerPlan, memoryClean }).catch(() => ({
      active: false,
      applied: [],
      failed: ['error'],
      messages: [t('gaming.commError')],
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

  const toggleBoost = async () => {
    setBoostBusy(true);
    const r = boost?.gaming.active
      ? await api.boost.gamingStop().catch(() => null)
      : await api.boost.gamingStart().catch(() => null);
    setBoostBusy(false);
    if (!r) {
      toast('error', t('common.error'), t('gaming.commError'));
      return;
    }
    setBoost(r);
    if (r.gaming.active) {
      toast('success', t('gaming.boostActivated'), r.gaming.details.join(' · '));
    } else {
      toast('info', t('gaming.boostDeactivated'), r.gaming.details.join(' · ') || t('gaming.boostRestored'));
    }
    if (r.gaming.warnings.length) {
      toast('info', t('gaming.warnings'), r.gaming.warnings.join(' · '));
    }
  };

  const loadGames = async () => {
    setLoading(true);
    try {
      const [installed, opts, status] = await Promise.all([
        api.games.installed(),
        api.games.optimizations(),
        api.games.boostStatus(),
      ]);
      setGames(installed);
      setOptimizations(opts);
      setBoostStatus(status);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const createOptimization = async () => {
    if (!selectedGame) return;
    const opt: GameOptimization = {
      id: `gameopt-${Date.now().toString(36)}`,
      gameId: selectedGame.id,
      name: newOpt.name || selectedGame.name,
      ...newOpt,
      cpuCoreAffinity: null,
      autoApply: false,
      createdAt: new Date().toISOString(),
    };
    const saved = await api.games.saveOptimization(opt).catch(() => null);
    if (saved) {
      toast('success', t('gameOpt.saved'), t('gameOpt.savedDesc'));
      setShowNewOpt(false);
      setSelectedGame(null);
      setNewOpt({
        name: '',
        applyPowerPlan: true,
        memoryClean: true,
        priority: 'high',
        gameDvrOff: true,
        fullscreenOptOff: true,
        gameModeOn: true,
        networkOptimize: false,
      });
      loadGames();
    } else {
      toast('error', t('common.error'), t('gameOpt.saveError'));
    }
  };

  const applyOpt = async (id: string) => {
    const r = await api.games.applyOptimization(id).catch(() => ({ ok: false, applied: [], errors: ['Error'] }));
    if (r.ok) {
      toast('success', t('gameOpt.applied'), t('gameOpt.appliedDesc'));
    } else {
      toast('error', t('common.error'), r.errors[0]);
    }
  };

  const deactivateOpt = async (id: string) => {
    const r = await api.games.deactivateOptimization(id).catch(() => ({ ok: false, applied: [], errors: ['Error'] }));
    if (r.ok) {
      toast('info', t('gameOpt.deactivated'), t('gameOpt.deactivatedDesc'));
      loadGames();
    }
  };

  const deleteOpt = async (id: string) => {
    await api.games.deleteOptimization(id).catch(() => {});
    toast('info', t('gameOpt.deleted'), '');
    loadGames();
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
      id: genId(),
      name: formName.trim(),
      game: formGame.trim(),
      powerPlan: formPower,
      priority: formPriority,
      memoryClean: formMemClean,
      tweaks: [],
      autoApply: false,
      createdAt: new Date().toISOString(),
    };
    await api.profiles.save(profile);
    toast('success', t('realtime.profileSaved'));
    setShowForm(false);
    setFormName('');
    setFormGame('');
    loadProfiles();
  };

  const applyProfile = async (id: string) => {
    setApplying(id);
    const r = await api.profiles.apply(id).catch(() => ({ ok: false, applied: [], errors: ['Error'] }));
    setApplying(null);
    if (r.ok) {
      toast('success', t('realtime.profileApplied'), r.applied.join(' · '));
    } else {
      toast('error', t('common.error'), r.errors.join(' · '));
    }
  };

  const deleteProfile = async (id: string) => {
    await api.profiles.delete(id);
    toast('info', t('realtime.profileDeleted'));
    loadProfiles();
  };

  const runningGames = games.filter(g => g.running);
  const installedGames = games.filter(g => !g.running);

  const TABS: { id: Tab; label: string; icon: typeof Gamepad2 }[] = [
    { id: 'gaming', label: 'Modo Gaming', icon: Gamepad2 },
    { id: 'optimizer', label: 'Game Optimizer', icon: Crosshair },
    { id: 'profiles', label: 'Perfiles', icon: Gauge },
  ];

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader title={t('gaming.title')} subtitle={t('gaming.subtitle')} />

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

      {tab === 'gaming' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1 flex flex-col" noPadding>
              <div className="p-5 flex-1 flex flex-col items-center justify-center text-center">
                <div
                  className={`w-40 h-40 rounded-full flex items-center justify-center mb-5 transition-all duration-300 ${
                    active ? 'border-2 border-gaccent shadow-[0_0_40px_rgba(0,255,136,0.4)]' : 'border border-gborder2'
                  }`}
                >
                  <Gamepad2
                    size={64}
                    className={active ? 'text-gaccent animate-glow rounded-full' : 'text-gdim'}
                    strokeWidth={1.4}
                  />
                </div>

                <div className="font-mono text-[16px] font-bold tracking-widest uppercase">
                  {active ? (
                    <span className="text-gaccent text-glow">● {t('gaming.modeActive')}</span>
                  ) : (
                    <span className="text-gdim">{t('gaming.modeInactive')}</span>
                  )}
                </div>
                <p className="text-[12px] text-gmuted mt-2 max-w-[260px] leading-relaxed">
                  {active ? t('gaming.activeDesc') : t('gaming.inactiveDesc')}
                </p>

                <div className="mt-6 w-full max-w-[260px] space-y-3">
                  <div className="flex items-center justify-between text-[12.5px] text-gmuted">
                    <span>{t('gaming.powerPlan')}</span>
                    <Toggle checked={applyPowerPlan} onChange={setApplyPowerPlan} disabled={active} />
                  </div>
                  <div className="flex items-center justify-between text-[12.5px] text-gmuted">
                    <span>{t('gaming.memoryClean')}</span>
                    <Toggle checked={memoryClean} onChange={setMemoryClean} disabled={active} />
                  </div>
                </div>

                <div className="mt-7 flex gap-3">
                  {!active ? (
                    <Button size="lg" icon={<Power size={16} />} loading={busy} onClick={() => setConfirmOn(true)}>
                      {t('gaming.activate')}
                    </Button>
                  ) : (
                    <Button size="lg" variant="outline-danger" icon={<PowerOff size={16} />} loading={busy} onClick={() => setConfirmOff(true)}>
                      {t('gaming.deactivate')}
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-2" title={t('gaming.whatItDoes')}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {['gaming.fact1', 'gaming.fact2', 'gaming.fact3', 'gaming.fact4'].map((k) => (
                  <div key={k} className="flex items-start gap-2 py-1.5">
                    <CheckCircle2 size={14} className="text-gaccent shrink-0 mt-0.5" />
                    <span className="text-[12.5px] text-gmuted leading-relaxed">{t(k)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-start gap-2 border-t border-gborder/30 pt-3">
                <ShieldCheck size={14} className="text-gaccent shrink-0 mt-0.5" />
                <span className="text-[12px] text-gdim leading-relaxed">{t('gaming.safetyNote')}</span>
              </div>
            </Card>
          </div>

          <Card
            title={
              <span className="flex items-center gap-2">
                <Rocket size={15} className="text-gaccent" />
                {t('gaming.fpsBoost')}
              </span>
            }
            subtitle={t('gaming.fpsBoostSub')}
            className={`relative overflow-hidden mt-4 ${boost?.gaming.active ? 'border-gaccent/40' : ''}`}
          >
            {boost?.gaming.active && <div className="scanline" />}
            <div className="flex flex-col lg:flex-row lg:items-center gap-5">
              <div className="flex-1 min-w-0">
                {boost?.gaming.active ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <StatusBadge tone="active" dot>{t('gaming.boostActive')}</StatusBadge>
                      {boost.gaming.game && (
                        <span className="text-[12.5px] text-gtext font-medium flex items-center gap-1.5">
                          <Gamepad2 size={14} className="text-gaccent" />
                          {t('gaming.boostGame')}: <span className="text-gaccent">{boost.gaming.game}</span>
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {boost.gaming.details.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12.5px] text-gmuted">
                          <CheckCircle2 size={14} className="text-gaccent shrink-0 mt-0.5" />
                          {d}
                        </li>
                      ))}
                      {boost.gaming.warnings.map((w, i) => (
                        <li key={`w${i}`} className="flex items-start gap-2 text-[12.5px] text-gwarn">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-[13px] text-gmuted leading-relaxed">{t('gaming.boostInactive')}</div>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-3">
                {boost?.gaming.active && (
                  <div className="flex items-center gap-1.5 text-[11px] text-gdim">
                    <span className="live-dot inline-block w-2 h-2 rounded-full bg-gaccent" />
                    {t('gaming.live')}
                  </div>
                )}
                <Button
                  size="lg"
                  variant={boost?.gaming.active ? 'outline-danger' : undefined}
                  icon={boost?.gaming.active ? <PowerOff size={16} /> : <Zap size={16} />}
                  loading={boostBusy}
                  onClick={toggleBoost}
                >
                  {boost?.gaming.active ? t('gaming.stopBoost') : t('gaming.activateBoost')}
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}

      {tab === 'optimizer' && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-6">
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowNewOpt(true)}>
              {t('gameOpt.newOpt')}
            </Button>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={loadGames}>
              {t('common.refresh')}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="text-center">
              <div className="text-[28px] font-bold text-gaccent">{games.length}</div>
              <div className="text-[11px] text-gdim uppercase tracking-wider mt-1">{t('gameOpt.installed')}</div>
            </Card>
            <Card className="text-center">
              <div className="text-[28px] font-bold text-green-400">{runningGames.length}</div>
              <div className="text-[11px] text-gdim uppercase tracking-wider mt-1">{t('gameOpt.running')}</div>
            </Card>
            <Card className="text-center">
              <div className="text-[28px] font-bold text-blue-400">{optimizations.length}</div>
              <div className="text-[11px] text-gdim uppercase tracking-wider mt-1">{t('gameOpt.optimizations')}</div>
            </Card>
          </div>

          {runningGames.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gdim mb-3">{t('gameOpt.runningNow')}</h3>
              <div className="space-y-2">
                {runningGames.map(game => (
                  <Card key={game.id} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-500/10 shrink-0">
                      <Play size={18} className="text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-gtext">{game.name}</span>
                        <StatusBadge tone="ok"><CheckCircle2 size={10} /> {t('gameOpt.active')}</StatusBadge>
                      </div>
                      <p className="text-[11px] text-gmuted mt-0.5">
                        {PLATFORM_LABELS[game.platform]} · PID {game.pid} · {game.exe}
                      </p>
                    </div>
                    {optimizations.find(o => o.gameId === game.id) && (
                      <Button variant="primary" size="sm" onClick={() => {
                        const opt = optimizations.find(o => o.gameId === game.id);
                        if (opt) applyOpt(opt.id);
                      }}>
                        {t('gameOpt.applyProfile')}
                      </Button>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="mb-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gdim mb-3">{t('gameOpt.installedGames')}</h3>
            {installedGames.length === 0 ? (
              <Card className="text-center py-8">
                <Gamepad2 size={36} className="text-gdim mx-auto mb-3" />
                <p className="text-[13px] text-gmuted">{t('gameOpt.noGamesFound')}</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {installedGames.map(game => {
                  const opt = optimizations.find(o => o.gameId === game.id);
                  return (
                    <Card key={game.id} className="relative">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-lg">{PLATFORM_ICONS[game.platform]}</span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-gtext truncate">{game.name}</p>
                          <p className="text-[10px] text-gdim">{PLATFORM_LABELS[game.platform]}</p>
                        </div>
                      </div>
                      {game.installPath && (
                        <p className="text-[10px] text-gdim font-mono truncate mb-2">{game.installPath}</p>
                      )}
                      {opt ? (
                        <div className="flex gap-2">
                          <Button variant="primary" size="sm" onClick={() => applyOpt(opt.id)} className="flex-1">
                            {t('gameOpt.apply')}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => deactivateOpt(opt.id)}>
                            {t('gameOpt.deactivate')}
                          </Button>
                        </div>
                      ) : (
                        <Button variant="secondary" size="sm" onClick={() => {
                          setSelectedGame(game);
                          setNewOpt(prev => ({ ...prev, name: game.name }));
                          setShowNewOpt(true);
                        }} className="w-full">
                          {t('gameOpt.createProfile')}
                        </Button>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {optimizations.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gdim mb-3">{t('gameOpt.activeProfiles')}</h3>
              <div className="space-y-2">
                {optimizations.map(opt => (
                  <Card key={opt.id} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-500/10 shrink-0">
                      <Crosshair size={18} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gtext">{opt.name}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gdim">
                        {opt.applyPowerPlan && <span><PowerIcon size={10} className="inline" /> Power</span>}
                        {opt.memoryClean && <span><Zap size={10} className="inline" /> RAM</span>}
                        {opt.gameDvrOff && <span>DVR Off</span>}
                        {opt.gameModeOn && <span>Game Mode</span>}
                        <span className="capitalize">Priority: {opt.priority}</span>
                      </div>
                    </div>
                    <Button variant="primary" size="sm" onClick={() => applyOpt(opt.id)}>
                      {t('gameOpt.apply')}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => deleteOpt(opt.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <Modal open={showNewOpt} onClose={() => { setShowNewOpt(false); setSelectedGame(null); }} title={t('gameOpt.newProfile')}>
            <div className="space-y-4">
              {!selectedGame && (
                <div>
                  <label className="text-[11px] text-gdim uppercase tracking-wider mb-2 block">{t('gameOpt.selectGame')}</label>
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {games.map(game => (
                      <button
                        key={game.id}
                        onClick={() => { setSelectedGame(game); setNewOpt(prev => ({ ...prev, name: game.name })); }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-gpanel2 transition text-[13px] text-gtext flex items-center gap-2"
                      >
                        <span>{PLATFORM_ICONS[game.platform]}</span>
                        <span className="truncate">{game.name}</span>
                        {game.running && <StatusBadge tone="ok"><Play size={8} /></StatusBadge>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedGame && (
                <>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-gpanel2">
                    <span className="text-lg">{PLATFORM_ICONS[selectedGame.platform]}</span>
                    <span className="text-[13px] font-semibold text-gtext">{selectedGame.name}</span>
                  </div>

                  <div>
                    <label className="text-[11px] text-gdim uppercase tracking-wider mb-1 block">{t('gameOpt.profileName')}</label>
                    <input
                      type="text"
                      value={newOpt.name}
                      onChange={e => setNewOpt(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-gbase2 border border-gborder text-[13px] text-gtext focus:outline-none focus:border-gaccent"
                    />
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
                    <select
                      value={newOpt.priority}
                      onChange={e => setNewOpt(prev => ({ ...prev, priority: e.target.value as any }))}
                      className="w-full px-3 py-2 rounded-lg bg-gbase2 border border-gborder text-[13px] text-gtext focus:outline-none focus:border-gaccent"
                    >
                      <option value="normal">{t('gameOpt.priorityNormal')}</option>
                      <option value="high">{t('gameOpt.priorityHigh')}</option>
                      <option value="realtime">{t('gameOpt.priorityRealtime')}</option>
                    </select>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" onClick={() => { setShowNewOpt(false); setSelectedGame(null); }}>
                  {t('common.cancel')}
                </Button>
                {selectedGame && (
                  <Button variant="primary" size="sm" onClick={createOptimization}>
                    {t('gameOpt.create')}
                  </Button>
                )}
              </div>
            </div>
          </Modal>
        </>
      )}

      {tab === 'profiles' && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-6">
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={loadProfiles}>
              {t('common.refresh')}
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowForm(!showForm)}>
              {t('realtime.newProfile')}
            </Button>
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
                  <input
                    className="mt-1 w-full bg-gpanel border border-gborder rounded-lg px-3 py-2 text-[13px] text-gtext focus:outline-none focus:border-gaccent"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t('realtime.profileNamePlaceholder')}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gdim uppercase tracking-wider">{t('realtime.game')}</label>
                  <select
                    className="mt-1 w-full bg-gpanel border border-gborder rounded-lg px-3 py-2 text-[13px] text-gtext focus:outline-none focus:border-gaccent"
                    value={formGame}
                    onChange={(e) => setFormGame(e.target.value)}
                  >
                    <option value="">{t('realtime.selectGame')}</option>
                    {rtGames.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-gdim uppercase tracking-wider">{t('realtime.priority')}</label>
                  <select
                    className="mt-1 w-full bg-gpanel border border-gborder rounded-lg px-3 py-2 text-[13px] text-gtext focus:outline-none focus:border-gaccent"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as any)}
                  >
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
                    <span>{t('realtime.powerPlan')}: <span className="text-gtext">{p.powerPlan.includes('8c5e7fda') ? 'Alto rendimiento' : 'Equilibrado'}</span></span>
                    <span>{t('realtime.memoryClean')}: <span className="text-gtext">{p.memoryClean ? t('common.yes') : t('common.no')}</span></span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={applying === p.id}
                    icon={<Play size={14} />}
                    onClick={() => applyProfile(p.id)}
                  >
                    {t('common.apply')}
                  </Button>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    onClick={() => deleteProfile(p.id)}
                  />
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

      <ConfirmDialog
        open={confirmOn}
        title={t('gaming.confirmOnTitle')}
        confirmLabel={t('gaming.confirmOnBtn')}
        message={t('gaming.confirmOnMsg', {
          power: applyPowerPlan ? t('gaming.confirmOnPower') : '',
          memory: memoryClean ? t('gaming.confirmOnMemory') : '',
        })}
        onCancel={() => setConfirmOn(false)}
        onConfirm={() => {
          setConfirmOn(false);
          activate();
        }}
      />
      <ConfirmDialog
        open={confirmOff}
        title={t('gaming.confirmOffTitle')}
        danger
        confirmLabel={t('gaming.confirmOffBtn')}
        message={t('gaming.confirmOffMsg')}
        onCancel={() => setConfirmOff(false)}
        onConfirm={() => {
          setConfirmOff(false);
          deactivate();
        }}
      />
    </div>
  );
}
