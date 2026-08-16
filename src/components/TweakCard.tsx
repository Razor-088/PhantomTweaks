import { useState } from 'react';
import { Zap, ShieldCheck, AlertTriangle, User, Server, CheckCircle2, RotateCcw, Info } from 'lucide-react';
import type { TweakView } from '../lib/types';
import { Button } from './ui/Button';
import { StatusBadge } from './ui/StatusBadge';
import { ConfirmDialog } from './ui/Modal';
import { useI18n, useTweakMeta } from '../lib/i18n';

const RISK_TONE = { SAFE: 'ok', CAUTION: 'warn', ADVANCED: 'bad' } as const;
const IMPACT_TONE = { LOW: 'muted', MEDIUM: 'info', HIGH: 'warn' } as const;
const RISK_LABEL = { SAFE: 'tweak.risk.safe', CAUTION: 'tweak.risk.caution', ADVANCED: 'tweak.risk.advanced' } as const;
const IMPACT_LABEL = { LOW: 'tweak.impact.low', MEDIUM: 'tweak.impact.medium', HIGH: 'tweak.impact.high' } as const;

interface Props {
  tweak: TweakView;
  onApply: (id: string) => Promise<void>;
  onRevert: (id: string) => Promise<void>;
  busy: string | null;
  confirmChanges: boolean;
}

export function TweakCard({ tweak, onApply, onRevert, busy, confirmChanges }: Props) {
  const { t } = useI18n();
  const meta = useTweakMeta(tweak.id, tweak.name, tweak.description);
  const [confirm, setConfirm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const loading = busy === tweak.id;
  const busyOther = busy !== null && busy !== tweak.id;

  const handleApply = async () => {
    if (confirmChanges && (tweak.risk !== 'SAFE' || tweak.impact === 'HIGH')) {
      setConfirm(true);
      return;
    }
    await onApply(tweak.id);
  };

  return (
    <div className={`panel p-4 transition-all duration-200 panel-hover ${tweak.applied ? 'border-gaccent/30 bg-gaccent-dim/30' : 'hover:border-gborder2'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold text-gtext">{meta.name}</span>
            {tweak.applied && (
              <StatusBadge tone="active" dot>
                {t('tweak.applied')}
              </StatusBadge>
            )}
            {tweak.requiresAdmin && (
              <span className="text-[10px] text-gwarn flex items-center gap-1">
                <ShieldCheck size={11} /> {t('common.admin')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[10px] uppercase tracking-wider text-gdim flex items-center gap-1">
              <Zap size={11} /> {t('tweak.impact.impact')}{' '}
              <StatusBadge tone={IMPACT_TONE[tweak.impact]}> {t(IMPACT_LABEL[tweak.impact])}</StatusBadge>
            </span>
            <span className="text-[10px] uppercase tracking-wider text-gdim flex items-center gap-1">
              <AlertTriangle size={11} /> {t('tweak.risk.risk')}{' '}
              <StatusBadge tone={RISK_TONE[tweak.risk]}>{t(RISK_LABEL[tweak.risk])}</StatusBadge>
            </span>
            <span className="text-[10px] uppercase tracking-wider text-gdim flex items-center gap-1">
              {tweak.scope === 'system' ? <Server size={11} /> : <User size={11} />} {tweak.scope === 'system' ? t('tweak.scope.system') : t('tweak.scope.user')}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {tweak.applied ? (
            <Button variant="secondary" size="sm" icon={<RotateCcw size={13} />} onClick={() => onRevert(tweak.id)} loading={loading} disabled={busyOther}>
              {t('tweak.restore')}
            </Button>
          ) : (
            <Button size="sm" icon={<Zap size={13} />} onClick={handleApply} loading={loading} disabled={busyOther}>
              {t('tweak.apply')}
            </Button>
          )}
        </div>
      </div>

      <p className={`text-[12px] text-gmuted leading-relaxed mt-2.5 ${showDetails ? '' : 'line-clamp-2'}`}>
        {meta.desc}
      </p>
      <button
        onClick={() => setShowDetails((v) => !v)}
        className="mt-1 text-[11px] text-gdim hover:text-gaccent transition-colors flex items-center gap-1"
      >
        <Info size={11} />
        {showDetails ? t('common.lessInfo') : t('common.moreInfo')}
      </button>

      <ConfirmDialog
        open={confirm}
        title={t('tweak.applyConfirmTitle', { name: meta.name })}
        danger={tweak.risk === 'ADVANCED'}
        confirmLabel={t('common.apply')}
        message={
          <>
            <p>
              <strong className="text-gtext">{meta.name}</strong> ({meta.desc.slice(0, 160)}…)
            </p>
            <p className="mt-2">
              {t('tweak.risk.risk')}: <strong>{t(RISK_LABEL[tweak.risk])}</strong> · {t('tweak.impact.impact')}: <strong>{t(IMPACT_LABEL[tweak.impact])}</strong>
            </p>
            <p className="mt-2 text-gwarn flex items-center gap-1.5">
              <AlertTriangle size={14} />
              {t('tweak.applyConfirmDesc')}
            </p>
          </>
        }
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await onApply(tweak.id);
        }}
      />
    </div>
  );
}
