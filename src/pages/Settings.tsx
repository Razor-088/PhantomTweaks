import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Palette, SlidersHorizontal, Info, Bell } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Toggle } from '../components/ui/Toggle';
import { Spinner } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { AppSettings } from '../lib/types';

function Section({
  icon: Icon,
  titleKey,
  children,
}: {
  icon: typeof Palette;
  titleKey: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Icon size={14} className="text-gaccent" />
          {t(titleKey)}
        </span>
      }
    >
      <div className="space-y-1">{children}</div>
    </Card>
  );
}

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
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

export default function Settings() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const appInfo = useAppStore((s) => s.appInfo);
  const toast = useAppStore((s) => s.toast);
  const { t } = useI18n();

  const [startupEnabled, setStartupEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.app
      .getStartup()
      .then((enabled) => setStartupEnabled(enabled))
      .catch(() => setStartupEnabled(false));
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
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const langOptions = [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
  ];

  const themeOptions = [
    { value: 'system', label: t('settings.themeSystem') },
    { value: 'dark', label: t('settings.themeDark') },
    { value: 'light', label: t('settings.themeLight') },
  ];

  const levelOptions = [
    { value: 'basic', label: t('settings.infoLevelBasic') },
    { value: 'detailed', label: t('settings.infoLevelDetailed') },
    { value: 'advanced', label: t('settings.infoLevelAdvanced') },
  ];

  return (
    <div className="max-w-[840px] mx-auto">
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        actions={
          <span className="text-[11px] text-gdim flex items-center gap-1.5">
            {t('settings.version')} {appInfo?.version ?? '…'}
          </span>
        }
      />

      <div className="space-y-4">
        <Section icon={SettingsIcon} titleKey="settings.general">
          <Row label={t('settings.language')} desc={t('settings.languageDesc')}>
            <div className="flex rounded-lg overflow-hidden border border-gborder">
              {langOptions.map((o) => (
                <button
                  key={o.value}
                  onClick={() => save({ language: o.value as 'es' | 'en' })}
                  className={`px-3 py-1.5 text-[12px] transition-colors ${
                    settings.language === o.value ? 'bg-gaccent text-gbase font-semibold' : 'text-gmuted hover:text-gtext'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Row>
          <Row label={t('settings.runOnStartup')} desc={t('settings.runOnStartupDesc')}>
            {startupEnabled === null ? (
              <Spinner size={14} />
            ) : (
              <Toggle checked={startupEnabled} onChange={toggleStartup} />
            )}
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
            <div className="flex rounded-lg overflow-hidden border border-gborder">
              {themeOptions.map((o) => (
                <button
                  key={o.value}
                  onClick={() => save({ theme: o.value as AppSettings['theme'] })}
                  className={`px-3 py-1.5 text-[12px] transition-colors ${
                    settings.theme === o.value ? 'bg-gaccent text-gbase font-semibold' : 'text-gmuted hover:text-gtext'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
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
            <div className="flex rounded-lg overflow-hidden border border-gborder">
              {levelOptions.map((o) => (
                <button
                  key={o.value}
                  onClick={() => save({ infoLevel: o.value as AppSettings['infoLevel'] })}
                  className={`px-3 py-1.5 text-[12px] transition-colors ${
                    settings.infoLevel === o.value ? 'bg-gaccent text-gbase font-semibold' : 'text-gmuted hover:text-gtext'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
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
      </div>
    </div>
  );
}
