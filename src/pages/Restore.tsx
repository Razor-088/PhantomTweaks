import { useEffect, useState } from 'react';
import { RotateCcw, History, ShieldPlus, Database, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfirmDialog } from '../components/ui/Modal';
import { PageSpinner, EmptyState } from '../components/ui/Spinner';
import type { ChangeRecord } from '../lib/types';

const CATEGORY_TONE: Record<string, 'ok' | 'info' | 'warn' | 'muted'> = {
  windows: 'info',
  gaming: 'warn',
  privacy: 'ok',
  system: 'muted',
  cleanup: 'muted',
  network: 'info',
  performance: 'info',
};

export default function Restore() {
  const [history, setHistory] = useState<ChangeRecord[]>([]);
  const [points, setPoints] = useState<Array<{ date: string; description: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState<ChangeRecord | null>(null);
  const toast = useAppStore((s) => s.toast);
  const { t } = useI18n();

  const load = async () => {
    setLoading(true);
    const [h, p] = await Promise.all([api.restore.history(), api.restore.points()]);
    setHistory(h);
    setPoints(p);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const revert = async () => {
    if (!confirmRevert) return;
    setBusyId(confirmRevert.id);
    const r = await api.restore.revert(confirmRevert.id);
    setBusyId(null);
    setConfirmRevert(null);
    if (r.ok) {
      toast('success', t('restore.revertedToast'), confirmRevert.name);
    } else {
      toast('error', t('restore.revertFailed'), r.error);
    }
    load();
  };

  const createPoint = async () => {
    setCreating(true);
    const r = await api.restore.createPoint();
    setCreating(false);
    if (r.ok) {
      toast('success', t('restore.pointCreated'));
    } else {
      toast('warning', t('restore.pointFailed'), r.error);
    }
    load();
  };

  const reverted = history.filter((h) => h.reverted).length;

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title={t('restore.title')}
        subtitle={t('restore.subtitle')}
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<ShieldPlus size={14} />}
            loading={creating}
            onClick={createPoint}
          >
            {t('restore.createPoint')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <Card title={t('restore.historyTitle')} subtitle={t('restore.historyCount', { n: history.length, m: reverted })} className="lg:col-span-2">
          {loading ? (
            <PageSpinner text={t('restore.loading')} />
          ) : history.length === 0 ? (
            <EmptyState
              icon={<History size={28} />}
              title={t('restore.emptyTitle')}
              description={t('restore.emptyDesc')}
            />
          ) : (
            <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
              {history.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    c.reverted ? 'border-gborder opacity-55' : 'border-gborder2 bg-gpanel2/50'
                  }`}
                >
                  <div className={`shrink-0 ${c.reverted ? 'text-gdim' : 'text-gaccent'}`}>
                    {c.reverted ? <CheckCircle2 size={17} /> : <History size={17} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium text-gtext">{c.name}</div>
                    <div className="text-[11px] text-gdim font-mono truncate" title={c.action}>
                      {c.action}
                    </div>
                    <div className="text-[10.5px] text-gdim mt-0.5">{c.date}</div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <StatusBadge tone={CATEGORY_TONE[c.category] ?? 'muted'}>{c.category}</StatusBadge>
                    {c.reverted ? (
                      <StatusBadge tone="ok">{t('restore.revertedBadge')}</StatusBadge>
                    ) : c.reversible ? (
                      <Button
                        variant="outline-danger"
                        size="sm"
                        icon={<RotateCcw size={12} />}
                        loading={busyId === c.id}
                        onClick={() => setConfirmRevert(c)}
                      >
                        {t('restore.revertBtn')}
                      </Button>
                    ) : (
                      <StatusBadge tone="muted">{t('restore.irreversible')}</StatusBadge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title={t('restore.pointsTitle')} subtitle={t('restore.pointsSubtitle')}>
            {points.length === 0 ? (
              <div className="text-[12px] text-gdim py-4 text-center">
                {t('restore.pointsEmpty')}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {points.map((p, i) => (
                  <div key={i} className="flex items-start gap-2.5 py-1.5 border-b border-gborder/40 last:border-0">
                    <Database size={13} className="text-gaccent shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-[12px] text-gmuted truncate">{p.description}</div>
                      <div className="text-[10.5px] text-gdim font-mono">{p.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-start gap-2 text-[11px] text-gdim leading-relaxed">
              <AlertTriangle size={13} className="text-gwarn shrink-0 mt-0.5" />
              {t('restore.pointsHint')}
            </div>
          </Card>

          <Card>
            <div className="flex items-start gap-2.5">
              <Database size={15} className="text-gaccent shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-gmuted leading-relaxed">
                {t('restore.noteIntro')} <strong>{t('restore.revertBtn')}</strong> {t('restore.noteOutro')}
              </p>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmRevert}
        title={t('restore.confirmTitle')}
        confirmLabel={t('restore.confirmLabel')}
        message={
          confirmRevert && (
            <>
              <p>
                {t('restore.confirmName')} <strong className="text-gtext">{confirmRevert.name}</strong>
              </p>
              <p className="mt-1 font-mono text-[11.5px] text-gdim">{confirmRevert.action}</p>
              <p className="mt-2 text-gmuted">{t('restore.confirmActionHint')}</p>
            </>
          )
        }
        onCancel={() => setConfirmRevert(null)}
        onConfirm={revert}
        busy={busyId === confirmRevert?.id}
      />
    </div>
  );
}
