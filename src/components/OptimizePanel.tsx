import { useEffect, useState } from 'react';
import {
  Rocket,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ShieldAlert,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronUp,
  Info,
  XCircle,
  MinusCircle,
  User,
  Server,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { StatusBadge } from './ui/StatusBadge';
import { Toggle } from './ui/Toggle';
import { formatBytes } from '../lib/format';
import { useI18n, useTweakMeta } from '../lib/i18n';
import type { OptimizationPreview, OptimizationReport, OptAction } from '../lib/types';

const STEPS = ['measure', 'scan', 'apply', 'verify', 'done'];

const STATUS_ICON = {
  apply: <Zap size={13} className="text-gaccent shrink-0 mt-0.5" />,
  applied: <CheckCircle2 size={13} className="text-gaccent shrink-0 mt-0.5" />,
  already: <CheckCircle2 size={13} className="text-ginfo shrink-0 mt-0.5" />,
  'requires-admin': <ShieldAlert size={13} className="text-gwarn shrink-0 mt-0.5" />,
  'not-needed': <MinusCircle size={13} className="text-gdim shrink-0 mt-0.5" />,
  'skipped-risky': <AlertTriangle size={13} className="text-gwarn shrink-0 mt-0.5" />,
  failed: <XCircle size={13} className="text-gdanger shrink-0 mt-0.5" />,
};

function ActionRow({ action }: { action: OptAction }) {
  const { t } = useI18n();
  const meta = useTweakMeta(action.id, action.name, action.description);
  const reason = action.reasonKey ? t(action.reasonKey, action.id === 'storage_sense' ? { gb: Math.round(parseFloat(action.reason?.replace(/[^0-9.]/g, '') || '0') || 0) } : undefined) : action.reason;
  return (
    <li className="flex items-start gap-2 py-1.5 border-b border-gborder/30 last:border-0">
      {STATUS_ICON[action.status]}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12.5px] text-gtext">{meta.name}</span>
          {action.requiresAdmin && (
            <span className="flex items-center gap-0.5 text-[9.5px] text-gwarn">
              {action.scope === 'system' ? <Server size={10} /> : <User size={10} />} {t('common.admin')}
            </span>
          )}
        </div>
        <div className="text-[11px] text-gdim">{reason}</div>
      </div>
      <StatusBadge tone={action.status === 'applied' ? 'active' : action.status === 'already' ? 'info' : action.status === 'apply' ? 'ok' : action.status === 'failed' ? 'bad' : 'muted'}>
        {t(`optimization.status.${action.status}`)}
      </StatusBadge>
    </li>
  );
}

function StatusCounts({ preview }: { preview: OptimizationPreview }) {
  const { t } = useI18n();
  const chips: Array<{ n: number; label: string; tone: 'active' | 'ok' | 'warn' | 'info' | 'muted' }> = [
    { n: preview.availableCount, label: t('optimization.status.apply'), tone: 'active' },
    { n: preview.already, label: t('optimization.status.already'), tone: 'info' },
    { n: preview.requiresAdmin, label: t('optimization.status.requires-admin'), tone: 'warn' },
    { n: preview.notNeeded, label: t('optimization.status.not-needed'), tone: 'muted' },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) =>
        c.n > 0 ? (
          <StatusBadge key={c.label} tone={c.tone} dot={c.tone === 'active'}>
            <span className="font-mono">{c.n}</span> {c.label}
          </StatusBadge>
        ) : null
      )}
    </div>
  );
}

