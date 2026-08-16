import { useEffect, useState } from 'react';
import { Gauge, Gamepad2, Plus, Trash2, Play, Square, RefreshCw, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useI18n } from '../lib/i18n';
import type { GameProfile } from '../lib/types';

function genId() { return `prf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }

export default function RealTimeOptimizer() {
  const { t } = useI18n();
  const toast = useAppStore((s) => s.toast);
  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [games, setGames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formGame, setFormGame] = useState('');
  const [formPower, setFormPower] = useState('8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
  const [formPriority, setFormPriority] = useState<'normal' | 'high' | 'realtime'>('high');
  const [formMemClean, setFormMemClean] = useState(true);

  const load = async () => {
    setLoading(true);
    const [p, g] = await Promise.all([
      api.profiles.list().catch(() => []),
      api.profiles.detectGames().catch(() => []),
    ]);
    setProfiles(p);
    setGames(g);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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
    load();
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
    load();
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('realtime.title')}
        subtitle={t('realtime.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => load()}>
              {t('common.refresh')}
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowForm(!showForm)}>
              {t('realtime.newProfile')}
            </Button>
          </div>
        }
      />

      {games.length > 0 && (
        <Card className="mb-4">
          <div className="flex items-center gap-2 text-[13px]">
            <Gamepad2 size={16} className="text-gaccent" />
            <span className="text-gtext font-semibold">{t('realtime.detectedGames')}:</span>
            <span className="text-gmuted">{games.join(', ')}</span>
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
                {games.map((g) => <option key={g} value={g}>{g}</option>)}
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
        {profiles.length === 0 && !loading && (
          <Card className="text-center py-8">
            <p className="text-gdim text-[13px]">{t('realtime.noProfiles')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
