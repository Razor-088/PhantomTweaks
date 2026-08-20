import { useEffect, useMemo, useState } from 'react';
import {
  Rocket,
  Server,
  Cpu,
  RefreshCw,
  Search,
  Play,
  Square,
  RotateCcw,
  AlertTriangle,
  ShieldAlert,
  MemoryStick,
  XCircle,
  ShieldCheck,
  ArrowUpDown,
} from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfirmDialog } from '../components/ui/Modal';
import { PageSpinner, EmptyState } from '../components/ui/Spinner';
import { formatBytes } from '../lib/format';
import type { StartupEntry, ServiceRow, ProcessRow } from '../lib/types';

type Tab = 'startup' | 'services' | 'processes';

const TABS: { key: Tab; labelKey: string }[] = [
  { key: 'startup', labelKey: 'startup.title' },
  { key: 'services', labelKey: 'services.title' },
  { key: 'processes', labelKey: 'processes.title' },
];

const IMPACT_TONE = { LOW: 'muted', MEDIUM: 'info', HIGH: 'warn' } as const;

type Filter = 'all' | 'running' | 'stopped' | 'manual' | 'automatic';
const FILTERS: Filter[] = ['all', 'running', 'stopped', 'manual', 'automatic'];

type SortKey = 'cpuPct' | 'memMb';
type SortDir = 'asc' | 'desc';

export default function SystemManager() {
  const [activeTab, setActiveTab] = useState<Tab>('startup');
  const toast = useAppStore((s) => s.toast);
  const appInfo = useAppStore((s) => s.appInfo);
  const { t } = useI18n();

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="flex items-center gap-1 mb-6 border-b border-gborder">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-all ${
              activeTab === tab.key
                ? 'border-gaccent text-gaccent'
                : 'border-transparent text-gmuted hover:text-gtext'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === 'startup' && (
        <StartupTab toast={toast} t={t} />
      )}
      {activeTab === 'services' && (
        <ServicesTab toast={toast} t={t} />
      )}
      {activeTab === 'processes' && (
        <ProcessesTab toast={toast} t={t} appInfo={appInfo} />
      )}
    </div>
  );
}

