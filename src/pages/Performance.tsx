import { useEffect, useRef, useState } from 'react';
import { Cpu, GpuIcon as Gpu, MemoryStick, HardDrive, Network as NetworkIcon, Thermometer, Clock, Gauge, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import { LiveChart } from '../components/ui/LiveChart';
import { useHistory } from '../lib/useHistory';
import { formatClock, formatMbps, formatBytes } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { PerfReport } from '../lib/types';

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-gborder/40 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-gdim">{label}</span>
      <span className="font-mono text-[13px] text-gmuted">
        {value}
        {unit && <span className="text-[11px] text-gdim"> {unit}</span>}
      </span>
    </div>
  );
}

function HardwareCard({
  icon: Icon, title, subtitle, value, valueColor = 'text-gaccent', metrics, children,
}: {
  icon: typeof Cpu; title: string; subtitle: string; value: string; valueColor?: string;
  metrics: Array<{ label: string; value: string; unit?: string }>;
  children?: React.ReactNode;
}) {
  return (
    <Card
      variant="glow"
      title={
        <span className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gaccent/10 flex items-center justify-center">
            <Icon size={16} className="text-gaccent" />
          </div>
          {title}
        </span>
      }
      subtitle={subtitle}
      actions={
        <span className={`font-mono text-[20px] font-bold ${valueColor}`}>{value}</span>
      }
    >
      <div className="space-y-1 mb-3">
        {metrics.map((m) => <Metric key={m.label} {...m} />)}
      </div>
      {children}
    </Card>
  );
}

