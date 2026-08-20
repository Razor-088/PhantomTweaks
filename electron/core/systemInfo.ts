import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { runPS, runPSJson } from './ps';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CpuInfo {
  name: string;
  cores: number;
  threads: number;
  clockMhz: number | null;
  maxClockMhz: number | null;
}

export interface GpuInfo {
  name: string;
  vramMb: number | null;
  driver: string | null;
}

export interface RamInfo {
  totalGb: number;
  usedGb: number;
  freeGb: number;
  pct: number;
  installedGb: number | null;
}

export interface DiskInfo {
  drive: string;
  label: string | null;
  type: string;
  totalGb: number;
  freeGb: number;
  pct: number;
  model: string | null;
  mediaType: string | null;
}

export interface NetIfInfo {
  name: string;
  family: string;
  address: string;
  mac: string | null;
}

export interface Overview {
  hostname: string;
  windows: {
    productName: string;
    displayVersion: string;
    build: string;
    edition: string;
    arch: string;
  };
  cpu: CpuInfo;
  gpus: GpuInfo[];
  ram: RamInfo;
  disks: DiskInfo[];
  network: NetIfInfo[];
  uptimeHours: number;
  bootTime: string;
}

export interface MonitorSnapshot {
  cpu: { pct: number; temp: number | null; clockMhz: number | null };
  gpu: { pct: number | null; temp: number | null; usedMb: number | null; totalMb: number | null };
  ram: { pct: number; usedGb: number; totalGb: number; freeGb: number };
  disk: { pct: number; usedGb: number; totalGb: number };
  net: { downMbps: number; upMbps: number };
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtGb(bytes: number): number {
  return bytes / 1024 / 1024 / 1024;
}

function rootOfDrive(drive: string): string {
  return drive.endsWith('\\') ? drive : drive + '\\';
}

function statfsTotalFree(root: string): { total: number; free: number } {
  try {
    const s = fs.statfsSync(root);
    return { total: s.bsize * s.blocks, free: s.bsize * s.bavail };
  } catch {
    return { total: 0, free: 0 };
  }
}

function fmtBytesPerSecToMbps(bytesPerSec: number): number {
  if (!bytesPerSec || bytesPerSec < 0) return 0;
  return Number(((bytesPerSec * 8) / 1_000_000).toFixed(2));
}

// ---------------------------------------------------------------------------
// CPU
// ---------------------------------------------------------------------------

let lastCpuSample: { idle: number; total: number } | null = null;
let lastCpuSampleTime = 0;

function sampleCpu(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}

/** Samples CPU usage; call sampleCpu() twice and pass deltas. */
export function computeCpuPct(a: { idle: number; total: number }, b: { idle: number; total: number }): number {
  const dTotal = b.total - a.total;
  const dIdle = b.idle - a.idle;
  if (dTotal <= 0) return 0;
  return Math.max(0, Math.min(100, ((dTotal - dIdle) / dTotal) * 100));
}

async function getCpuDetail(): Promise<CpuInfo> {
  const r = await runPSJson<{ Name: string; NumberOfCores: number; NumberOfLogicalProcessors: number; CurrentClockSpeed: number; MaxClockSpeed: number }>(
    `Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors,CurrentClockSpeed,MaxClockSpeed`
  );
  const c = os.cpus()[0];
  let clock = c && c.speed ? c.speed : null;
  if (!clock && r && r.CurrentClockSpeed) clock = r.CurrentClockSpeed;
  return {
    name: r?.Name || c?.model || 'CPU desconocida',
    cores: r?.NumberOfCores || os.cpus().length,
    threads: r?.NumberOfLogicalProcessors || os.cpus().length,
    clockMhz: clock || null,
    maxClockMhz: r?.MaxClockSpeed || null,
  };
}

async function getCpuTemp(): Promise<number | null> {
  const r = await runPSJson<{ CurrentTemperature: number }>(
    `try { $t = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop; if ($t) { [PSCustomObject]@{ CurrentTemperature = ($t.CurrentTemperature / 10 - 273.15) } } } catch { [PSCustomObject]@{ CurrentTemperature = $null } }`
  );
  if (!r || r.CurrentTemperature == null) return null;
  const t = Number(r.CurrentTemperature);
  if (!isFinite(t)) return null;
  return Math.round(t);
}

// ---------------------------------------------------------------------------
// GPU
// ---------------------------------------------------------------------------

export interface GpuUtilResult {
  pct: number | null;
  temp: number | null;
  usedMb: number | null;
  totalMb: number | null;
}

let nvidiaAvailable: boolean | null = null;

function hasNvidiaSmi(): Promise<boolean> {
  return new Promise((resolve) => {
    if (nvidiaAvailable !== null) return resolve(nvidiaAvailable);
    execFile('nvidia-smi', ['--query-gpu=name'], { windowsHide: true, timeout: 5000 }, (err) => {
      nvidiaAvailable = !err;
      resolve(nvidiaAvailable);
    });
  });
}

async function getGpuUtilNvidia(): Promise<GpuUtilResult> {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => {
        if (err || !stdout) return resolve({ pct: null, temp: null, usedMb: null, totalMb: null });
        const parts = stdout.trim().split(',').map((s) => s.trim());
        resolve({
          pct: parts[0] !== undefined && parts[0] !== '[N/A]' ? Number(parts[0]) : null,
          temp: parts[1] !== undefined && parts[1] !== '[N/A]' ? Number(parts[1]) : null,
          usedMb: parts[2] !== undefined && parts[2] !== '[N/A]' ? Number(parts[2]) : null,
          totalMb: parts[3] !== undefined && parts[3] !== '[N/A]' ? Number(parts[3]) : null,
        });
      }
    );
  });
}