function StartupTab({ toast, t }: { toast: any; t: (key: string, params?: any) => string }) {
  const [entries, setEntries] = useState<StartupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const list = await api.startup.list().catch(() => []);
    setEntries(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.name.toLowerCase().includes(q) || e.publisher.toLowerCase().includes(q) || e.command.toLowerCase().includes(q)
    );
  }, [entries, query]);

  const toggle = async (id: string, enabled: boolean) => {
    setBusyId(id);
    const r = await api.startup.setEnabled(id, enabled);
    setBusyId(null);
    if (r.ok) {
      toast('success', t(enabled ? 'startup.enabledToast' : 'startup.disabledToast'));
      load();
    } else {
      toast('error', t('startup.toggleError'), r.error);
    }
  };

  const enabledCount = entries.filter((e) => e.enabled).length;

  return (
    <>
      <PageHeader
        title={t('startup.title')}
        subtitle={t('startup.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gdim" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('common.search')}
                className="bg-gpanel border border-gborder rounded-lg pl-8 pr-3 py-1.5 text-[12.5px] text-gtext placeholder:text-gdim focus:border-gaccent/50 focus:outline-none w-44"
              />
            </div>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={load}>
              {t('common.refresh')}
            </Button>
          </div>
        }
      />

      {loading ? (
        <PageSpinner text={t('startup.loading')} />
      ) : entries.length === 0 ? (
        <EmptyState icon={<Rocket size={32} />} title={t('startup.emptyTitle')} description={t('startup.emptyDesc')} />
      ) : (
        <>
          <div className="text-[12px] text-gdim mb-3">
            {t('startup.count', { n: enabledCount, m: entries.length - enabledCount })}
          </div>
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gborder text-[10.5px] uppercase tracking-widest text-gdim">
                    <th className="px-4 py-3 font-medium">{t('startup.colApp')}</th>
                    <th className="px-4 py-3 font-medium">{t('startup.colPublisher')}</th>
                    <th className="px-4 py-3 font-medium">{t('startup.colImpact')}</th>
                    <th className="px-4 py-3 font-medium">{t('startup.colStatus')}</th>
                    <th className="px-4 py-3 font-medium">{t('startup.colOrigin')}</th>
                    <th className="px-4 py-3 font-medium text-right">{t('startup.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-b border-gborder/40 last:border-0 hover:bg-gpanel2/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-[13px] font-medium text-gtext">{e.name}</div>
                        <div className="text-[10.5px] text-gdim font-mono truncate max-w-[260px]" title={e.command}>
                          {e.command}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-gmuted">{e.publisher}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={IMPACT_TONE[e.impact]}>{t(`startup.impact.${e.impact.toLowerCase()}`)}</StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        {e.enabled ? (
                          <StatusBadge tone="ok" dot>{t('startup.statusEnabled')}</StatusBadge>
                        ) : (
                          <StatusBadge tone="muted">{t('startup.statusDisabled')}</StatusBadge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-gdim">
                        {e.location.includes('Run') ? t('startup.registry') : t('startup.folder')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {e.enabled ? (
                          <Button variant="outline-danger" size="sm" loading={busyId === e.id} onClick={() => toggle(e.id, false)}>
                            {t('startup.disable')}
                          </Button>
                        ) : (
                          <Button variant="secondary" size="sm" loading={busyId === e.id} onClick={() => toggle(e.id, true)}>
                            {t('startup.enable')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[12.5px] text-gdim">
                        {t('startup.noResults', { q: query })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ServicesTab({ toast, t }: { toast: any; t: (key: string, params?: any) => string }) {
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
    <>
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
    </>
  );
}

function ProcessesTab({ toast, t, appInfo }: { toast: any; t: (key: string, params?: any) => string; appInfo: any }) {
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cpuPct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [busy, setBusy] = useState<number | null>(null);
  const [killTarget, setKillTarget] = useState<ProcessRow | null>(null);

  const load = async () => {
    setLoading(true);
    const list = await api.processes.list().catch(() => []);
    setProcesses(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, 10000);
    return () => clearInterval(iv);
  }, []);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q
      ? processes.filter((p) => p.name.toLowerCase().includes(q) || String(p.pid).includes(q))
      : processes;
    list = [...list].sort((a, b) => {
      const r = a[sortKey] - b[sortKey];
      return sortDir === 'desc' ? -r : r;
    });
    return list;
  }, [processes, query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const kill = async () => {
    if (!killTarget) return;
    setBusy(killTarget.pid);
    const r = await api.processes.kill(killTarget.pid);
    setBusy(null);
    setKillTarget(null);
    if (r.ok) {
      toast('success', t('processes.killedToast'), killTarget.name);
      load();
    } else {
      toast('error', t('processes.killFailedToast'), r.error);
    }
  };

  const totalCpu = processes.reduce((s, p) => s + (p.cpuPct || 0), 0);
  const totalMem = processes.reduce((s, p) => s + (p.memMb || 0), 0);

  return (
    <>
      <PageHeader
        title={t('processes.title')}
        subtitle={t('processes.subtitle')}
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={load} loading={loading}>
            {t('common.refresh')}
          </Button>
        }
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gdim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('processes.search')}
            className="bg-gpanel border border-gborder rounded-lg pl-8 pr-3 py-1.5 text-[12.5px] text-gtext placeholder:text-gdim focus:border-gaccent/50 focus:outline-none w-60"
          />
        </div>
        <div className="text-[12px] text-gdim">
          {t('processes.summary', { n: processes.length, cpu: totalCpu.toFixed(1), ram: formatBytes(totalMem * 1024 ** 2) })}
        </div>
        {!appInfo?.isAdmin && (
          <span className="ml-auto text-[11px] text-gwarn flex items-center gap-1">
            <ShieldCheck size={12} /> {t('processes.adminHint')}
          </span>
        )}
      </div>

      {loading && processes.length === 0 ? (
        <PageSpinner text={t('processes.loading')} />
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto max-h-[62vh]">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-gpanel z-10">
                <tr className="border-b border-gborder text-[10.5px] uppercase tracking-widest text-gdim">
                  <th className="px-4 py-3 font-medium">{t('processes.colProcess')}</th>
                  <th className="px-4 py-3 font-medium">{t('processes.colPid')}</th>
                  <th className="px-4 py-3 font-medium">
                    <button onClick={() => toggleSort('cpuPct')} className="flex items-center gap-1 hover:text-gmuted">
                      {t('processes.colCpu')} <ArrowUpDown size={11} />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button onClick={() => toggleSort('memMb')} className="flex items-center gap-1 hover:text-gmuted">
                      {t('processes.colRam')} <ArrowUpDown size={11} />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">{t('processes.colStatus')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('processes.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 300).map((p) => (
                  <tr key={p.pid} className="border-b border-gborder/40 last:border-0 hover:bg-gpanel2/60 transition-colors">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Cpu size={13} className="text-gdim shrink-0" />
                        <span className="text-[13px] font-medium text-gtext truncate max-w-[220px]" title={p.path || p.name}>
                          {p.name}
                        </span>
                        {p.protected && (
                          <span title={t('processes.protectedTooltip')}>
                            <ShieldCheck size={12} className="text-gaccent shrink-0" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono text-[12px] text-gmuted">{p.pid}</td>
                    <td className="px-4 py-2 font-mono text-[12.5px] text-gmuted">{p.cpuPct.toFixed(1)}%</td>
                    <td className="px-4 py-2 font-mono text-[12.5px] text-gmuted">{formatBytes(p.memMb * 1024 ** 2)}</td>
                    <td className="px-4 py-2">
                      {p.protected ? (
                        <StatusBadge tone="ok" dot>{t('processes.protected')}</StatusBadge>
                      ) : (
                        <StatusBadge tone="muted">{t('processes.normal')}</StatusBadge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {!p.protected ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<XCircle size={13} />}
                          className="text-gdanger hover:text-gdanger"
                          loading={busy === p.pid}
                          onClick={() => setKillTarget(p)}
                        >
                          {t('processes.kill')}
                        </Button>
                      ) : (
                        <span className="text-[11px] text-gdim">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[12.5px] text-gdim">
                      {t('processes.noResults')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!killTarget}
        title={t('processes.confirmKillTitle')}
        danger
        confirmLabel={t('processes.confirmKillTitle')}
        busy={busy === killTarget?.pid}
        message={
          killTarget && (
            <>
              <p>
                {t('processes.confirmKillMessage', { name: killTarget.name, pid: killTarget.pid })}
              </p>
              <p className="mt-2 text-gmuted">
                {t('processes.confirmKillWarning')}
              </p>
            </>
          )
        }
        onCancel={() => setKillTarget(null)}
        onConfirm={kill}
      />
    </>
  );
}
