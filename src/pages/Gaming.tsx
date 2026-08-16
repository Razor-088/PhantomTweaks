import { useEffect, useState } from 'react';
import { Gamepad2, Power, PowerOff, CheckCircle2, AlertTriangle, Rocket, Zap, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfirmDialog } from '../components/ui/Modal';
import { useI18n } from '../lib/i18n';
import type { GamingModeResult, BoostStatus } from '../lib/types';

export default function Gaming() {
  const toast = useAppStore((s) => s.toast);
  const { t } = useI18n();

  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applyPowerPlan, setApplyPowerPlan] = useState(true);
  const [memoryClean, setMemoryClean] = useState(true);
  const [confirmOn, setConfirmOn] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const [boost, setBoost] = useState<BoostStatus | null>(null);
  const [boostBusy, setBoostBusy] = useState(false);

  useEffect(() => {
    api.gaming.status().then((s) => setActive(s.active)).catch(() => undefined);
    api.boost.status().then(setBoost).catch(() => undefined);
  }, []);

  const activate = async () => {
    setBusy(true);
    const r: GamingModeResult = await api.gaming.activate({ applyPowerPlan, memoryClean }).catch(() => ({
      active: false,
      applied: [],
      failed: ['error'],
      messages: [t('gaming.commError')],
    }));
    setBusy(false);
    if (r.active) {
      setActive(true);
      toast('success', t('gaming.activated'), t('gaming.activatedDesc', { n: r.applied.length }));
    } else {
      toast('warning', t('gaming.notActivated'), r.messages.join(' '));
    }
    if (r.failed.length) {
      toast('info', t('gaming.someFailed'), t('gaming.someFailedDesc'));
    }
  };

  const deactivate = async () => {
    setBusy(true);
    const r = await api.gaming.deactivate().catch(() => ({ active: false, applied: [], failed: [], messages: [] }));
    setBusy(false);
    setActive(false);
    toast('info', t('gaming.deactivated'), t('gaming.deactivatedDesc', { n: r.applied.length }));
  };

  const toggleBoost = async () => {
    setBoostBusy(true);
    const r = boost?.gaming.active
      ? await api.boost.gamingStop().catch(() => null)
      : await api.boost.gamingStart().catch(() => null);
    setBoostBusy(false);
    if (!r) {
      toast('error', t('common.error'), t('gaming.commError'));
      return;
    }
    setBoost(r);
    if (r.gaming.active) {
      toast('success', t('gaming.boostActivated'), r.gaming.details.join(' · '));
    } else {
      toast('info', t('gaming.boostDeactivated'), r.gaming.details.join(' · ') || t('gaming.boostRestored'));
    }
    if (r.gaming.warnings.length) {
      toast('info', t('gaming.warnings'), r.gaming.warnings.join(' · '));
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader title={t('gaming.title')} subtitle={t('gaming.subtitle')} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1 flex flex-col" noPadding>
          <div className="p-5 flex-1 flex flex-col items-center justify-center text-center">
            <div
              className={`w-40 h-40 rounded-full flex items-center justify-center mb-5 transition-all duration-300 ${
                active ? 'border-2 border-gaccent shadow-[0_0_40px_rgba(0,255,136,0.4)]' : 'border border-gborder2'
              }`}
            >
              <Gamepad2
                size={64}
                className={active ? 'text-gaccent animate-glow rounded-full' : 'text-gdim'}
                strokeWidth={1.4}
              />
            </div>

            <div className="font-mono text-[16px] font-bold tracking-widest uppercase">
              {active ? (
                <span className="text-gaccent text-glow">● {t('gaming.modeActive')}</span>
              ) : (
                <span className="text-gdim">{t('gaming.modeInactive')}</span>
              )}
            </div>
            <p className="text-[12px] text-gmuted mt-2 max-w-[260px] leading-relaxed">
              {active ? t('gaming.activeDesc') : t('gaming.inactiveDesc')}
            </p>

            <div className="mt-6 w-full max-w-[260px] space-y-3">
              <div className="flex items-center justify-between text-[12.5px] text-gmuted">
                <span>{t('gaming.powerPlan')}</span>
                <Toggle checked={applyPowerPlan} onChange={setApplyPowerPlan} disabled={active} />
              </div>
              <div className="flex items-center justify-between text-[12.5px] text-gmuted">
                <span>{t('gaming.memoryClean')}</span>
                <Toggle checked={memoryClean} onChange={setMemoryClean} disabled={active} />
              </div>
            </div>

            <div className="mt-7 flex gap-3">
              {!active ? (
                <Button size="lg" icon={<Power size={16} />} loading={busy} onClick={() => setConfirmOn(true)}>
                  {t('gaming.activate')}
                </Button>
              ) : (
                <Button size="lg" variant="outline-danger" icon={<PowerOff size={16} />} loading={busy} onClick={() => setConfirmOff(true)}>
                  {t('gaming.deactivate')}
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2" title={t('gaming.whatItDoes')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {['gaming.fact1', 'gaming.fact2', 'gaming.fact3', 'gaming.fact4'].map((k) => (
              <div key={k} className="flex items-start gap-2 py-1.5">
                <CheckCircle2 size={14} className="text-gaccent shrink-0 mt-0.5" />
                <span className="text-[12.5px] text-gmuted leading-relaxed">{t(k)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 border-t border-gborder/30 pt-3">
            <ShieldCheck size={14} className="text-gaccent shrink-0 mt-0.5" />
            <span className="text-[12px] text-gdim leading-relaxed">{t('gaming.safetyNote')}</span>
          </div>
        </Card>
      </div>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Rocket size={15} className="text-gaccent" />
            {t('gaming.fpsBoost')}
          </span>
        }
        subtitle={t('gaming.fpsBoostSub')}
        className={`relative overflow-hidden mt-4 ${boost?.gaming.active ? 'border-gaccent/40' : ''}`}
      >
        {boost?.gaming.active && <div className="scanline" />}
        <div className="flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex-1 min-w-0">
            {boost?.gaming.active ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <StatusBadge tone="active" dot>{t('gaming.boostActive')}</StatusBadge>
                  {boost.gaming.game && (
                    <span className="text-[12.5px] text-gtext font-medium flex items-center gap-1.5">
                      <Gamepad2 size={14} className="text-gaccent" />
                      {t('gaming.boostGame')}: <span className="text-gaccent">{boost.gaming.game}</span>
                    </span>
                  )}
                </div>
                <ul className="space-y-1">
                  {boost.gaming.details.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12.5px] text-gmuted">
                      <CheckCircle2 size={14} className="text-gaccent shrink-0 mt-0.5" />
                      {d}
                    </li>
                  ))}
                  {boost.gaming.warnings.map((w, i) => (
                    <li key={`w${i}`} className="flex items-start gap-2 text-[12.5px] text-gwarn">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-[13px] text-gmuted leading-relaxed">{t('gaming.boostInactive')}</div>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-3">
            {boost?.gaming.active && (
              <div className="flex items-center gap-1.5 text-[11px] text-gdim">
                <span className="live-dot inline-block w-2 h-2 rounded-full bg-gaccent" />
                {t('gaming.live')}
              </div>
            )}
            <Button
              size="lg"
              variant={boost?.gaming.active ? 'outline-danger' : undefined}
              icon={boost?.gaming.active ? <PowerOff size={16} /> : <Zap size={16} />}
              loading={boostBusy}
              onClick={toggleBoost}
            >
              {boost?.gaming.active ? t('gaming.stopBoost') : t('gaming.activateBoost')}
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmOn}
        title={t('gaming.confirmOnTitle')}
        confirmLabel={t('gaming.confirmOnBtn')}
        message={t('gaming.confirmOnMsg', {
          power: applyPowerPlan ? t('gaming.confirmOnPower') : '',
          memory: memoryClean ? t('gaming.confirmOnMemory') : '',
        })}
        onCancel={() => setConfirmOn(false)}
        onConfirm={() => {
          setConfirmOn(false);
          activate();
        }}
      />
      <ConfirmDialog
        open={confirmOff}
        title={t('gaming.confirmOffTitle')}
        danger
        confirmLabel={t('gaming.confirmOffBtn')}
        message={t('gaming.confirmOffMsg')}
        onCancel={() => setConfirmOff(false)}
        onConfirm={() => {
          setConfirmOff(false);
          deactivate();
        }}
      />
    </div>
  );
}
