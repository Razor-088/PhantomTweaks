import { useEffect, useRef, useState } from 'react';
import { Cpu, GpuIcon as Gpu, MemoryStick, HardDrive, Network, Thermometer, Clock, Gauge, RefreshCw } from 'lucide-react';
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
      api.perf.report().then(setReport).catch(() => undefined);
    }, 5000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    cpuH.push(snapshot.cpu.pct);
    gpuH.push(snapshot.gpu.pct ?? 0);
    ramH.push(snapshot.ram.pct);
    netDownH.push(snapshot.net.downMbps);
  }, [snapshot]);

  if (loading) return <PageSpinner text={t('performance.loading')} />;
  if (!report) return <PageSpinner text={t('performance.failed')} />;

  const { cpu, gpu, ram, disk, net } = report;
  const netMax = Math.max(10, Math.ceil(Math.max(...netDownH.data, 0)));

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CPU */}
        <Card
          title="CPU"
          subtitle={cpu.model}
          actions={
            <span className="font-mono text-[20px] font-bold text-gaccent">{Math.round(cpu.usage)}%</span>
          }
        >
          <ProgressBar value={cpu.usage} height={8} barClassName={cpu.usage >= 80 ? 'bg-gdanger' : cpu.usage >= 60 ? 'bg-gwarn' : 'bg-gaccent'} />
          <div className="mt-3">
            <Metric label={t('performance.cores')} value={String(cpu.cores)} />
            <Metric label={t('performance.threads')} value={String(cpu.threads)} />
            <Metric label={t('performance.freq')} value={formatClock(cpu.clockMhz)} />
            <Metric label={t('performance.freqMax')} value={formatClock(cpu.maxClock)} />
            <Metric label={t('performance.temp')} value={cpu.temp != null ? `${cpu.temp}` : t('common.na')} unit="°C" />
          </div>
          {cpuH.hasData && <LiveChart data={cpuH.data} height={70} />}
        </Card>

        {/* GPU */}
        <Card
          title="GPU"
          subtitle={gpu.model}
          actions={
            <span className="font-mono text-[20px] font-bold text-gaccent">
              {gpu.usage != null ? `${Math.round(gpu.usage)}%` : '—'}
            </span>
          }
        >
          <ProgressBar value={gpu.usage ?? 0} height={8} />
          <div className="mt-3">
            <Metric label={t('performance.vram')} value={gpu.totalMb != null ? `${Math.round(gpu.totalMb / 1024)}` : t('common.na')} unit="GB" />
            <Metric label={t('performance.vramUsage')} value={gpu.usedMb != null ? `${Math.round(gpu.usedMb / 1024)}` : t('common.na')} unit="GB" />
            <Metric label={t('performance.temp')} value={gpu.temp != null ? `${gpu.temp}` : t('common.na')} unit="°C" />
            <Metric label={t('performance.driver')} value={gpu.driver || t('common.na')} />
          </div>
          {gpuH.hasData && <LiveChart data={gpuH.data} height={70} />}
        </Card>

        {/* RAM */}
        <Card
          title={t('performance.ramTitle')}
          subtitle={t('performance.ramSubtitle')}
          actions={<span className="font-mono text-[20px] font-bold text-gaccent">{Math.round(ram.pct)}%</span>}
        >
          <ProgressBar value={ram.pct} height={8} barClassName={ram.pct >= 80 ? 'bg-gdanger' : ram.pct >= 60 ? 'bg-gwarn' : 'bg-gaccent'} />
          <div className="mt-3">
            <Metric label={t('performance.total')} value={`${ram.totalGb}`} unit="GB" />
            <Metric label={t('performance.used')} value={`${ram.usedGb}`} unit="GB" />
            <Metric label={t('performance.available')} value={`${ram.freeGb}`} unit="GB" />
            <Metric label={t('performance.utilization')} value={`${Math.round(ram.pct)}`} unit="%" />
          </div>
          {ramH.hasData && <LiveChart data={ramH.data} height={70} />}
        </Card>

        {/* Disk */}
        <Card
          title={t('performance.diskTitle')}
          subtitle={`${disk.model ?? t('performance.mainDisk')} · ${disk.mediaType ?? '—'}`}
          actions={<span className="font-mono text-[20px] font-bold text-gaccent">{Math.round(disk.pct)}%</span>}
        >
          <ProgressBar value={disk.pct} height={8} barClassName={disk.pct >= 85 ? 'bg-gdanger' : 'bg-gaccent'} />
          <div className="mt-3">
            <Metric label={t('performance.capacity')} value={`${disk.totalGb}`} unit="GB" />
            <Metric label={t('performance.free')} value={`${disk.freeGb}`} unit="GB" />
            <Metric label={t('performance.read')} value={formatMbps(disk.readMbps)} />
            <Metric label={t('performance.write')} value={formatMbps(disk.writeMbps)} />
          </div>
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
        </Card>

        {/* Network */}
        <Card
          title={t('performance.netTitle')}
          subtitle={`${net.adapter ?? '—'} · ${net.ip ?? t('performance.noIp')}`}
          actions={
            <div className="text-right">
              <div className="font-mono text-[15px] font-bold text-gaccent">↓ {net.downMbps} <span className="text-[10px] text-gdim">Mbps</span></div>
              <div className="font-mono text-[13px] text-gmuted">↑ {net.upMbps} <span className="text-[10px] text-gdim">Mbps</span></div>
            </div>
          }
        >
          <div className="mt-3">
            <Metric label={t('performance.gateway')} value={net.gateway || '—'} />
            <Metric label={t('performance.dns')} value={(net.dns || []).join(', ') || '—'} />
            <Metric label={t('performance.latency')} value={net.latency != null ? `${net.latency}` : t('common.na')} unit="ms" />
          </div>
          {netDownH.hasData && <LiveChart data={netDownH.data} color="#00d66b" height={60} min={0} max={netMax} />}
        </Card>
      </div>
    </div>
  );
}
