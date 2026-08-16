import { useEffect, useState } from 'react';
import { Crosshair, Gamepad2, Rocket, Zap, RefreshCw, CheckCircle2, AlertTriangle, Power, Cpu, Wifi, Play, Square, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Modal } from '../components/ui/Modal';
import { Toggle } from '../components/ui/Toggle';
import { useI18n } from '../lib/i18n';
import type { DetectedGame, GameOptimization, GameBoostStatus } from '../lib/types';

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

export default function GameOptimizer() {
  const { t } = useI18n();
  const toast = useAppStore((s) => s.toast);
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

  const scan = async () => {
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

  useEffect(() => { scan(); }, []);

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
      scan();
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
      scan();
    }
  };

  const deleteOpt = async (id: string) => {
    await api.games.deleteOptimization(id).catch(() => {});
    toast('info', t('gameOpt.deleted'), '');
    scan();
  };

  const runningGames = games.filter(g => g.running);
  const installedGames = games.filter(g => !g.running);

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('gameOpt.title')}
        subtitle={t('gameOpt.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowNewOpt(true)}>
              {t('gameOpt.newOpt')}
            </Button>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={scan}>
              {t('common.refresh')}
            </Button>
          </div>
        }
      />

      {/* Stats */}
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

      {/* Running Games */}
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

      {/* Installed Games */}
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

      {/* Active Optimizations */}
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
                    {opt.applyPowerPlan && <span><Power size={10} className="inline" /> Power</span>}
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

      {/* New Optimization Modal */}
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
    </div>
  );
}
