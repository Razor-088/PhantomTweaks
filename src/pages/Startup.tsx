import { useEffect, useMemo, useState } from 'react';
import { Rocket, RefreshCw, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PageSpinner, EmptyState } from '../components/ui/Spinner';
import type { StartupEntry } from '../lib/types';

const IMPACT_TONE = { LOW: 'muted', MEDIUM: 'info', HIGH: 'warn' } as const;

export default function Startup() {
  const [entries, setEntries] = useState<StartupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useAppStore((s) => s.toast);
  const { t } = useI18n();

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
    <div className="max-w-[1100px] mx-auto">
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
    </div>
  );
}
