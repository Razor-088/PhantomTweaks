import { useEffect, useMemo, useState } from 'react';
import { Zap, ShieldCheck, Shield, Gamepad2, Settings as SettingsIcon, RefreshCw, Wrench } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TweakCard } from '../components/TweakCard';
import { OptimizePanel } from '../components/OptimizePanel';
import { RealTimeOptimizer } from '../components/RealTimeOptimizer';
import { PageSpinner } from '../components/ui/Spinner';
import { useI18n } from '../lib/i18n';
import type { TweakView } from '../lib/types';

export default function Optimizer() {
  const [tweaks, setTweaks] = useState<TweakView[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useAppStore((s) => s.toast);
  const settings = useAppStore((s) => s.settings);
  const { t } = useI18n();

  const CATEGORIES = useMemo(
    () => [
      { id: 'all', label: t('optimizer.catAll'), icon: Zap },
      { id: 'windows', label: t('optimizer.cat.windows'), icon: SettingsIcon },
      { id: 'gaming', label: t('optimizer.cat.gaming'), icon: Gamepad2 },
      { id: 'privacy', label: t('optimizer.cat.privacy'), icon: Shield },
      { id: 'system', label: t('optimizer.cat.system'), icon: ShieldCheck },
    ],
    [t]
  );

  const load = async () => {
    setLoading(true);
    const list = await api.tweaks.list().catch(() => []);
    setTweaks(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = tweaks;
    if (settings?.infoLevel === 'basic') {
      list = list.filter((tw) => tw.risk !== 'ADVANCED');
    }
    if (category !== 'all') {
      list = list.filter((tw) => tw.category === category || (category === 'system' && tw.scope === 'system'));
    }
    return list;
  }, [tweaks, category, settings?.infoLevel]);

  const refreshStates = async () => {
    const list = await api.tweaks.list().catch(() => []);
    setTweaks(list);
  };

  const applyTweak = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.tweaks.apply(id);
      const name = tweaks.find((tw) => tw.id === id)?.name ?? 'Tweak';
      if (r.applied) {
        toast('success', t('optimizer.applied'), name);
      } else {
        toast('error', t('optimizer.applyError'), r.message);
      }
    } catch (e: any) {
      toast('error', t('common.error'), e.message);
    } finally {
      setBusy(null);
      await refreshStates();
    }
  };

  const revertTweak = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.tweaks.revert(id);
      const name = tweaks.find((tw) => tw.id === id)?.name ?? 'Tweak';
      if (r.reverted) {
        toast('success', t('optimizer.reverted'), name);
      } else {
        toast('info', t('optimizer.noChanges'), r.message);
      }
    } catch (e: any) {
      toast('error', t('common.error'), e.message);
    } finally {
      setBusy(null);
      await refreshStates();
    }
  };

  const appliedCount = tweaks.filter((tw) => tw.applied).length;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('optimizer.title')}
        subtitle={t('optimizer.subtitle')}
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={refreshStates}>
            {t('optimizer.refresh')}
          </Button>
        }
      />

      <OptimizePanel />

      <div className="mt-5">
        <RealTimeOptimizer />
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4 mt-5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium border transition-all duration-200 ${
              category === c.id
                ? 'bg-gaccent-dim text-gaccent border-gaccent/40 shadow-[0_0_12px_rgba(0,255,136,0.15)]'
                : 'text-gmuted border-gborder hover:text-gtext hover:border-gborder2 hover:-translate-y-px'
            }`}
          >
            <c.icon size={14} />
            {c.label}
          </button>
        ))}
        <span className="ml-auto text-[11.5px] text-gdim">
          {t('optimizer.activeCount', { n: appliedCount, total: tweaks.length })}
        </span>
      </div>

      {loading ? (
        <PageSpinner text={t('optimizer.loading')} />
      ) : tweaks.length === 0 ? (
        <div className="panel p-10 text-center text-[13px] text-gdim">{t('optimizer.loadError')}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 stagger">
          {filtered.map((tw) => (
            <TweakCard
              key={tw.id}
              tweak={tw}
              onApply={applyTweak}
              onRevert={revertTweak}
              busy={busy}
              confirmChanges={settings?.confirmChanges ?? true}
            />
          ))}
        </div>
      )}

      <Card className="mt-5">
        <div className="flex items-start gap-3">
          <Wrench size={16} className="text-gaccent mt-0.5 shrink-0" />
          <div className="text-[12px] text-gmuted leading-relaxed">
            <strong className="text-gtext">{t('optimizer.securityNote')}:</strong> {t('optimizer.securityNoteText')}
          </div>
        </div>
      </Card>
    </div>
  );
}
