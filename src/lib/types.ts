export type TweakCategory = 'windows' | 'gaming' | 'privacy';
export type TweakImpact = 'LOW' | 'MEDIUM' | 'HIGH';
export type TweakRisk = 'SAFE' | 'CAUTION' | 'ADVANCED';

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

export interface HealthFactor {
  name: string;
  status: 'ok' | 'warn' | 'bad';
  detail: string;
  weight: number;
}

export interface HealthReport {
  score: number;
  label: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  factors: HealthFactor[];
}

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

export interface ProcessRow {
  pid: number;
  name: string;
  cpuPct: number;
  memMb: number;
  workingSetMb: number;
  path: string | null;
  sessionId: number;
  protected: boolean;
}

export interface ServiceRow {
  name: string;
  displayName: string;
  status: 'running' | 'stopped';
  startMode: string;
  description: string;
  path: string | null;
  important: boolean;
}

export interface StartupEntry {
  id: string;
  name: string;
  command: string;
  location: string;
  type: 'registry' | 'folder';
  enabled: boolean;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  publisher: string;
}

export interface CleanupCategory {
  id: string;
  name: string;
  description: string;
  path: string | null;
  size: number;
  files: number;
  selected: boolean;
  available: boolean;
  special: string;
}

export interface CleanResult {
  results: Array<{ id: string; name: string; removedBytes: number; removedFiles: number; error?: string }>;
  totalRemovedBytes: number;
  totalFiles: number;
}

export interface TweakView {
  id: string;
  name: string;
  description: string;
  category: TweakCategory;
  impact: TweakImpact;
  risk: TweakRisk;
  scope: 'user' | 'system';
  requiresAdmin: boolean;
  applied: boolean;
}

export interface GamingState {
  active: boolean;
  applied: string[];
}

export interface OptMetric {
  cpuPct: number;
  ramPct: number;
  ramUsedGb: number;
  gpuPct: number | null;
  processes: number;
  workingSetGb: number;
}

export type OptStatus = 'apply' | 'applied' | 'already' | 'requires-admin' | 'not-needed' | 'skipped-risky' | 'failed';

export interface OptAction {
  id: string;
  name: string;
  description: string;
  category: 'windows' | 'gaming' | 'privacy';
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  risk: 'SAFE' | 'CAUTION' | 'ADVANCED';
  scope: 'user' | 'system';
  requiresAdmin: boolean;
  status: OptStatus;
  reasonKey?: string;
  reason?: string;
}

export interface DiagnosisFact {
  id: string;
  value: string;
  status: 'ok' | 'warn' | 'info';
}

export interface OptimizationReport {
  actions: OptAction[];
  diagnosis: DiagnosisFact[];
  baseline: OptMetric;
  requiresRestart: boolean;
  tempBytes: number;
  warnings: string[];
  appliedCount: number;
  alreadyCount: number;
  requiresAdminCount: number;
  notNeededCount: number;
  failedCount: number;
  executedAt: string;
}

export interface OptimizationPreview {
  actions: OptAction[];
  diagnosis: DiagnosisFact[];
  baseline: OptMetric;
  availableCount: number;
  riskyAvailable: number;
  already: number;
  requiresAdmin: number;
  notNeeded: number;
  tempBytes: number;
  lastRun: string | null;
  isAdmin: boolean;
}

export interface BoostStatus {
  gaming: {
    active: boolean;
    game: string | null;
    details: string[];
    warnings: string[];
  };
  network: {
    active: boolean;
    details: string[];
    warnings: string[];
    pingBefore: number | null;
    pingAfter: number | null;
  };
  snapshot: {
    cpuPct: number | null;
    cpuTemp: number | null;
    ramPct: number;
    ramUsedGb: number;
    ramTotalGb: number;
    gpuPct: number | null;
    gpuTemp: number | null;
    gpuUsedMb: number | null;
    gpuTotalMb: number | null;
    powerPlan: string | null;
  } | null;
}

export interface GamingModeResult {
  active: boolean;
  applied: string[];
  failed: string[];
  messages: string[];
}

export interface NetInfo {
  status: string;
  interfaceName: string | null;
  ip: string | null;
  gateway: string | null;
  dns: string[];
  mac: string | null;
  adapters: Array<{ name: string; status: string; speedMbps: number | null; mac: string | null; ipv4: string | null }>;
  connections: number;
}

