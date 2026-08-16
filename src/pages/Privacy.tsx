import { useEffect, useState } from 'react';
import { Shield, Trash2, History, AppWindow, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TweakCard } from '../components/TweakCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfirmDialog } from '../components/ui/Modal';
import { PageSpinner } from '../components/ui/Spinner';
import type { PrivacySummary, TweakView } from '../lib/types';

export default function Privacy() {
  const [summary, setSummary] = useState<PrivacySummary | null>(null);
  const [tweaks, setTweaks] = useState<TweakView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmHistory, setConfirmHistory] = useState(false);
  const [clearing, setClearing] = useState(false);
  const toast = useAppStore((s) => s.toast);
  const settings = useAppStore((s) => s.settings);
  const { t } = useI18n();

  const load = async () => {
    setLoading(true);
    const [s, tks] = await Promise.all([api.privacy.summary(), api.tweaks.list('privacy')]);
    setSummary(s);
    setTweaks(tks);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const applyTweak = async (id: string) => {
    setBusy(id);
    const r = await api.tweaks.apply(id);
    setBusy(null);
    if (r.applied) toast('success', t('privacy.applied'), r.message);
    else toast('error', t('privacy.applyFailed'), r.message);
    load();
  };

  const revertTweak = async (id: string) => {
    setBusy(id);
    const r = await api.tweaks.revert(id);
    setBusy(null);
    if (r.reverted) toast('success', t('privacy.reverted'));
    else toast('info', t('privacy.noChanges'), r.message);
    load();
  };

  const clearHistories = async () => {
    setConfirmHistory(false);
    setClearing(true);
    const r = await api.privacy.historyClean();
    setClearing(false);
    if (r.ok) {
      toast('success', t('privacy.historiesCleared'), r.message);
      load();
    }
  };

  if (loading && !summary) return <PageSpinner text={t('privacy.loading')} />;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('privacy.title')}
        subtitle={t('privacy.subtitle')}
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={load}>
            {t('common.refresh')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <Card title={t('privacy.settingsTitle')} subtitle={t('privacy.activeCount', { n: tweaks.filter((t) => t.applied).length, total: tweaks.length })} className="lg:col-span-2">
          {tweaks.length === 0 ? (
            <div className="text-[12px] text-gdim py-6 text-center">{t('privacy.empty')}</div>
          ) : (
            <div className="space-y-3">
              {tweaks.map((t) => (
                <TweakCard
                  key={t.id}
                  tweak={t}
                  onApply={applyTweak}
                  onRevert={revertTweak}
                  busy={busy}
                  confirmChanges={settings?.confirmChanges ?? true}
                />
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title={t('privacy.historyTitle')} subtitle={t('privacy.historySubtitle')}>
            <div className="space-y-1.5">
              {summary?.historyItems.map((h) => (
                <div key={h.name} className="flex items-center justify-between text-[12.5px] py-1 border-b border-gborder/40 last:border-0">
                  <span className="text-gmuted flex items-center gap-2">
                    <History size={13} className="text-gdim" />
                    {h.name}
                  </span>
                  <span className="font-mono text-gmuted">{t('privacy.historyCount', { n: h.count })}</span>
                </div>
              ))}
            </div>
            <Button
              className="mt-3 w-full"
              variant="outline-danger"
              size="sm"
              icon={<Trash2 size={13} />}
              loading={clearing}
              onClick={() => setConfirmHistory(true)}
            >
              {t('privacy.clearHistory')}
            </Button>
          </Card>

          <Card title={t('privacy.bgAppsTitle')} subtitle={t('privacy.bgAppsSubtitle')}>
            {summary && summary.backgroundApps.length > 0 ? (
              <div className="max-h-56 overflow-y-auto space-y-1">
                {summary.backgroundApps.slice(0, 40).map((a) => (
                  <div key={a.name} className="flex items-center justify-between text-[12px] py-1">
                    <span className="text-gmuted flex items-center gap-2 min-w-0">
                      <AppWindow size={12} className="text-gdim shrink-0" />
                      <span className="truncate">{a.name}</span>
                    </span>
                    {a.status === '0' || a.status === '' ? (
                      <StatusBadge tone="muted">{t('privacy.bgAllowed')}</StatusBadge>
                    ) : (
                      <StatusBadge tone="warn">{t('privacy.bgActive')}</StatusBadge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-gdim">{t('privacy.bgEmpty')}</div>
            )}
          </Card>

          <Card>
            <div className="flex items-start gap-2.5">
              <Shield size={15} className="text-gaccent shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-gmuted leading-relaxed">
                {t('privacy.noteIntro')} <strong>{t('privacy.noteStrong')}</strong>{' '}
                {t('privacy.noteOutro')}
              </p>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmHistory}
        title={t('privacy.clearConfirmTitle')}
        danger
        confirmLabel={t('privacy.clearConfirmLabel')}
        message={t('privacy.clearConfirmMessage')}
        onCancel={() => setConfirmHistory(false)}
        onConfirm={clearHistories}
        busy={clearing}
      />
    </div>
  );
}
