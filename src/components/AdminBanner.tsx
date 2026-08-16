import { ShieldAlert, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';

export function AdminBanner() {
  const appInfo = useAppStore((s) => s.appInfo);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useAppStore((s) => s.toast);
  const { t } = useI18n();

  if (!appInfo || appInfo.isAdmin || hidden) return null;

  const relaunch = async () => {
    setBusy(true);
    const r = await api.app.relaunchAsAdmin();
    setBusy(false);
    if (!r.ok) {
      toast('error', t('adminbanner.relaunchError'), r.error);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[360px] panel border-gwarn/40 shadow-[0_8px_30px_rgba(0,0,0,0.5)] animate-slideup">
      <div className="flex items-start gap-3 p-4">
        <div className="p-2 rounded-lg bg-gwarn/10 text-gwarn shrink-0">
          <ShieldAlert size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px]">{t('adminbanner.title')}</div>
          <p className="text-[12px] text-gmuted mt-0.5 leading-snug">
            {t('adminbanner.desc')}
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={relaunch}
              disabled={busy}
              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-gaccent text-gbase hover:bg-gaccent3 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
              {busy ? t('adminbanner.relaunching') : t('adminbanner.relaunch')}
            </button>
            <button
              onClick={() => setHidden(true)}
              className="flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-md text-gmuted hover:text-gtext border border-gborder hover:border-gborder2 transition-colors"
            >
              <X size={13} />
              {t('adminbanner.ignore')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