export function OptimizePanel() {
  const toast = useAppStore((s) => s.toast);
  const setPage = useAppStore((s) => s.setPage);
  const appInfo = useAppStore((s) => s.appInfo);
  const { t } = useI18n();

  const [preview, setPreview] = useState<OptimizationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [includeRisky, setIncludeRisky] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [report, setReport] = useState<OptimizationReport | null>(null);
  const [details, setDetails] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);

  useEffect(() => {
    api.optimization
      .scan()
      .then((p) => {
        setPreview(p);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    return api.on('optimization:progress', (p: { step: string }) => setStep(p.step));
  }, []);

  const refreshPreview = async () => {
    const p = await api.optimization.scan().catch(() => null);
    if (p) setPreview(p);
  };

  const run = async () => {
    setRunning(true);
    setReport(null);
    setStep('measure');
    try {
      const r = await api.optimization.run({ includeRisky });
      setReport(r);
      setStep(null);
      await refreshPreview();
      toast(
        'success',
        t('optimization.completed'),
        `${t('optimization.appliedCount', { n: r.appliedCount })}${r.requiresRestart ? ' · ' + t('optimization.requiresRestart') : ''}`
      );
    } catch (e: any) {
      setStep(null);
      toast('error', t('common.error'), e.message || t('optimization.error'));
    } finally {
      setRunning(false);
    }
  };

  const relaunchAdmin = async () => {
    setAdminBusy(true);
    const r = await api.app.relaunchAsAdmin();
    setAdminBusy(false);
    if (!r.ok) toast('error', t('adminbanner.relaunchError'), r.error);
  };

  const sortedActions = preview?.actions
    ? [...preview.actions].sort((a, b) => {
        const order: Record<string, number> = { apply: 0, 'requires-admin': 1, 'skipped-risky': 2, already: 3, 'not-needed': 4, failed: 5 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      })
    : [];
  const needsAdmin = (preview?.requiresAdmin ?? 0) > 0 && !(appInfo?.isAdmin ?? true);
  const reportActions = report ? [...report.actions].sort((a, b) => (a.status === b.status ? 0 : a.status === 'applied' ? -1 : 1)) : [];

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Rocket size={15} className="text-gaccent" />
          {t('optimization.title')}
        </span>
      }
      subtitle={t('optimization.subtitle')}
      className="relative overflow-hidden"
    >
      {running && <div className="scanline" />}

      {!running && !report && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex-1 min-w-0">
              {loading || !preview ? (
                <div className="text-[12.5px] text-gdim animate-blink">{t('optimization.analyzing')}</div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[13px] text-gtext font-medium">
                      {preview.availableCount > 0 ? (
                        <>
                          <span className="text-gaccent font-bold">{preview.availableCount}</span>{' '}
                          {t('optimization.available', { n: preview.availableCount })}
                        </>
                      ) : (
                        t('optimization.optimized')
                      )}
                    </span>
                  </div>
                  <StatusCounts preview={preview} />
                  {preview.lastRun && (
                    <div className="text-[11px] text-gdim flex items-center gap-1.5 pt-1">
                      <RotateCcw size={11} /> {t('optimization.lastRun', { date: preview.lastRun })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-3">
              <div className="flex items-center gap-3">
                {needsAdmin && (
                  <Button variant="secondary" size="lg" icon={<ShieldAlert size={16} />} loading={adminBusy} onClick={relaunchAdmin}>
                    {t('optimization.runAdmin')}
                  </Button>
                )}
                <Button size="lg" icon={<Zap size={16} />} onClick={run} disabled={running || loading || !preview}>
                  {t('optimization.runButton')}
                </Button>
              </div>
              <label className="flex items-center gap-2 text-[11.5px] text-gmuted cursor-pointer select-none">
                <Toggle checked={includeRisky} onChange={setIncludeRisky} />
                {t('optimization.includeRisky')}
              </label>
            </div>
          </div>

          {preview && (
            <>
              <div>
                <div className="text-[10.5px] uppercase tracking-widest text-gdim mb-2">{t('optimization.diagnosis.title')}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {preview.diagnosis.map((f) => (
                    <div key={f.id} className="flex items-center gap-1.5 text-[11.5px] text-gmuted">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          f.status === 'ok' ? 'bg-gaccent' : f.status === 'warn' ? 'bg-gwarn' : 'bg-gdim'
                        }`}
                      />
                      <span className="text-gdim">{t(`diag.${f.id}`)}:</span>
                      <span className="font-mono truncate max-w-[220px]" title={f.value}>
                        {f.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <button
                  onClick={() => setDetails((v) => !v)}
                  className="flex items-center gap-1.5 text-[11px] text-gdim hover:text-gaccent transition-colors"
                >
                  {details ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {details ? t('common.lessInfo') : t('common.moreInfo')}
                </button>
                {details && (
                  <ul className="mt-1">
                    {sortedActions.map((a) => (
                      <ActionRow key={a.id} action={a} />
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {running && (
        <div className="space-y-3 py-2">
          {STEPS.map((s, i) => {
            const idx = step ? STEPS.indexOf(step) : -1;
            return (
              <div
                key={s}
                className={`flex items-center gap-3 text-[13px] ${
                  step === s ? 'text-gtext' : i < idx ? 'text-gmuted' : 'text-gdim/50'
                }`}
              >
                {i < idx ? (
                  <CheckCircle2 size={16} className="text-gaccent shrink-0" />
                ) : step === s ? (
                  <span className="w-4 h-4 rounded-full border-2 border-gaccent border-t-transparent animate-spin shrink-0" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-gborder shrink-0" />
                )}
                {t(`optimization.step.${s}`)}
              </div>
            );
          })}
          <div className="flex items-center gap-1.5 text-[11px] text-gdim pt-1">
            <Info size={12} /> {t('optimization.restoreHint')}
          </div>
        </div>
      )}

      {!running && report && (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            <StatusBadge tone="active" dot>{t('optimization.completed')}</StatusBadge>
            <span className="text-[13px] text-gtext">
              <span className="text-gaccent font-bold">{report.appliedCount}</span>{' '}
              {t('optimization.appliedCount', { n: report.appliedCount })}
            </span>
            {report.alreadyCount > 0 && (
              <span className="text-[12px] text-gmuted">· {t('optimization.alreadyCount', { n: report.alreadyCount })}</span>
            )}
            {report.requiresAdminCount > 0 && (
              <span className="text-[12px] text-gwarn">· {t('optimization.adminCount', { n: report.requiresAdminCount })}</span>
            )}
            {report.notNeededCount > 0 && (
              <span className="text-[12px] text-gdim">· {t('optimization.notNeededCount', { n: report.notNeededCount })}</span>
            )}
            {report.failedCount > 0 && (
              <span className="text-[12px] text-gdanger">· {t('optimization.failedCount', { n: report.failedCount })}</span>
            )}
            {report.requiresRestart && <StatusBadge tone="warn">{t('optimization.requiresRestart')}</StatusBadge>}
          </div>

          <div>
            <div className="text-[10.5px] uppercase tracking-widest text-gdim mb-1.5">
              {t('optimization.diagnosis.title')}
            </div>
            <ul>
              {reportActions.map((a) => (
                <ActionRow key={a.id} action={a} />
              ))}
            </ul>
          </div>

          {report.requiresAdminCount > 0 && (
            <div className="text-[12.5px] text-gwarn flex items-start gap-2">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              {t('optimization.adminNeeded', { n: report.requiresAdminCount })}
            </div>
          )}

          {report.warnings.length > 0 && (
            <div className="text-[12px] text-gwarn flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              {t('optimization.warnings', { n: report.warnings.length, list: report.warnings.join(' · ') })}
            </div>
          )}

          {report.tempBytes > 0 && (
            <div className="text-[12px] text-gwarn flex items-start gap-2">
              <Trash2 size={14} className="shrink-0 mt-0.5" />
              {t('optimization.tempHint', { size: formatBytes(report.tempBytes) })}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" size="sm" icon={<RotateCcw size={13} />} onClick={() => setPage('restore')}>
              {t('optimization.viewRestore')}
            </Button>
            <Button variant="ghost" size="sm" onClick={run} disabled={running}>
              {t('optimization.rerunButton')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
