import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Palette, SlidersHorizontal, Info, Bell, ShieldCheck, Copy, Check, Cpu } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Toggle } from '../components/ui/Toggle';
import { Spinner } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { AppSettings } from '../lib/types';

function Section({
  icon: Icon, titleKey, children,
}: {
  icon: typeof Palette; titleKey: string; children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card
      variant="glow"
      title={
        <span className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gaccent/10 flex items-center justify-center">
            <Icon size={14} className="text-gaccent" />
          </div>
          {t(titleKey)}
        </span>
      }
    >
      <div className="space-y-0.5">{children}</div>
    </Card>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-gborder/30 last:border-0">
      <div className="min-w-0">
        <div className="text-[13px] text-gtext">{label}</div>
        {desc && <div className="text-[11.5px] text-gdim mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value, options, onChange,
}: {
  value: T; options: Array<{ value: string; label: string }>; onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-gborder">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value as T)}
          className={`px-3 py-1.5 text-[12px] transition-all duration-200 ${
            value === o.value
              ? 'bg-gaccent text-gbase font-semibold shadow-[0_0_8px_rgba(0,255,136,0.2)]'
              : 'text-gmuted hover:text-gtext hover:bg-gpanel2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Settings() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const appInfo = useAppStore((s) => s.appInfo);
  const toast = useAppStore((s) => s.toast);
  const licenseData = useAppStore((s) => s.licenseData);
  const setLicenseActivated = useAppStore((s) => s.setLicenseActivated);
  const { t } = useI18n();

  const [startupEnabled, setStartupEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [changingLicense, setChangingLicense] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    api.app.getStartup().then(setStartupEnabled).catch(() => setStartupEnabled(false));
  }, []);

  const save = async (patch: Partial<AppSettings>) => {
    setSaving(true);
    const next: AppSettings = { ...settings!, ...patch };
    setSettings(next);
    try {
      const saved = await api.settings.setMany(next);
      setSettings(saved);
      toast('success', t('settings.saved'));
    } catch (e: any) {
      toast('error', t('common.error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStartup = async (enabled: boolean) => {
    setStartupEnabled(enabled);
    try {
      await api.app.setStartup(enabled);
      toast('success', enabled ? t('settings.startupOn') : t('settings.startupOff'));
    } catch (e: any) {
      setStartupEnabled((prev) => !prev);
      toast('error', t('settings.startupError'), e.message);
    }
  };

  if (!settings) {
    return <div className="flex justify-center py-24"><Spinner /></div>;
  }

  const changeLicense = async () => {
    setChangingLicense(true);
    try {
      await api.license.deactivate();
      setLicenseActivated(false);
      toast('success', t('settings.licenseChanged'));
    } catch (e: any) {
      toast('error', t('settings.licenseChangeError'), e.message);
    } finally {
      setChangingLicense(false);
    }
  };

  const copyLicenseKey = async () => {
    if (!licenseData?.licenseKey) return;
    try {
      await navigator.clipboard.writeText(licenseData.licenseKey);
      setCopiedKey(true);
      toast('success', t('settings.licenseKeyCopied'));
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      toast('error', t('common.error'));
    }
  };

  const licenseStatusKey = licenseData?.status === 'active' ? 'settings.licenseActive'
    : licenseData?.status === 'expired' ? 'settings.licenseExpired'
    : licenseData?.status === 'revoked' ? 'settings.licenseRevoked'
    : licenseData?.status === 'suspended' ? 'settings.licenseSuspended'
    : 'activation.error';

  return (
    <div className="max-w-[840px] mx-auto">
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        actions={
          <span className="text-[11px] text-gdim flex items-center gap-1.5">
            <Cpu size={12} /> {t('settings.version')} {appInfo?.version ?? '…'}
          </span>
        }
      />

      <div className="space-y-4 stagger">
        <Section icon={SettingsIcon} titleKey="settings.general">
          <Row label={t('settings.language')} desc={t('settings.languageDesc')}>
            <SegmentedControl
              value={settings.language}
              options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]}
              onChange={(v) => save({ language: v })}
            />
          </Row>
          <Row label={t('settings.runOnStartup')} desc={t('settings.runOnStartupDesc')}>
            {startupEnabled === null ? <Spinner size={14} /> : <Toggle checked={startupEnabled} onChange={toggleStartup} />}
          </Row>
          <Row label={t('settings.minimizeToTray')} desc={t('settings.minimizeToTrayDesc')}>
            <Toggle checked={settings.minimizeToTray} onChange={(v) => save({ minimizeToTray: v })} />
          </Row>
          <Row label={t('settings.notifications')} desc={t('settings.notificationsDesc')}>
            <Toggle checked={settings.notifications} onChange={(v) => save({ notifications: v })} />
          </Row>
        </Section>

        <Section icon={Palette} titleKey="settings.appearance">
          <Row label={t('settings.theme')} desc={t('settings.themeDesc')}>
            <SegmentedControl
              value={settings.theme}
              options={[
                { value: 'system', label: t('settings.themeSystem') },
                { value: 'dark', label: t('settings.themeDark') },
                { value: 'light', label: t('settings.themeLight') },
              ]}
              onChange={(v) => save({ theme: v })}
            />
          </Row>
          <Row label={t('settings.animations')} desc={t('settings.animationsDesc')}>
            <Toggle checked={settings.animations} onChange={(v) => save({ animations: v })} />
          </Row>
          <Row label={t('settings.transparency')} desc={t('settings.transparencyDesc')}>
            <Toggle checked={settings.transparency} onChange={(v) => save({ transparency: v })} />
          </Row>
        </Section>

        <Section icon={SlidersHorizontal} titleKey="settings.optimization">
          <Row label={t('settings.infoLevel')} desc={t('settings.infoLevelDesc')}>
            <SegmentedControl
              value={settings.infoLevel}
              options={[
                { value: 'basic', label: t('settings.infoLevelBasic') },
                { value: 'detailed', label: t('settings.infoLevelDetailed') },
                { value: 'advanced', label: t('settings.infoLevelAdvanced') },
              ]}
              onChange={(v) => save({ infoLevel: v })}
            />
          </Row>
          <Row label={t('settings.confirmChanges')} desc={t('settings.confirmChangesDesc')}>
            <Toggle checked={settings.confirmChanges} onChange={(v) => save({ confirmChanges: v })} />
          </Row>
          <Row label={t('settings.autoRestorePoint')} desc={t('settings.autoRestorePointDesc')}>
            <Toggle checked={settings.autoRestorePoint} onChange={(v) => save({ autoRestorePoint: v })} />
          </Row>
        </Section>

        <Section icon={Info} titleKey="settings.about">
          <Row label={t('settings.version')}>
            <span className="text-[12.5px] font-mono text-gmuted">{appInfo?.version ?? '…'}</span>
          </Row>
          <Row label={t('settings.source')}>
            <span className="text-[11px] text-gmuted flex items-center gap-1">
              <Bell size={11} /> {t('settings.feedback')}
            </span>
          </Row>
        </Section>

        <Section icon={ShieldCheck} titleKey="settings.license">
          <Row label={t('settings.licenseStatus')}>
            <span className={`text-[12.5px] font-semibold ${licenseData?.status === 'active' ? 'text-green-400' : 'text-red-400'}`}>
              {t(licenseStatusKey)}
            </span>
          </Row>
          {licenseData && (
            <>
              <Row label={t('settings.licenseType')}>
                <span className="text-[12.5px] font-mono text-gmuted">{licenseData.licenseType}</span>
              </Row>
              <Row label={t('settings.licenseKey')}>
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-mono text-gmuted">
                    {licenseData.licenseKey?.slice(0, 9)}••••
                  </span>
                  <button
                    onClick={copyLicenseKey}
                    className="p-1 rounded hover:bg-gborder/30 text-gdim hover:text-gaccent transition-colors"
                    title={t('settings.licenseCopyKey')}
                  >
                    {copiedKey ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </Row>
              <Row label={t('settings.licenseExpires')}>
                <span className="text-[12.5px] font-mono text-gmuted">
                  {licenseData.expiresAt ? new Date(licenseData.expiresAt).toLocaleDateString() : t('settings.licenseNever')}
                </span>
              </Row>
            </>
          )}
          <Row label={t('settings.licenseChange')} desc={t('settings.licenseChangeDesc')}>
            <button
              onClick={changeLicense}
              disabled={changingLicense}
              className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {changingLicense ? t('settings.licenseChanging') : t('settings.licenseChange')}
            </button>
          </Row>
        </Section>
      </div>
    </div>
  );
}
