import { useEffect, useState } from 'react';
import { MonitorDot, Cpu, Thermometer, Zap, Gauge, RefreshCw, CheckCircle2, AlertTriangle, Settings, Trash2, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Modal } from '../components/ui/Modal';
import { useI18n } from '../lib/i18n';
import type { NvidiaGpu, NvidiaPreset, NvidiaSystemInfo } from '../lib/types';

const PRESET_COLORS: Record<string, string> = {
  perf_max: 'bg-red-500/10 text-red-400 border-red-500/20',
  quality_max: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  balanced: 'bg-gaccent/10 text-gaccent border-gaccent/20',
  esports: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
};

export default function NvidiaSettings() {
  const { t } = useI18n();
  const toast = useAppStore((s) => s.toast);
  const [info, setInfo] = useState<NvidiaSystemInfo | null>(null);
  const [presets, setPresets] = useState<NvidiaPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [showSmi, setShowSmi] = useState(false);
  const [smiOutput, setSmiOutput] = useState('');

  const scan = async () => {
    setLoading(true);
    try {
      const [sysInfo, presetList] = await Promise.all([
        api.nvidia.systemInfo(),
        api.nvidia.presets(),
      ]);
      setInfo(sysInfo);
      setPresets(presetList);
    } catch {
      setInfo({ available: false, gpus: [], driverOutdated: false, driverVersion: null });
    }
    setLoading(false);
  };

  useEffect(() => { scan(); }, []);

  const applyPreset = async (presetId: string) => {
    setApplying(presetId);
    const r = await api.nvidia.applyPreset(presetId).catch(() => ({ ok: false, applied: [], errors: ['Error de conexion'] }));
    setApplying(null);
    if (r.ok) {
      toast('success', t('nvidia.applied'), t('nvidia.appliedDesc'));
    } else {
      toast('error', t('common.error'), r.errors[0] || t('nvidia.applyError'));
    }
  };

  const loadSmi = async () => {
    const output = await api.nvidia.smi().catch(() => 'No disponible');
    setSmiOutput(output);
    setShowSmi(true);
  };

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <PageHeader title={t('nvidia.title')} subtitle={t('nvidia.subtitle')} />
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-gborder border-t-gaccent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!info?.available) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <PageHeader title={t('nvidia.title')} subtitle={t('nvidia.subtitle')} />
        <Card className="text-center py-12">
          <MonitorDot size={48} className="text-gdim mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gtext mb-2">{t('nvidia.notFound')}</h3>
          <p className="text-sm text-gmuted max-w-md mx-auto">{t('nvidia.notFoundDesc')}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('nvidia.title')}
        subtitle={t('nvidia.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={scan}>
              {t('common.refresh')}
            </Button>
            <Button variant="secondary" size="sm" icon={<Settings size={14} />} onClick={loadSmi}>
              nvidia-smi
            </Button>
          </div>
        }
      />

      {/* GPU Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {info.gpus.map((gpu, i) => (
          <Card key={i} className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-green-500/10 to-transparent rounded-bl-full" />
            <div className="flex items-center gap-2 mb-3">
              <MonitorDot size={18} className="text-green-400" />
              <span className="text-[13px] font-semibold text-gtext truncate">{gpu.name}</span>
            </div>
            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-gdim">Driver</span>
                <span className="text-gtext font-mono">{gpu.driverVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gdim">VRAM</span>
                <span className="text-gtext font-mono">{gpu.vramMb} MB</span>
              </div>
              {gpu.temperature !== null && (
                <div className="flex justify-between">
                  <span className="text-gdim">{t('nvidia.temp')}</span>
                  <span className={`font-mono ${gpu.temperature > 80 ? 'text-red-400' : gpu.temperature > 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {gpu.temperature}°C
                  </span>
                </div>
              )}
              {gpu.utilizationPct !== null && (
                <div className="flex justify-between">
                  <span className="text-gdim">{t('nvidia.usage')}</span>
                  <span className="text-gtext font-mono">{gpu.utilizationPct}%</span>
                </div>
              )}
              {gpu.powerDrawW !== null && (
                <div className="flex justify-between">
                  <span className="text-gdim">{t('nvidia.power')}</span>
                  <span className="text-gtext font-mono">{gpu.powerDrawW.toFixed(0)}W / {gpu.powerLimitW}W</span>
                </div>
              )}
              {gpu.clockMhz !== null && (
                <div className="flex justify-between">
                  <span className="text-gdim">{t('nvidia.clock')}</span>
                  <span className="text-gtext font-mono">{gpu.clockMhz} MHz</span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Driver Warning */}
      {info.driverOutdated && (
        <Card className="mb-6 border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-yellow-400 shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-yellow-400">{t('nvidia.driverOutdated')}</p>
              <p className="text-[11px] text-gmuted">{t('nvidia.driverOutdatedDesc')}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Preset Profiles */}
      <div className="mb-6">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gdim mb-3">{t('nvidia.presetProfiles')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {presets.map((preset) => (
            <Card key={preset.id} className={`relative ${PRESET_COLORS[preset.id] || ''} border`}>
              <div className="mb-3">
                <h4 className="text-[13px] font-semibold text-gtext">{preset.name}</h4>
                <p className="text-[10px] text-gmuted mt-1">{preset.description}</p>
              </div>
              <Button
                variant="primary"
                size="sm"
                loading={applying === preset.id}
                onClick={() => applyPreset(preset.id)}
                className="w-full"
              >
                {t('nvidia.applyPreset')}
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* nvidia-smi Modal */}
      <Modal open={showSmi} onClose={() => setShowSmi(false)} title="nvidia-smi">
        <pre className="text-[11px] font-mono text-gtext bg-gbase2 p-4 rounded-lg overflow-auto max-h-[400px] whitespace-pre-wrap">
          {smiOutput}
        </pre>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setShowSmi(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