async function getGpuUtilCounter(): Promise<GpuUtilResult> {
  const r = await runPSJson<{ pct: number }>(
    `$c = Get-Counter -Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction SilentlyContinue; if ($c) { $sum = ($c.CounterSamples | Measure-Object -Property CookedValue -Sum).Sum; [PSCustomObject]@{ pct = [math]::Round($sum,1) } } else { [PSCustomObject]@{ pct = $null } }`,
    10000
  );
  if (!r || r.pct == null) return { pct: null, temp: null, usedMb: null, totalMb: null };
  return { pct: Math.min(100, Number(r.pct)), temp: null, usedMb: null, totalMb: null };
}

async function getGpus(): Promise<GpuInfo[]> {
  const list = await runPSJson<Array<{ Name: string; AdapterRAM: number; DriverVersion: string }>>(
    `Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion`
  );
  if (!list || (Array.isArray(list) && list.length === 0)) {
    return [{ name: 'No detectada', vramMb: null, driver: null }];
  }
  const arr = Array.isArray(list) ? list : [list];
  return arr.map((g) => ({
    name: g.Name || 'GPU',
    vramMb: g.AdapterRAM ? Math.round(g.AdapterRAM / 1024 / 1024) : null,
    driver: g.DriverVersion || null,
  }));
}

// ---------------------------------------------------------------------------
// RAM / Disk / Network info
// ---------------------------------------------------------------------------

function getRamInfo(): RamInfo {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    totalGb: Number(fmtGb(total).toFixed(1)),
    usedGb: Number(fmtGb(used).toFixed(1)),
    freeGb: Number(fmtGb(free).toFixed(1)),
    pct: total > 0 ? Math.round((used / total) * 100) : 0,
    installedGb: null,
  };
}

async function getInstalledRamGb(): Promise<number | null> {
  const r = await runPSJson<{ Capacity: number }>(
    `$cap = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum; if ($cap) { [PSCustomObject]@{ Capacity = $cap } }`
  );
  return r?.Capacity ? Math.round(fmtGb(r.Capacity)) : null;
}

async function getDisks(): Promise<DiskInfo[]> {
  const r = await runPSJson<Array<{ DeviceID: string; VolumeName: string; DriveType: number; Size: number; FreeSpace: number }>>(
    `Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,DriveType,Size,FreeSpace`
  );
  if (!r) return [];
  const arr = Array.isArray(r) ? r : [r];
  const disks: DiskInfo[] = [];
  for (const d of arr) {
    if (d.DriveType !== 3) continue;
    const total = d.Size || 0;
    const free = d.FreeSpace || 0;
    disks.push({
      drive: d.DeviceID || '',
      label: d.VolumeName || null,
      type: 'SSD/HDD',
      totalGb: Number(fmtGb(total).toFixed(1)),
      freeGb: Number(fmtGb(free).toFixed(1)),
      pct: total > 0 ? Math.round(((total - free) / total) * 100) : 0,
      model: null,
      mediaType: null,
    });
  }
  // attach physical disk model/media type
  try {
    const phys = await runPSJson<Array<{ FriendlyName: string; MediaType: string | null }>>(
      `Get-PhysicalDisk -ErrorAction SilentlyContinue | Select-Object FriendlyName,MediaType`
    );
    if (phys) {
      const arr2 = Array.isArray(phys) ? phys : [phys];
      if (arr2.length) disks[0].model = arr2[0].FriendlyName || null;
      if (arr2.length) disks[0].mediaType = arr2[0].MediaType || null;
    }
  } catch {
    /* optional */
  }
  return disks;
}

function getNetworkInterfaces(): NetIfInfo[] {
  const ifaces = os.networkInterfaces();
  const out: NetIfInfo[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    const a = addrs.find((x) => x.family === 'IPv4' && !x.internal);
    if (a) {
      out.push({ name, family: a.family, address: a.address, mac: a.mac || null });
    }
  }
  return out;
}

