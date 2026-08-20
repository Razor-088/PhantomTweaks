import { useState } from 'react';
import { ShieldCheck, ExternalLink, Wifi, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { Logo } from '../components/Logo';
import { useI18n } from '../lib/i18n';

export default function Activation() {
  const { t } = useI18n();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setLicenseActivated = useAppStore((s) => s.setLicenseActivated);

  const handleActivate = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.license.activate(key.trim());
      if (result.ok) {
        setLicenseActivated(true);
      } else {
        setError(result.error || t('activation.error'));
      }
    } catch {
      setError(t('activation.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const openStore = () => {
    api.app.openExternal('https://phantom-tweaks.mysellauth.com/products').catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gbase">
      {/* Background effects */}
      <div className="bg-grid absolute inset-0 pointer-events-none opacity-40" />
      <div className="absolute w-[500px] h-[500px] top-[-150px] right-[-100px] bg-gaccent/5 rounded-full blur-[120px] pointer-events-none animate-aurora" />
      <div className="absolute w-[400px] h-[400px] bottom-[-180px] left-[-120px] bg-ginfo/3 rounded-full blur-[100px] pointer-events-none animate-aurora" style={{ animationDelay: '3s' }} />

      <div className="relative w-full max-w-[420px] mx-4">
        <div className="panel p-8 text-center relative overflow-hidden">
          {/* Subtle scan line */}
          <div className="scanline" />

          {/* Shimmer sweep */}
          <div className="absolute inset-0 shimmer-sweep pointer-events-none" />

          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="relative w-20 h-20 rounded-2xl bg-gaccent-dim border border-gaccent/30 flex items-center justify-center shadow-[0_0_40px_rgba(0,255,136,0.25)] animate-glow">
              <Logo size={44} />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-[22px] font-bold tracking-tight text-gtext uppercase mb-1">
            Phantom<span className="text-gaccent">Tweaks</span>
          </h1>
          <p className="text-[13px] text-gdim mb-8">{t('activation.subtitle')}</p>

          {/* License input */}
          <div className="mb-4">
            <label className="block text-[11px] text-gdim uppercase tracking-wider mb-2 text-left">
              {t('activation.licenseKey')}
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => { setKey(e.target.value.toUpperCase()); setError(''); }}
              placeholder="PHNT-XXXX-XXXX-XXXX-XXXX"
              className="w-full bg-gbase2 border border-gborder rounded-lg px-4 py-3 text-[14px] font-mono text-gtext tracking-wider placeholder:text-gdim/50 focus:outline-none focus:border-gaccent/60 focus:shadow-[0_0_16px_-4px_rgba(0,255,136,0.15)] transition-all"
              onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
              disabled={loading}
              autoFocus
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-gdanger/10 border border-gdanger/30 text-gdanger text-[12px]">
              {error}
            </div>
          )}

          {/* Activate button */}
          <button
            onClick={handleActivate}
            disabled={loading || !key.trim()}
            className="w-full py-3 rounded-lg bg-gaccent text-gbase font-semibold text-[14px] hover:bg-gaccent3 active:bg-gaccent2 transition-all disabled:opacity-50 disabled:cursor-not-allowed btn-glow flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t('activation.activating')}
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                {t('activation.activate')}
              </>
            )}
          </button>

          {/* Buy link */}
          <div className="mt-6 pt-5 border-t border-gborder/50">
            <p className="text-[12px] text-gdim mb-3">{t('activation.noLicense')}</p>
            <button
              onClick={openStore}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gpanel2 border border-gborder text-gtext text-[13px] font-medium hover:border-gaccent/50 hover:text-gaccent hover:shadow-[0_0_16px_-4px_rgba(0,255,136,0.1)] transition-all"
            >
              <ExternalLink size={14} />
              {t('activation.buyLicense')}
            </button>
          </div>
        </div>

        {/* Connection status */}
        <div className="flex justify-center mt-4">
          <div className="flex items-center gap-1.5 text-[11px] text-gdim">
            <Wifi size={12} className="text-gaccent" />
            <span>{t('activation.secureConnection')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