export default function Performance() {
  const { t } = useI18n();
  const snapshot = useAppStore((s) => s.snapshot);
  const [report, setReport] = useState<PerfReport | null>(null);
  const [loading, setLoading] = useState(true);

  const cpuH = useHistory(60);
  const gpuH = useHistory(60);
  const ramH = useHistory(60);
  const netDownH = useHistory(60);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    const r = await api.perf.report().catch(() => null);
    setReport(r);
    setLoading(false);
  };

  useEffect(() => {
    load();
    refreshTimer.current = setInterval(() => {
      if (document.hidden) return;
      api.perf.report().then(setReport).catch(() => undefined);
    }, 15000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    cpuH.push(snapshot.cpu.pct);
    gpuH.push(snapshot.gpu.pct ?? 0);
    ramH.push(snapshot.ram.pct);
    netDownH.push(snapshot.net.downMbps);
  }, [snapshot]);

  useEffect(() => {
    return () => { cpuH.reset(); gpuH.reset(); ramH.reset(); netDownH.reset(); };
  }, []);

  if (loading) return <PageSpinner text={t('performance.loading')} />;
  if (!report) return <PageSpinner text={t('performance.failed')} />;

  const { cpu, gpu, ram, disk, net } = report;
  const netMax = Math.max(10, Math.ceil(Math.max(...netDownH.data, 0)));
  const cpuColor = cpu.usage >= 80 ? 'text-gdanger' : cpu.usage >= 60 ? 'text-gwarn' : 'text-gaccent';
  const ramColor = ram.pct >= 80 ? 'text-gdanger' : ram.pct >= 60 ? 'text-gwarn' : 'text-gaccent';

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('performance.title')}
        subtitle={t('performance.subtitle')}
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => { setLoading(true); load(); }}>
            {t('common.refresh')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger">
        {/* CPU */}
        <HardwareCard
          icon={Cpu} title="CPU" subtitle={cpu.model}
          value={`${Math.round(cpu.usage)}%`} valueColor={cpuColor}
          metrics={[
            { label: t('performance.cores'), value: String(cpu.cores) },
            { label: t('performance.threads'), value: String(cpu.threads) },
            { label: t('performance.freq'), value: formatClock(cpu.clockMhz) },
            { label: t('performance.freqMax'), value: formatClock(cpu.maxClock) },
            { label: t('performance.temp'), value: cpu.temp != null ? `${cpu.temp}` : t('common.na'), unit: '°C' },
          ]}
        >
          <ProgressBar value={cpu.usage} height={6} barClassName={cpu.usage >= 80 ? 'bg-gdanger' : cpu.usage >= 60 ? 'bg-gwarn' : 'bg-gaccent'} />
          {cpuH.hasData && <div className="mt-3"><LiveChart data={cpuH.data} height={65} /></div>}
        </HardwareCard>

        {/* GPU */}
        <HardwareCard
          icon={Gpu} title="GPU" subtitle={gpu.model}
          value={gpu.usage != null ? `${Math.round(gpu.usage)}%` : '—'}
          metrics={[
            { label: t('performance.vram'), value: gpu.totalMb != null ? `${Math.round(gpu.totalMb / 1024)}` : t('common.na'), unit: 'GB' },
            { label: t('performance.vramUsage'), value: gpu.usedMb != null ? `${Math.round(gpu.usedMb / 1024)}` : t('common.na'), unit: 'GB' },
            { label: t('performance.temp'), value: gpu.temp != null ? `${gpu.temp}` : t('common.na'), unit: '°C' },
            { label: t('performance.driver'), value: gpu.driver || t('common.na') },
          ]}
        >
          <ProgressBar value={gpu.usage ?? 0} height={6} />
          {gpuH.hasData && <div className="mt-3"><LiveChart data={gpuH.data} height={65} /></div>}
        </HardwareCard>

        {/* RAM */}
        <HardwareCard
          icon={MemoryStick} title={t('performance.ramTitle')} subtitle={t('performance.ramSubtitle')}
          value={`${Math.round(ram.pct)}%`} valueColor={ramColor}
          metrics={[
            { label: t('performance.total'), value: `${ram.totalGb}`, unit: 'GB' },
            { label: t('performance.used'), value: `${ram.usedGb}`, unit: 'GB' },
            { label: t('performance.available'), value: `${ram.freeGb}`, unit: 'GB' },
            { label: t('performance.utilization'), value: `${Math.round(ram.pct)}`, unit: '%' },
          ]}
        >
          <ProgressBar value={ram.pct} height={6} barClassName={ram.pct >= 80 ? 'bg-gdanger' : ram.pct >= 60 ? 'bg-gwarn' : 'bg-gaccent'} />
          {ramH.hasData && <div className="mt-3"><LiveChart data={ramH.data} height={65} /></div>}
        </HardwareCard>

        {/* Disk */}
        <HardwareCard
          icon={HardDrive} title={t('performance.diskTitle')}
          subtitle={`${disk.model ?? t('performance.mainDisk')} · ${disk.mediaType ?? '—'}`}
          value={`${Math.round(disk.pct)}%`}
          valueColor={disk.pct >= 85 ? 'text-gdanger' : 'text-gaccent'}
          metrics={[
            { label: t('performance.capacity'), value: `${disk.totalGb}`, unit: 'GB' },
            { label: t('performance.free'), value: `${disk.freeGb}`, unit: 'GB' },
            { label: t('performance.read'), value: formatMbps(disk.readMbps) },
            { label: t('performance.write'), value: formatMbps(disk.writeMbps) },
          ]}
        >
          <ProgressBar value={disk.pct} height={6} barClassName={disk.pct >= 85 ? 'bg-gdanger' : 'bg-gaccent'} />
          {disk.perDrive.length > 1 && (
            <div className="mt-3 space-y-2">
              {disk.perDrive.map((d) => (
                <div key={d.drive} className="flex items-center gap-2 text-[11.5px]">
                  <span className="text-gdim w-6 font-mono">{d.drive}</span>
                  <ProgressBar value={d.pct} height={4} />
                  <span className="text-gdim font-mono w-16 text-right">{d.pct}%</span>
                </div>
              ))}
            </div>
          )}
        </HardwareCard>

        {/* Network */}
        <HardwareCard
          icon={NetworkIcon} title={t('performance.netTitle')}
          subtitle={`${net.adapter ?? '—'} · ${net.ip ?? t('performance.noIp')}`}
          value={`${net.downMbps} ↓ ${net.upMbps} ↑`}
          metrics={[
            { label: t('performance.gateway'), value: net.gateway || '—' },
            { label: t('performance.dns'), value: (net.dns || []).join(', ') || '—' },
            { label: t('performance.latency'), value: net.latency != null ? `${net.latency}` : t('common.na'), unit: 'ms' },
          ]}
        >
          {netDownH.hasData && <div className="mt-3"><LiveChart data={netDownH.data} color="#00d66b" height={65} min={0} max={netMax} /></div>}
        </HardwareCard>
      </div>
    </div>
  );
}
