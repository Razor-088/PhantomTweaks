import { useEffect, useMemo, useState } from 'react';
import { Cpu, MemoryStick, RefreshCw, Search, XCircle, ShieldCheck, ArrowUpDown } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfirmDialog } from '../components/ui/Modal';
import { PageSpinner } from '../components/ui/Spinner';
import { formatBytes } from '../lib/format';
import type { ProcessRow } from '../lib/types';

type SortKey = 'cpuPct' | 'memMb';
type SortDir = 'asc' | 'desc';

export default function Processes() {
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cpuPct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [busy, setBusy] = useState<number | null>(null);
  const [killTarget, setKillTarget] = useState<ProcessRow | null>(null);
  const toast = useAppStore((s) => s.toast);
  const { t } = useI18n();
  const appInfo = useAppStore((s) => s.appInfo);

  const load = async () => {
    setLoading(true);
    const list = await api.processes.list().catch(() => []);
    setProcesses(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
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
    <div className="max-w-[1200px] mx-auto">
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
    </div>
  );
}
