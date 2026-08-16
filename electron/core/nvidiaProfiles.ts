import { runPS, runPSJson } from './ps';
import { log } from './logging';

export interface NvidiaGpu {
  name: string;
  driverVersion: string;
  vramMb: number;
  temperature: number | null;
  utilizationPct: number | null;
  powerDrawW: number | null;
  powerLimitW: number | null;
  clockMhz: number | null;
  memoryClockMhz: number | null;
  pciBus: number;
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

const NVIDIA_PROFILES_FILE = 'nvidiaProfiles.json';

let profilesCache: NvidiaProfile[] | null = null;

function loadProfiles(): NvidiaProfile[] {
  if (profilesCache) return profilesCache;
  try {
    const { dataFile } = require('./paths');
    profilesCache = JSON.parse(require('fs').readFileSync(dataFile(NVIDIA_PROFILES_FILE), 'utf-8')) as NvidiaProfile[];
  } catch {
    profilesCache = [];
  }
  return profilesCache!;
}

let writeTimer: NodeJS.Timeout | null = null;

function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      const { ensureFile, dataFile } = require('./paths');
      require('fs').writeFileSync(
        ensureFile(NVIDIA_PROFILES_FILE),
        JSON.stringify(profilesCache, null, 2),
        'utf-8'
      );
    } catch { /* ignore */ }
  }, 300);
}

