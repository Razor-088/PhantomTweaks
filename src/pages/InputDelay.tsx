import { useEffect, useState } from 'react';
import { Timer, CheckCircle2, AlertTriangle, Monitor, MousePointer, Zap, Power, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useI18n } from '../lib/i18n';
import type { InputDelayItem } from '../lib/types';

const CATEGORY_ICONS: Record<string, typeof Monitor> = {
  display: Monitor,
  power: Power,
  mouse: MousePointer,
  system: Zap,
};

export default function InputDelay() {
  const { t } = useI18n();
  const toast = useAppStore((s) => s.toast);
  const [items, setItems] = useState<InputDelayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  const scan = async () => {
    setLoading(true);
    const r = await api.inputDelay.scan().catch(() => []);
    setItems(r);
    setLoading(false);
  };

  useEffect(() => { scan(); }, []);

  const apply = async (id: string) => {
    setApplying(id);
    const r = await api.inputDelay.apply(id).catch(() => ({ ok: false, error: 'Error de conexión' }));
    setApplying(null);
    if (r.ok) {
      toast('success', t('inputDelay.applied'), t('inputDelay.appliedDesc'));
      scan();
    } else {
      toast('error', t('common.error'), r.error || t('inputDelay.applyError'));
    }
  };

  const applied = items.filter((i) => i.applied).length;
  const total = items.length;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('inputDelay.title')}
        subtitle={t('inputDelay.subtitle')}
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => scan()}>
            {t('common.refresh')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card className="text-center">
          <div className="text-[28px] font-bold text-gaccent">{applied}</div>
          <div className="text-[11px] text-gdim uppercase tracking-wider mt-1">{t('inputDelay.applied')}</div>
        </Card>
        <Card className="text-center">
          <div className="text-[28px] font-bold text-gtext">{total}</div>
          <div className="text-[11px] text-gdim uppercase tracking-wider mt-1">{t('inputDelay.total')}</div>
        </Card>
        <Card className="text-center">
          <div className="text-[28px] font-bold text-gwarn">{total - applied}</div>
          <div className="text-[11px] text-gdim uppercase tracking-wider mt-1">{t('inputDelay.pending')}</div>
        </Card>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const Icon = CATEGORY_ICONS[item.category] || Zap;
          return (
            <Card key={item.id} className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${item.applied ? 'bg-gaccent/10' : 'bg-gpanel2'}`}>
                <Icon size={20} className={item.applied ? 'text-gaccent' : 'text-gdim'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-gtext">{item.name}</span>
                  {item.applied && <StatusBadge tone="ok"><CheckCircle2 size={10} /> {t('common.on')}</StatusBadge>}
                </div>
                <p className="text-[11px] text-gmuted mt-0.5">{item.description}</p>
                <div className="flex items-center gap-4 mt-1 text-[10px] text-gdim">
                  <span>{t('inputDelay.before')}: <span className="text-gtext">{item.before}</span></span>
                  <span>→</span>
                  <span>{t('inputDelay.after')}: <span className="text-gaccent">{item.after}</span></span>
                </div>
              </div>
              {!item.applied && (
                <Button
                  variant="primary"
                  size="sm"
                  loading={applying === item.id}
                  onClick={() => apply(item.id)}
                >
                  {t('common.apply')}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