export interface PrivacySummary {
  backgroundApps: Array<{ name: string; status: string }>;
  tweaksStatus: Array<{ id: string; name: string; applied: boolean; risk: string }>;
  historyItems: Array<{ name: string; count: number }>;
}

export interface ChangeRecord {
  id: string;
  date: string;
  tweakId: string;
  name: string;
  category: string;
  action: string;
  reversible: boolean;
  reverted: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'SYSTEM';
  category: string;
  message: string;
}

export interface AppSettings {
  language: 'es' | 'en';
  theme: 'dark' | 'light' | 'system';
  animations: boolean;
  transparency: boolean;
  runOnStartup: boolean;
  minimizeToTray: boolean;
  notifications: boolean;
  infoLevel: 'basic' | 'detailed' | 'advanced';
  confirmChanges: boolean;
  autoRestorePoint: boolean;
}

export interface AppInfo {
  version: string;
  dataDir: string;
  isAdmin: boolean;
}

export interface ConsoleLine {
  kind: 'out' | 'err' | 'info' | 'exit';
  text: string;
  time: string;
}

export type CommandClass = 'SAFE' | 'ADMIN' | 'ADVANCED';

export interface InputDelayItem {
  id: string;
  name: string;
  description: string;
  before: string;
  after: string;
  applied: boolean;
  category: 'display' | 'power' | 'mouse' | 'system' | 'network';
}

export interface GameProfile {
  id: string;
  name: string;
  game: string;
  powerPlan: string;
  priority: 'normal' | 'high' | 'realtime';
  memoryClean: boolean;
  tweaks: string[];
  autoApply: boolean;
  createdAt: string;
}

// ---- nvidia ----

export interface NvidiaGpu {
  name: string;
  driverVersion: string;
  vramMb: number;
  vramUsedMb: number | null;
  temperature: number | null;
  utilizationPct: number | null;
  powerDrawW: number | null;
  powerLimitW: number | null;
  clockMhz: number | null;
  memoryClockMhz: number | null;
  fanSpeedPct: number | null;
  pciBus: number;
  pcieGen: number | null;
  index: number;
}

export interface NvidiaProfile {
  id: string;
  name: string;
  powerMgmt: 'adaptive' | 'preferMax' | 'optimal';
  textureFilterQuality: 'quality' | 'highQuality' | 'performance' | 'highPerformance';
  textureFilterTrilinear: 'on' | 'off';
  anisotropicFiltering: 'auto' | 'on' | 'off';
  antiAliasingMode: 'applicationControlled' | 'enhance' | 'override';
  antiAliasingTransparency: 'off' | 'multisample' | 'supersample';
  cudaGpus: 'all' | 'auto';
  shaderCacheSize: 'driverDefault' | 'unlimited' | 'disabled';
  powerManagementMode: 'optimal' | 'adaptive' | 'preferMaxPerformance';
  preRenderLimit: number;
  monitorTechnology: 'gSync' | 'fixedRefresh' | 'auto';
  lowLatencyMode: 'off' | 'on' | 'ultra';
  vsyncMode: 'applicationControlled' | 'forceOff' | 'forceOn' | 'adaptive';
  maxFrameRate: number;
  createdAt: string;
}

export interface NvidiaPreset {
  id: string;
  name: string;
  description: string;
}

export interface NvidiaSystemInfo {
  available: boolean;
  gpus: NvidiaGpu[];
  driverOutdated: boolean;
  driverVersion: string | null;
}

// ---- game optimizer ----

export interface DetectedGame {
  id: string;
  name: string;
  exe: string | null;
  platform: 'steam' | 'epic' | 'riot' | 'xbox' | 'gog' | 'battle.net' | 'other';
  installPath: string | null;
  running: boolean;
  pid: number | null;
}

export interface GameOptimization {
  id: string;
  gameId: string;
  name: string;
  applyPowerPlan: boolean;
  memoryClean: boolean;
  priority: 'normal' | 'high' | 'realtime';
  gameDvrOff: boolean;
  fullscreenOptOff: boolean;
  gameModeOn: boolean;
  networkOptimize: boolean;
  cpuCoreAffinity: number | null;
  autoApply: boolean;
  createdAt: string;
}

export interface GameBoostStatus {
  activeOptimizations: string[];
  runningGames: string[];
  totalOptimizations: number;
}