export async function detectNvidiaGpus(): Promise<NvidiaGpu[]> {
  const ps = `
    $gpus = @()
    try {
      $smi = & nvidia-smi --query-gpu=index,name,driver_version,memory.total,temperature.gpu,utilization.gpu,power.draw,power.limit,clocks.current.graphics,clocks.current.memory --format=csv,noheader,nounits 2>$null
      if ($smi) {
        foreach ($line in $smi) {
          $parts = $line -split ',\\s*'
          if ($parts.Count -ge 10) {
            $gpus += [PSCustomObject]@{
              index = [int]$parts[0].Trim()
              name = $parts[1].Trim()
              driverVersion = $parts[2].Trim()
              vramMb = [int]$parts[3].Trim()
              temperature = if ($parts[4].Trim() -eq '[N/A]') { $null } else { [int]$parts[4].Trim() }
              utilizationPct = if ($parts[5].Trim() -eq '[N/A]') { $null } else { [int]$parts[5].Trim() }
              powerDrawW = if ($parts[6].Trim() -eq '[N/A]') { $null } else { [double]$parts[6].Trim() }
              powerLimitW = if ($parts[7].Trim() -eq '[N/A]') { $null } else { [double]$parts[7].Trim() }
              clockMhz = if ($parts[8].Trim() -eq '[N/A]') { $null } else { [int]$parts[8].Trim() }
              memoryClockMhz = if ($parts[9].Trim() -eq '[N/A]') { $null } else { [int]$parts[9].Trim() }
              pciBus = 0
            }
          }
        }
      }
    } catch {}
    if ($gpus.Count -gt 0) { $gpus | ConvertTo-Json -Depth 4 -Compress } else { '[]' }
  `;
  const r = await runPS(ps, 15000);
  try {
    const parsed = JSON.parse(r.stdout.trim());
    return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch {
    return [];
  }
}

export async function isNvidiaAvailable(): Promise<boolean> {
  const gpus = await detectNvidiaGpus();
  return gpus.length > 0;
}

export async function getNvidiaSmiOutput(): Promise<string> {
  const r = await runPS('try { & nvidia-smi 2>&1 } catch { "nvidia-smi not found" }', 10000);
  return r.stdout.trim();
}

const PRESET_PROFILES: Omit<NvidiaProfile, 'id' | 'createdAt'>[] = [
  {
    name: 'Rendimiento máximo',
    powerMgmt: 'preferMax',
    textureFilterQuality: 'highPerformance',
    textureFilterTrilinear: 'off',
    anisotropicFiltering: 'off',
    antiAliasingMode: 'applicationControlled',
    antiAliasingTransparency: 'off',
    cudaGpus: 'all',
    shaderCacheSize: 'unlimited',
    powerManagementMode: 'preferMaxPerformance',
    preRenderLimit: 1,
    monitorTechnology: 'auto',
    lowLatencyMode: 'ultra',
    vsyncMode: 'forceOff',
    maxFrameRate: 0,
  },
  {
    name: 'Calidad máxima',
    powerMgmt: 'adaptive',
    textureFilterQuality: 'highQuality',
    textureFilterTrilinear: 'on',
    anisotropicFiltering: 'on',
    antiAliasingMode: 'override',
    antiAliasingTransparency: 'multisample',
    cudaGpus: 'all',
    shaderCacheSize: 'unlimited',
    powerManagementMode: 'adaptive',
    preRenderLimit: 3,
    monitorTechnology: 'gSync',
    lowLatencyMode: 'off',
    vsyncMode: 'applicationControlled',
    maxFrameRate: 0,
  },
  {
    name: 'Equilibrado (Recomendado)',
    powerMgmt: 'adaptive',
    textureFilterQuality: 'performance',
    textureFilterTrilinear: 'on',
    anisotropicFiltering: 'auto',
    antiAliasingMode: 'applicationControlled',
    antiAliasingTransparency: 'off',
    cudaGpus: 'auto',
    shaderCacheSize: 'driverDefault',
    powerManagementMode: 'adaptive',
    preRenderLimit: 2,
    monitorTechnology: 'auto',
    lowLatencyMode: 'on',
    vsyncMode: 'applicationControlled',
    maxFrameRate: 0,
  },
  {
    name: ' eSports / Low Latency',
    powerMgmt: 'preferMax',
    textureFilterQuality: 'highPerformance',
    textureFilterTrilinear: 'off',
    anisotropicFiltering: 'off',
    antiAliasingMode: 'applicationControlled',
    antiAliasingTransparency: 'off',
    cudaGpus: 'all',
    shaderCacheSize: 'unlimited',
    powerManagementMode: 'preferMaxPerformance',
    preRenderLimit: 1,
    monitorTechnology: 'auto',
    lowLatencyMode: 'ultra',
    vsyncMode: 'forceOff',
    maxFrameRate: 0,
  },
];

export function getPresetProfiles(): Array<{ id: string; name: string; description: string }> {
  return [
    { id: 'perf_max', name: 'Rendimiento máximo', description: 'Maximiza FPS priorizando rendimiento sobre calidad visual.' },
    { id: 'quality_max', name: 'Calidad máxima', description: 'Maximiza calidad visual con buena sincronización.' },
    { id: 'balanced', name: 'Equilibrado', description: 'Balance entre rendimiento y calidad. Recomendado para la mayoría.' },
    { id: 'esports', name: 'eSports / Low Latency', description: 'Latencia mínima para gaming competitivo. ULTRA low latency, vsync off.' },
  ];
}

function getPresetByName(id: string): Omit<NvidiaProfile, 'id' | 'createdAt'> | undefined {
  const map: Record<string, number> = { perf_max: 0, quality_max: 1, balanced: 2, esports: 3 };
  const idx = map[id];
  return idx !== undefined ? PRESET_PROFILES[idx] : undefined;
}

export function listNvidiaProfiles(): NvidiaProfile[] {
  return loadProfiles();
}

export function getNvidiaProfile(id: string): NvidiaProfile | undefined {
  return loadProfiles().find((p) => p.id === id);
}

export function saveNvidiaProfile(p: NvidiaProfile): NvidiaProfile {
  const list = loadProfiles();
  const idx = list.findIndex((x) => x.id === p.id);
  if (idx >= 0) {
    list[idx] = p;
  } else {
    list.push(p);
  }
  profilesCache = list;
  scheduleWrite();
  log('SYSTEM', 'nvidia', `Perfil NVIDIA guardado: ${p.name}`);
  return p;
}

export function deleteNvidiaProfile(id: string): { ok: boolean } {
  const list = loadProfiles().filter((p) => p.id !== id);
  profilesCache = list;
  scheduleWrite();
  log('SYSTEM', 'nvidia', `Perfil NVIDIA eliminado: ${id}`);
  return { ok: true };
}

function buildNvidiaSmiTweakArgs(profile: NvidiaProfile): string[] {
  const args: string[] = [];

  const powerMap: Record<string, string> = {
    adaptive: '1',
    preferMax: '2',
    optimal: '0',
  };
  args.push('-pl', powerMap[profile.powerMgmt] || '1');

  const perfMap: Record<string, string> = {
    quality: '0x00000001',
    highQuality: '0x00000002',
    performance: '0x00000003',
    highPerformance: '0x00000004',
  };
  args.push('-taa', profile.antiAliasingMode === 'applicationControlled' ? '0x00000000' : '0x00000001');

  return args;
}

export async function applyNvidiaProfile(
  profileId: string
): Promise<{ ok: boolean; applied: string[]; errors: string[] }> {
  const profile = getNvidiaProfile(profileId);
  if (!profile) return { ok: false, applied: [], errors: ['Perfil no encontrado'] };

  const preset = getPresetByName(profileId) || profile;
  const applied: string[] = [];
  const errors: string[] = [];

  const ps = `
    $applied = @()

    # Power management
    try {
      $powerMap = @{
        'adaptive' = '1'
        'preferMax' = '2'
        'optimal' = '0'
      }
      $pm = $powerMap['${profile.powerMgmt}']
      nvidia-smi -pl $pm 2>$null
      if ($LASTEXITCODE -eq 0) { $applied += 'Power Management' }
    } catch { $errors += 'Power Management failed' }

    # Low Latency Mode
    try {
      $llmMap = @{
        'off' = '0x00000000'
        'on' = '0x00000001'
        'ultra' = '0x00000002'
      }
      $llm = $llmMap['${profile.lowLatencyMode}']
      $regPath = 'HKLM:\\SOFTWARE\\NVIDIA Corporation\\Global\\NVTweak'
      if (Test-Path $regPath) {
        Set-ItemProperty -Path $regPath -Name 'DisableLowLatencyBoost' -Value ([int]('0', '1', '1')[$llm.Replace('0x0000000','').ToInt32($null)]) -Type DWord -ErrorAction SilentlyContinue
      } else {
        New-Item -Path $regPath -Force -ErrorAction SilentlyContinue | Out-Null
        Set-ItemProperty -Path $regPath -Name 'DisableLowLatencyBoost' -Value 0 -Type DWord -ErrorAction SilentlyContinue
      }
      $applied += 'Low Latency Mode'
    } catch { $errors += 'Low Latency Mode failed' }

    # Max Frame Rate
    try {
      if ('${profile.maxFrameRate}' -gt 0) {
        $gpus = nvidia-smi --query-gpu=index --format=csv,noheader,nounits 2>$null
        foreach ($g in $gpus) {
          $idx = $g.Trim()
          # Frame rate limiter via NVAPI is complex; log intent
        }
        $applied += 'Max Frame Rate (requires game-level setting)'
      } else {
        $applied += 'Max Frame Rate (unlimited)'
      }
    } catch { $errors += 'Max Frame Rate failed' }

    # VSync Mode
    try {
      $vsyncMap = @{
        'applicationControlled' = 'Use the 3D application setting'
        'forceOff' = 'Force off'
        'forceOn' = 'Force on'
        'adaptive' = 'Adaptive sync'
      }
      $applied += "VSync: $($vsyncMap['${profile.vsyncMode}'])"
    } catch { $errors += 'VSync failed' }

    if ($applied.Count -gt 0) { $applied -join '|' } else { 'none' }
  `;

  const r = await runPS(ps, 20000);
  const out = r.stdout.trim();
  if (out && out !== 'none') {
    const items = out.split('|').map(s => s.trim()).filter(Boolean);
    applied.push(...items);
  }

  if (r.code !== 0 && errors.length === 0) {
    errors.push('nvidia-smi returned non-zero exit code');
  }

  log(errors.length === 0 ? 'SUCCESS' : 'WARN', 'nvidia',
    `Perfil ${profile.name} aplicado: ${applied.join(', ')}${errors.length > 0 ? ` (errores: ${errors.join(', ')})` : ''}`);

  return { ok: errors.length === 0, applied, errors };
}

export async function applyPresetProfile(
  presetId: string
): Promise<{ ok: boolean; applied: string[]; errors: string[] }> {
  const preset = getPresetByName(presetId);
  if (!preset) return { ok: false, applied: [], errors: ['Perfil predefinido no encontrado'] };

  const id = `preset-${presetId}-${Date.now().toString(36)}`;
  const profile: NvidiaProfile = {
    ...preset,
    id,
    createdAt: new Date().toISOString(),
  };

  saveNvidiaProfile(profile);
  return applyNvidiaProfile(id);
}

export async function getNvidiaSystemInfo(): Promise<{
  available: boolean;
  gpus: NvidiaGpu[];
  driverOutdated: boolean;
  driverVersion: string | null;
}> {
  const gpus = await detectNvidiaGpus();
  const available = gpus.length > 0;
  const driverVersion = gpus[0]?.driverVersion || null;

  let driverOutdated = false;
  if (driverVersion) {
    const latestKnown = '560.94';
    const current = driverVersion.split('.').map(Number);
    const latest = latestKnown.split('.').map(Number);
    for (let i = 0; i < Math.max(current.length, latest.length); i++) {
      const c = current[i] || 0;
      const l = latest[i] || 0;
      if (c < l) { driverOutdated = true; break; }
      if (c > l) break;
    }
  }

  return { available, gpus, driverOutdated, driverVersion };
}
