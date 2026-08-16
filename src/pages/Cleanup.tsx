import { useEffect, useState } from 'react';
import { Trash2, ScanSearch, FolderOpen, CheckSquare, Square, RefreshCw, AlertTriangle, HardDrive } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ConfirmDialog } from '../components/ui/Modal';
import { PageSpinner } from '../components/ui/Spinner';
import { formatBytes } from '../lib/format';
import type { CleanupCategory } from '../lib/types';

export default function Cleanup() {
  const [categories, setCategories] = useState<CleanupCategory[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [progress, setProgress] = useState<{ current: string; done: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useAppStore((s) => s.toast);
  const { t } = useI18n();

  useEffect(() => {
    const off = api.on('cleanup:progress', (p) => setProgress(p));
    return off;
  }, []);

  const scan = async () => {
    setScanning(true);
    setCategories(null);
    setProgress(null);
    const cats = await api.cleanup.scan().catch(() => []);
    setCategories(cats);
    setScanning(false);
  };

  const toggle = (id: string, value: boolean) => {
    setCategories((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, selected: value } : c)) : prev
    );
  };

  const toggleAll = (value: boolean) => {
    setCategories((prev) => (prev ? prev.map((c) => ({ ...c, selected: value && c.available })) : prev));
  };

  const clean = async () => {
    if (!categories) return;
    setConfirmOpen(false);
    setCleaning(true);
    setProgress(null);
    const selected = categories.filter((c) => c.selected);
    const r = await api.cleanup.clean(selected).catch(() => null);
    setCleaning(false);
    if (r) {
      toast('success', t('cleanup.done'), t('cleanup.doneDesc', { n: r.totalFiles, size: formatBytes(r.totalRemovedBytes) }));
      scan();
    } else {
      toast('error', t('cleanup.failed'), t('cleanup.failedDesc'));
    }
  };

  const totalBytes = categories?.filter((c) => c.selected).reduce((s, c) => s + c.size, 0) ?? 0;
  const totalFiles = categories?.filter((c) => c.selected).reduce((s, c) => s + c.files, 0) ?? 0;
  const selectedCount = categories?.filter((c) => c.selected).length ?? 0;
  const allSelected = categories?.every((c) => c.selected === c.available || !c.available) ?? false;

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title={t('cleanup.title')}
        subtitle={t('cleanup.subtitle')}
        actions={
          !categories ? (
            <Button size="md" icon={<ScanSearch size={15} />} loading={scanning} onClick={scan}>
              {t('cleanup.scan')}
            </Button>
          ) : undefined
        }
      />

      {!categories && !scanning && (
        <Card>
          <div className="flex flex-col items-center py-14 text-center">
            <div className="p-4 rounded-2xl bg-gaccent-dim border border-gaccent/30 mb-4">
              <Trash2 size={40} className="text-gaccent" strokeWidth={1.4} />
            </div>
            <div className="text-[16px] font-semibold text-gtext">{t('cleanup.heroTitle')}</div>
            <p className="text-[12.5px] text-gmuted mt-1.5 max-w-md leading-relaxed">{t('cleanup.heroDesc')}</p>
            <Button className="mt-6" size="lg" icon={<ScanSearch size={16} />} onClick={scan}>
              {t('cleanup.scan')}
            </Button>
          </div>
        </Card>
      )}

      {scanning && (
        <Card>
          <PageSpinner text={t('cleanup.scanning')} />
          {progress && (
            <div className="px-6 pb-6">
              <div className="text-[12px] text-gmuted mb-2">{progress.current}</div>
              <ProgressBar value={progress.done} max={progress.total} height={6} />
            </div>
          )}
        </Card>
      )}

      {categories && !scanning && (
        <>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="text-[13px] text-gmuted">
              {t('cleanup.found', { n: categories.length, size: formatBytes(totalBytes) })}
              <span className="text-gdim"> ({totalFiles} {t('common.files')})</span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={scan} disabled={cleaning}>
                {t('cleanup.rescan')}
              </Button>
              <Button
                size="sm"
                icon={<Trash2 size={13} />}
                disabled={selectedCount === 0 || cleaning}
                onClick={() => setConfirmOpen(true)}
              >
                {t('cleanup.cleanSelected', { n: selectedCount })}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => toggleAll(true)} className="flex items-center gap-1.5 text-[12px] text-gmuted hover:text-gaccent transition-colors">
              <CheckSquare size={14} /> {t('cleanup.selectAll')}
            </button>
            <span className="text-gborder2">·</span>
            <button onClick={() => toggleAll(false)} className="flex items-center gap-1.5 text-[12px] text-gmuted hover:text-gaccent transition-colors">
              <Square size={14} /> {t('cleanup.unselectAll')}
            </button>
          </div>

          <div className="space-y-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className={`panel p-3.5 flex items-center gap-3 transition-colors ${
                  c.selected ? 'border-gaccent/25' : 'opacity-70'
                }`}
              >
                <button
                  onClick={() => toggle(c.id, !c.selected)}
                  disabled={!c.available}
                  className={`shrink-0 ${!c.available ? 'cursor-not-allowed opacity-40' : ''}`}
                >
                  {c.selected ? (
                    <CheckSquare size={18} className="text-gaccent" />
                  ) : (
                    <Square size={18} className="text-gdim hover:text-gmuted" />
                  )}
                </button>
                <FolderOpen size={18} className={`shrink-0 ${c.available ? 'text-gaccent' : 'text-gdim'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-gtext">{c.name}</div>
                  <div className="text-[11.5px] text-gdim truncate" title={c.description}>
                    {c.description}
                  </div>
                  {!c.available && <div className="text-[11px] text-gwarn mt-0.5">{t('cleanup.notAvailable')}</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[14px] font-bold text-gmuted">{formatBytes(c.size)}</div>
                  <div className="text-[10.5px] text-gdim">{c.files} {t('common.files')}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2.5 mt-4 panel p-3.5">
            <AlertTriangle size={15} className="text-gwarn shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-gmuted leading-relaxed">{t('cleanup.warning')}</p>
          </div>

          <ConfirmDialog
            open={confirmOpen}
            title={t('cleanup.confirmTitle')}
            danger
            confirmLabel={t('cleanup.confirmLabel', { size: formatBytes(totalBytes) })}
            message={
              <>
                <p>{t('cleanup.confirmCount', { n: selectedCount })}</p>
                <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto pr-2">
                  {categories
                    .filter((c) => c.selected)
                    .map((c) => (
                      <li key={c.id} className="flex justify-between text-[12px]">
                        <span className="text-gmuted">{c.name}</span>
                        <span className="font-mono text-gmuted">{formatBytes(c.size)}</span>
                      </li>
                    ))}
                </ul>
                <p className="mt-3 text-gwarn flex items-center gap-1.5">
                  <AlertTriangle size={14} />
                  {t('cleanup.confirmPermanent')}
                </p>
              </>
            }
            onCancel={() => setConfirmOpen(false)}
            onConfirm={clean}
            busy={cleaning}
          />
        </>
      )}
    </div>
  );
}