async function getWindowsInfo() {
  const r = await runPSJson<{ ProductName: string; DisplayVersion: string; CurrentBuild: string; EditionID: string }>(
    `$p = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'; [PSCustomObject]@{ ProductName=$p.ProductName; DisplayVersion=$p.DisplayVersion; CurrentBuild=$p.CurrentBuild; EditionID=$p.EditionID }`
  );
  return {
    productName: r?.ProductName || 'Windows',
    displayVersion: r?.DisplayVersion || 'Desconocida',
    build: r?.CurrentBuild || '',
    edition: r?.EditionID || '',
    arch: process.env.PROCESSOR_ARCHITECTURE || os.arch(),
  };
}

// ---------------------------------------------------------------------------
// Network speeds
// ---------------------------------------------------------------------------

async function getNetworkRates(): Promise<{ downMbps: number; upMbps: number }> {
  const r = await runPSJson<{ down: number; up: number }>(
    `$c = Get-Counter -Counter '\\Network Interface(*)\\Bytes Received/sec','\\Network Interface(*)\\Bytes Sent/sec' -ErrorAction SilentlyContinue; if ($c) { $down = ($c.CounterSamples | Where-Object { $_.Path -like '*Bytes Received*' } | Measure-Object -Property CookedValue -Sum).Sum; $up = ($c.CounterSamples | Where-Object { $_.Path -like '*Bytes Sent*' } | Measure-Object -Property CookedValue -Sum).Sum; [PSCustomObject]@{ down=$down; up=$up } } else { [PSCustomObject]@{ down=0; up=0 } }`,
    10000
  );
  return {
    downMbps: fmtBytesPerSecToMbps(r?.down ?? 0),
    upMbps: fmtBytesPerSecToMbps(r?.up ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let overviewCache: Overview | null = null;
let overviewCacheTime = 0;

export async function getOverview(force = false): Promise<Overview> {
  const now = Date.now();
  if (!force && overviewCache && now - overviewCacheTime < 60_000) return overviewCache;

  const [cpu, gpus, windows, disks, netIfs] = await Promise.all([
    getCpuDetail(),
    getGpus(),
    getWindowsInfo(),
    getDisks(),
    Promise.resolve(getNetworkInterfaces()),
  ]);
  const ram = getRamInfo();
  const installed = await getInstalledRamGb();
  if (installed) ram.installedGb = installed;

  const bootTime = os.uptime();
  const d = new Date(Date.now() - bootTime * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const bootStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  overviewCache = {
    hostname: os.hostname(),
    windows,
    cpu,
    gpus,
    ram,
    disks,
    network: netIfs,
    uptimeHours: Number((bootTime / 3600).toFixed(1)),
    bootTime: bootStr,
  };
  overviewCacheTime = now;
  return overviewCache;
}

/**
 * Consolidated batch query: runs ONE PowerShell process that collects
 * CPU clock, temperature, GPU utilization, and network counters in a
 * single invocation.  This replaces 4–5 separate spawns per tick.
 */
interface BatchResult {
  cpuClock: number | null;
  cpuTemp: number | null;
  netDown: number;
  netUp: number;
}

/**
 * GPU queried directly from Node.js (no PowerShell overhead).
 * Cached for 5s to avoid hammering nvidia-smi.
 */
let gpuCache: { pct: number|null; temp: number|null; usedMb: number|null; totalMb: number|null } | null = null;
let gpuCacheTime = 0;
const GPU_CACHE_MS = 5000;

function queryGpu(): Promise<{ pct: number|null; temp: number|null; usedMb: number|null; totalMb: number|null }> {
  return new Promise((resolve) => {
    execFile('nvidia-smi',
      ['--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
      { timeout: 4000, windowsHide: true },
      (_err, stdout) => {
        const out = stdout?.trim();
        if (!out) return resolve({ pct: null, temp: null, usedMb: null, totalMb: null });
        const p = out.split(',').map(s => s.trim());
        resolve({
          pct:     p[0] && p[0] !== '[N/A]' ? Math.min(100, Math.max(0, Math.round(Number(p[0])))) : null,
          temp:    p[1] && p[1] !== '[N/A]' ? Number(p[1]) : null,
          usedMb:  p[2] && p[2] !== '[N/A]' ? Number(p[2]) : null,
          totalMb: p[3] && p[3] !== '[N/A]' ? Number(p[3]) : null,
        });
      }
    );
  });
}

/**
 * PowerShell batch now only does CPU temp + network (nvidia-smi removed).
 * This makes the PS script ~40% lighter.
 */
const BATCH_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'

# ── CPU clock (cached after first run — rarely changes) ──
if ($env:CACHED_CLOCK) { $clockVal = [int]$env:CACHED_CLOCK } else {
  $cpu = [wmi]'root\\cimv2:Win32_Processor.DeviceID="CPU0"'
  $clockVal = if ($cpu) { [int]$cpu.CurrentClockSpeed } else { $null }
  if ($clockVal) { $env:CACHED_CLOCK = $clockVal }
}

# ── CPU temperature ──
$cpuTemp = $null
try {
  $t = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop | Select-Object -First 1 CurrentTemperature
  if ($t) { $cpuTemp = [math]::Round($t.CurrentTemperature / 10 - 273.15) }
} catch {}

# ── Network: primary adapter only (lighter than all-adapter Get-Counter) ──
$netDown = 0; $netUp = 0
try {
  $ifIndex = (Get-NetAdapter -PhysicalMediaType '802.3' -ErrorAction SilentlyContinue |
    Sort-Object -Property Status -Descending | Select-Object -First 1).InterfaceIndex
  if ($ifIndex) {
    $c = Get-Counter -Counter "\\Network Interface($ifIndex)\\Bytes Received/sec","\\Network Interface($ifIndex)\\Bytes Sent/sec" -ErrorAction SilentlyContinue
    if ($c) {
      foreach ($s in $c.CounterSamples) {
        if ($s.Path -like '*Bytes Received*') { $netDown = [long]$s.CookedValue }
        elseif ($s.Path -like '*Bytes Sent*')     { $netUp   = [long]$s.CookedValue }
      }
    }
  }
} catch {}

[PSCustomObject]@{
  clock  = $clockVal
  temp   = $cpuTemp
  netD   = $netDown
  netU   = $netUp
}
`;

let lastBatch: BatchResult | null = null;
let lastBatchTime = 0;
const BATCH_MIN_INTERVAL = 6000;

export async function getMonitorSnapshot(): Promise<MonitorSnapshot> {
  // ── CPU usage via two Node os.cpus() samples (non-blocking) ──
  const now = Date.now();
  const currentSample = sampleCpu();
  let cpuPct = 0;
  if (lastCpuSample && now - lastCpuSampleTime > 2500) {
    cpuPct = Math.round(computeCpuPct(lastCpuSample, currentSample));
    lastCpuSample = null;
  } else if (!lastCpuSample) {
    lastCpuSample = currentSample;
    lastCpuSampleTime = now;
  }

  // ── RAM and disk are pure Node.js calls (no child process) ──
  const ram = getRamInfo();
  const root = path.parse(os.homedir()).root;
  const disk = statfsTotalFree(root);
  const diskPct = disk.total > 0 ? Math.round(((disk.total - disk.free) / disk.total) * 100) : 0;

  // ── Batched PowerShell query (CPU temp + network only, no GPU) ──
  let batch = lastBatch;
  if (!batch || now - lastBatchTime > BATCH_MIN_INTERVAL) {
    try {
      const raw = await runPSJson<{ clock: number|null; temp: number|null; netD: number; netU: number }>(BATCH_SCRIPT, 10000);
      if (raw) {
        batch = {
          cpuClock: raw.clock ?? null,
          cpuTemp: raw.temp != null ? Math.round(Number(raw.temp)) : null,
          netDown: fmtBytesPerSecToMbps(Number(raw.netD) || 0),
          netUp: fmtBytesPerSecToMbps(Number(raw.netU) || 0),
        };
        lastBatch = batch;
        lastBatchTime = now;
      }
    } catch {
      batch = lastBatch;
    }
  }

  // ── GPU via direct Node.js (no PowerShell overhead, cached 5s) ──
  let gpu = gpuCache;
  if (!gpu || now - gpuCacheTime > GPU_CACHE_MS) {
    try { gpu = await queryGpu(); gpuCache = gpu; gpuCacheTime = now; } catch { gpu = gpuCache; }
  }

  // ── Fallback to overview cache for clock if batch is stale ──
  let clockMhz: number | null = batch?.cpuClock ?? null;
  if (clockMhz == null && overviewCache) {
    clockMhz = overviewCache.cpu.clockMhz;
  }

  return {
    cpu: { pct: cpuPct, temp: batch?.cpuTemp ?? null, clockMhz },
    gpu: {
      pct: gpu?.pct ?? null,
      temp: gpu?.temp ?? null,
      usedMb: gpu?.usedMb ?? null,
      totalMb: gpu?.totalMb ?? null,
    },
    ram: { pct: ram.pct, usedGb: ram.usedGb, totalGb: ram.totalGb, freeGb: ram.freeGb },
    disk: {
      pct: diskPct,
      usedGb: Number(fmtGb(disk.total - disk.free).toFixed(1)),
      totalGb: Number(fmtGb(disk.total).toFixed(1)),
    },
    net: { downMbps: batch?.netDown ?? 0, upMbps: batch?.netUp ?? 0 },
    timestamp: now,
  };
}
