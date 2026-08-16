import { useEffect, useMemo, useState } from 'react';
import { Server, RefreshCw, Play, Square, RotateCcw, AlertTriangle, ShieldAlert, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfirmDialog } from '../components/ui/Modal';
import { PageSpinner } from '../components/ui/Spinner';
import type { ServiceRow } from '../lib/types';

type Filter = 'all' | 'running' | 'stopped' | 'manual' | 'automatic';

const FILTERS: Filter[] = ['all', 'running', 'stopped', 'manual', 'automatic'];

export default function Services() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    service: ServiceRow;
    action: 'stop' | 'restart' | 'startup';
    startup?: string;
  } | null>(null);
  const toast = useAppStore((s) => s.toast);
  const { t } = useI18n();

  const load = async () => {
    setLoading(true);
    const list = await api.services.list().catch(() => []);
    setServices(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = services;
    if (filter === 'running') list = list.filter((s) => s.status === 'running');
    if (filter === 'stopped') list = list.filter((s) => s.status === 'stopped');
    if (filter === 'manual') list = list.filter((s) => s.startMode === 'manual');
    if (filter === 'automatic') list = list.filter((s) => s.startMode === 'automatic');
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [services, filter, query]);

  const runAction = async (service: ServiceRow, action: 'start' | 'stop' | 'restart', startup?: string) => {
    setConfirmAction(null);
    setBusy(service.name);
    const r = await api.services.control(service.name, action, startup ?? null);
    setBusy(null);
    if (r.ok) {
      toast('success', t(action === 'start' ? 'services.startedToast' : action === 'stop' ? 'services.stoppedToast' : 'services.restartedToast'), service.displayName);
      if (r.error) toast('info', t('services.notice'), r.error);
      setTimeout(load, 800);
    } else {
      toast('error', t('services.actionFailed'), r.error);
    }
  };

  const startService = (s: ServiceRow) => {
    setConfirmAction({ service: s, action: 'startup', startup: s.startMode === 'automatic' ? 'manual' : 'automatic' });
  };

  const importantCount = services.filter((s) => s.important).length;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('services.title')}
        subtitle={t('services.subtitle')}
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={load}>
            {t('common.refresh')}
          </Button>
        }
      />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-[11.5px] font-semibold border transition-all ${
              filter === f
                ? 'bg-gaccent-dim text-gaccent border-gaccent/40'
                : 'text-gmuted border-gborder hover:text-gtext'
            }`}
          >
            {t(`services.filter.${f}`)}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gdim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('services.search')}
            className="bg-gpanel border border-gborder rounded-lg pl-8 pr-3 py-1.5 text-[12.5px] text-gtext placeholder:text-gdim focus:border-gaccent/50 focus:outline-none w-52"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11.5px] text-gdim mb-3">
        <Server size={13} />
        {t('services.count', { n: services.length, m: importantCount })}
      </div>

      {loading ? (
        <PageSpinner text={t('services.loading')} />
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-gpanel z-10">
                <tr className="border-b border-gborder text-[10.5px] uppercase tracking-widest text-gdim">
                  <th className="px-4 py-3 font-medium">{t('services.colService')}</th>
                  <th className="px-4 py-3 font-medium">{t('services.colStatus')}</th>
                  <th className="px-4 py-3 font-medium">{t('services.colStartType')}</th>
                  <th className="px-4 py-3 font-medium">{t('services.colDescription')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('services.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.name} className="border-b border-gborder/40 last:border-0 hover:bg-gpanel2/60 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-gtext">{s.displayName || s.name}</span>
                        {s.important && (
                          <span className="flex items-center gap-1 text-[10px] text-gwarn" title={t('services.importantTooltip')}>
                            <ShieldAlert size={11} /> {t('services.critical')}
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-gdim font-mono">{s.name}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {s.status === 'running' ? (
                        <StatusBadge tone="ok" dot>{t('services.statusRunning')}</StatusBadge>
                      ) : (
                        <StatusBadge tone="muted" dot>{t('services.statusStopped')}</StatusBadge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11.5px] uppercase tracking-wide text-gmuted font-mono">{s.startMode || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[11.5px] text-gdim max-w-[320px] truncate" title={s.description}>
                      {s.description}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {s.status === 'running' ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Square size={12} />}
                              title={t('services.stopTitle')}
                              loading={busy === s.name}
                              onClick={() => setConfirmAction({ service: s, action: 'stop' })}
                              className="text-gdanger hover:text-gdanger"
                            >
                              {t('services.stop')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<RotateCcw size={12} />}
                              title={t('services.restartTitle')}
                              loading={busy === s.name}
                              onClick={() => setConfirmAction({ service: s, action: 'restart' })}
                            >
                              {t('services.restart')}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Play size={12} />}
                            loading={busy === s.name}
                            onClick={() => runAction(s, 'start')}
                          >
                            {t('services.start')}
                          </Button>
                        )}
                        <select
                          className="gt-select bg-gpanel2 border border-gborder rounded-md text-[11px] text-gmuted px-2 py-1 focus:border-gaccent/50 focus:outline-none"
                          value={s.startMode}
                          title={t('services.startupTitle')}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val !== s.startMode) {
                              setConfirmAction({ service: s, action: 'startup', startup: val });
                            }
                          }}
                          disabled={busy === s.name}
                        >
                          <option value="automatic">{t('services.startModeAuto')}</option>
                          <option value="manual">{t('services.startModeManual')}</option>
                          <option value="disabled">{t('services.startModeDisabled')}</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={
          confirmAction?.action === 'stop'
            ? t('services.stopTitle')
            : confirmAction?.action === 'restart'
              ? t('services.restartTitle')
              : t('services.startupTitle')
        }
        danger={confirmAction?.action === 'stop'}
        confirmLabel={t('common.confirm')}
        busy={busy === confirmAction?.service.name}
        message={
          confirmAction && (
            <>
              <p>
                <strong className="text-gtext">{confirmAction.service.displayName || confirmAction.service.name}</strong>{' '}
                {confirmAction.action === 'stop'
                  ? t('services.confirmStopMsg')
                  : confirmAction.action === 'restart'
                    ? t('services.confirmRestartMsg')
                    : t('services.confirmStartupMsg', { mode: confirmAction.startup })}
              </p>
              {confirmAction.service.important && (
                <p className="mt-2 flex items-start gap-1.5 text-gwarn">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  {t('services.confirmImportant')}
                </p>
              )}
              {confirmAction.action === 'stop' && (
                <p className="mt-2 text-gmuted">{t('services.confirmStopHint')}</p>
              )}
            </>
          )
        }
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.action === 'startup') {
            runAction(confirmAction.service, confirmAction.service.status === 'running' ? 'restart' : 'start', confirmAction.startup);
          } else {
            runAction(confirmAction.service, confirmAction.action, undefined);
          }
        }}
      />
    </div>
  );
}
