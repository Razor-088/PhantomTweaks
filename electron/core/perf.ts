import { getOverview, getMonitorSnapshot, GpuInfo, DiskInfo, NetIfInfo } from './systemInfo';
import { getNetInfo, getLatency } from './networkTools';
import { runPSJson } from './ps';

export interface PerfReport {
  cpu: {
    model: string;
    cores: number;
    threads: number;
    clockMhz: number | null;
    maxClock: number | null;
    usage: number;
    temp: number | null;
  };
  gpu: {
    model: string;
    vramMb: number | null;
    usage: number | null;
    temp: number | null;
    usedMb: number | null;
    totalMb: number | null;
    driver: string | null;
  };
  ram: { totalGb: number; usedGb: number; freeGb: number; pct: number };
  disk: {
    model: string | null;
    mediaType: string | null;
    totalGb: number;
    freeGb: number;
    pct: number;
    readMbps: number;
    writeMbps: number;
    perDrive: DiskInfo[];
  };
  net: {
    adapter: string | null;
    ip: string | null;
    downMbps: number;
    upMbps: number;
    latency: number | null;
    gateway: string | null;
    dns: string[];
  };
}

export async function getPerfReport(): Promise<PerfReport> {
  const [overview, snapshot, netInfo, latency] = await Promise.all([
    getOverview(),
    getMonitorSnapshot(),
    getNetInfo(),
    getLatency(),
  ]);

  const diskSpeeds = await runPSJson<{ read: number; write: number }>(
    `$r = Get-Counter -Counter '\\PhysicalDisk(*)\\Disk Read Bytes/sec','\\PhysicalDisk(*)\\Disk Write Bytes/sec' -ErrorAction SilentlyContinue; if ($r) { $read = ($r.CounterSamples | Where-Object { $_.Path -like '*Read*' } | Measure-Object -Property CookedValue -Sum).Sum; $write = ($r.CounterSamples | Where-Object { $_.Path -like '*Write*' } | Measure-Object -Property CookedValue -Sum).Sum; [PSCustomObject]@{ read=$read; write=$write } } else { [PSCustomObject]@{ read=0; write=0 } }`,
    10000
  );
  const toMbps = (b: number) => Number(((b * 8) / 1_000_000).toFixed(1));

  const gpu: GpuInfo = overview.gpus[0] || { name: 'No detectada', vramMb: null, driver: null };

  return {
    cpu: {
      model: overview.cpu.name,
      cores: overview.cpu.cores,
      threads: overview.cpu.threads,
      clockMhz: snapshot.cpu.clockMhz ?? overview.cpu.clockMhz,
      maxClock: overview.cpu.maxClockMhz,
      usage: snapshot.cpu.pct,
      temp: snapshot.cpu.temp,
    },
    gpu: {
      model: gpu.name,
      vramMb: gpu.vramMb,
      usage: snapshot.gpu.pct,
      temp: snapshot.gpu.temp,
      usedMb: snapshot.gpu.usedMb,
      totalMb: snapshot.gpu.totalMb,
      driver: gpu.driver,
    },
    ram: snapshot.ram,
    disk: {
      model: overview.disks[0]?.model ?? null,
      mediaType: overview.disks[0]?.mediaType ?? null,
      totalGb: snapshot.disk.totalGb,
      freeGb: snapshot.disk.totalGb - snapshot.disk.usedGb,
      pct: snapshot.disk.pct,
      readMbps: toMbps(diskSpeeds?.read ?? 0),
      writeMbps: toMbps(diskSpeeds?.write ?? 0),
      perDrive: overview.disks,
    },
    net: {
      adapter: netInfo.interfaceName,
      ip: netInfo.ip,
      downMbps: snapshot.net.downMbps,
      upMbps: snapshot.net.upMbps,
      latency,
      gateway: netInfo.gateway,
      dns: netInfo.dns,
    },
  };
}
