import { useEffect, useMemo, useState } from 'react';
import { FileText, Download, Trash2, RefreshCw, FolderOpen } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfirmDialog } from '../components/ui/Modal';
import { PageSpinner, EmptyState } from '../components/ui/Spinner';
import type { LogEntry } from '../lib/types';

const LEVEL_TONE = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'bad',
  SUCCESS: 'ok',
  SYSTEM: 'muted',
} as const;

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');
  const [confirmClear, setConfirmClear] = useState(false);
  const toast = useAppStore((s) => s.toast);
  const { t } = useI18n();

  const load = async () => {
    setLoading(true);
    const list = await api.logs.get(800).catch(() => []);
    setLogs(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'ALL') return logs;
    return logs.filter((l) => l.level === filter);
  }, [logs, filter]);

  const categories = useMemo(() => Array.from(new Set(logs.map((l) => l.category))), [logs]);

  const exportLog = async () => {
    const path = await api.logs.export();
    toast('success', t('logs.exported'), path);
  };

  const clearLogs = async () => {
    setConfirmClear(false);
    await api.logs.clear();
    toast('info', t('logs.cleared'));
    load();
  };

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title={t('logs.title')}
        subtitle={t('logs.subtitle')}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Download size={13} />} onClick={exportLog}>
              {t('logs.export')}
            </Button>
            <Button variant="outline-danger" size="sm" icon={<Trash2 size={13} />} onClick={() => setConfirmClear(true)}>
              {t('logs.clear')}
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['ALL', 'INFO', 'WARN', 'ERROR', 'SUCCESS', 'SYSTEM'].map((lvl) => (
          <button
            key={lvl}
            onClick={() => setFilter(lvl)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all ${
              filter === lvl ? 'bg-gaccent-dim text-gaccent border-gaccent/40' : 'text-gdim border-gborder hover:text-gmuted'
            }`}
          >
            {t(`logs.level.${lvl}`)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11.5px] text-gdim">{t('logs.count', { n: filtered.length })}</span>
          <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />} onClick={load}>
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      <Card noPadding>
        {loading ? (
          <PageSpinner text={t('logs.loading')} />
        ) : logs.length === 0 ? (
          <EmptyState icon={<FileText size={28} />} title={t('logs.emptyTitle')} description={t('logs.emptyDesc')} />
        ) : (
          <div className="max-h-[58vh] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-gpanel z-10">
                <tr className="border-b border-gborder text-[10.5px] uppercase tracking-widest text-gdim">
                  <th className="px-4 py-2.5 font-medium w-36">{t('logs.colTime')}</th>
                  <th className="px-4 py-2.5 font-medium w-20">{t('logs.colLevel')}</th>
                  <th className="px-4 py-2.5 font-medium w-28">{t('logs.colCategory')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('logs.colMessage')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => (
                  <tr key={i} className="border-b border-gborder/30 last:border-0 hover:bg-gpanel2/50 transition-colors">
                    <td className="px-4 py-1.5 font-mono text-[11.5px] text-gdim">{l.timestamp}</td>
                    <td className="px-4 py-1.5">
                      <StatusBadge tone={LEVEL_TONE[l.level]}>{t(`logs.level.${l.level}`)}</StatusBadge>
                    </td>
                    <td className="px-4 py-1.5 font-mono text-[11px] text-gmuted">{l.category}</td>
                    <td className="px-4 py-1.5 text-[12px] text-gmuted">{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmClear}
        title={t('logs.clearConfirmTitle')}
        danger
        confirmLabel={t('logs.clearConfirmLabel')}
        message={t('logs.clearConfirmMessage')}
        onCancel={() => setConfirmClear(false)}
        onConfirm={clearLogs}
      />
    </div>
  );
}
