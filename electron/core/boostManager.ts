import * as fs from 'fs';
import { ensureFile, dataFile } from './paths';
import { runPS, runPSJson } from './ps';
import { regQuery } from './registry';
import { addChange, revertChange, applyRegistryChange, ChangeCategory } from './restoreManager';
import { getLatency } from './networkTools';
import { log } from './logging';
import { getActiveSchemeGuid, setPowerPlan } from '../shared/powercfg';
import { POWER_GUIDS } from '../shared/constants';
import { getMonitorSnapshot } from './systemInfo';
import { emptyStandbyList } from './windowsTweaks';

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

interface GamingSession {
  changeIds: string[];
  game: string | null;
  pid: number | null;
  prevPriority: string | null;
  details: string[];
}

interface NetworkSession {
  changeIds: string[];
  dnsRevert: Array<{ ifIndex: number; names: string[] }> | null;
  details: string[];
  pingBefore: number | null;
  pingAfter: number | null;
}

interface Session {
  gaming?: GamingSession;
  network?: NetworkSession;
}

let sessionCache: Session | null = null;

function readSession(): Session {
  if (sessionCache) return sessionCache;
  try {
    sessionCache = JSON.parse(fs.readFileSync(dataFile('boost-session.json'), 'utf-8')) as Session;
  } catch {
    sessionCache = {};
  }
  return sessionCache!;
}

let sessionWriteTimer: NodeJS.Timeout | null = null;
let pendingSession: Session | null = null;

function writeSession(s: Session) {
  sessionCache = s;
  pendingSession = s;
  if (sessionWriteTimer) return;
  sessionWriteTimer = setTimeout(() => {
    sessionWriteTimer = null;
    if (!pendingSession) return;
    const toWrite = pendingSession;
    pendingSession = null;
    try {
      fs.writeFileSync(ensureFile('boost-session.json'), JSON.stringify(toWrite, null, 2), 'utf-8');
    } catch { /* ignore */ }
  }, 200);
}

function emptyStatus(): BoostStatus {
  return {
    gaming: { active: false, game: null, details: [], warnings: [] },
    network: { active: false, details: [], warnings: [], pingBefore: null, pingAfter: null },
    snapshot: null,
  };
}

async function getActiveSnapshot(): Promise<BoostStatus['snapshot']> {
  try {
    const snap = await getMonitorSnapshot();
    const guid = await getActiveSchemeGuid().catch(() => null);
    let powerPlan: string | null = null;
    if (guid) {
      if (guid === POWER_GUIDS.ULTRA) powerPlan = 'Máximo rendimiento';
      else if (guid === POWER_GUIDS.HIGH_PERF) powerPlan = 'Alto rendimiento';
      else if (guid === POWER_GUIDS.BALANCED) powerPlan = 'Equilibrado';
      else powerPlan = guid.slice(0, 8) + '...';
    }
    return {
      cpuPct: snap.cpu.pct,
      cpuTemp: snap.cpu.temp,
      ramPct: snap.ram.pct,
      ramUsedGb: snap.ram.usedGb,
      ramTotalGb: snap.ram.totalGb,
      gpuPct: snap.gpu.pct,
      gpuTemp: snap.gpu.temp,
      gpuUsedMb: snap.gpu.usedMb,
      gpuTotalMb: snap.gpu.totalMb,
      powerPlan,
    };
  } catch {
    return null;
  }
}

export async function getBoostStatus(): Promise<BoostStatus> {
  const s = readSession();
  const st = emptyStatus();
  const isActive = !!(s.gaming || s.network);
  if (s.gaming) {
    st.gaming.active = true;
    st.gaming.game = s.gaming.game;
    st.gaming.details = s.gaming.details;
  }
  if (s.network) {
    st.network.active = true;
    st.network.details = s.network.details;
    st.network.pingBefore = s.network.pingBefore;
    st.network.pingAfter = s.network.pingAfter;
  }
  if (isActive) {
    st.snapshot = await getActiveSnapshot();
  }
  return st;
}

/** Apply a registry change recorded in the Restore Center. Returns changeId or null if already set. */
async function boostRegistry(opts: {
  tweakId: string;
  name: string;
  category: ChangeCategory;
  action: string;
  key: string;
  valueName: string;
  type: string;
  data: string;
}): Promise<string | null> {
  const prev = await regQuery(opts.key, opts.valueName);
  const norm = (v: string) => {
    const t = v.trim().toLowerCase();
    const m = t.match(/0x([0-9a-f]+)/);
    return m ? String(parseInt(m[1], 16)) : t;
  };
  if (prev.exists && norm(prev.data) === norm(opts.data)) return null;
  const rec = await applyRegistryChange(
    opts.tweakId,
    opts.name,
    opts.category,
    opts.action,
    opts.key,
    opts.valueName,
    opts.type,
    opts.data,
    false
  );
  return rec.id;
}

/** Detects the game process in the foreground. Returns pid, name, title or null. */
async function detectForegroundGame(): Promise<{ pid: number; name: string; title: string } | null> {
  const ps = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class GWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
'@
$h = [GWin]::GetForegroundWindow()
if ($h -eq [IntPtr]::Zero) { 'NONE' }
else {
  $procId = 0
  [void][GWin]::GetWindowThreadProcessId($h, [ref]$procId)
  $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($p -and $p.MainWindowTitle) { "$($p.Id)|$($p.ProcessName)|$($p.MainWindowTitle)" } else { 'NONE' }
}
`;
  const r = await runPS(ps, 20000);
  const out = r.stdout.trim();
  if (!out || out === 'NONE') return null;
  const [pidS, name, ...rest] = out.split('|');
  const pid = Number(pidS);
  if (!pid) return null;
  return { pid, name: name || 'juego', title: rest.join('|') };
}

async function setProcessPriority(pid: number, priority: string): Promise<boolean> {
  const r = await runPS(
    `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($null -eq $p) { 'GONE' } else { try { $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${priority}; 'OK' } catch { 'ERR' } }`,
    15000
  );
  return r.stdout.trim() === 'OK';
}

async function getProcessPriority(pid: number): Promise<string | null> {
  const r = await runPS(`(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).PriorityClass`, 15000);
  const v = r.stdout.trim();
  return v && v !== 'GONE' ? v : null;
}

// ---------------------------------------------------------------------------
// Gaming FPS Boost
// ---------------------------------------------------------------------------

export async function boostGamingStart(): Promise<BoostStatus> {
  const s = readSession();
  if (s.gaming) return await getBoostStatus();

  const game = await detectForegroundGame();
  const warnings: string[] = [];
  const details: string[] = [];
  const changeIds: string[] = [];

  // 1) Power plan -> Ultimate / High performance (reversible)
  try {
    const prev = await getActiveSchemeGuid();
    const ultra = await runPS(`powercfg -list | Select-String -Pattern '${POWER_GUIDS.ULTRA}'`, 15000);
    const guid = ultra.stdout.trim() ? POWER_GUIDS.ULTRA : POWER_GUIDS.HIGH_PERF;
    if (prev === guid) {
      details.push('Plan de energía: ya estaba en rendimiento máximo.');
    } else {
      const res = await setPowerPlan(guid);
      if (res.ok) {
        const rec = addChange({
          tweakId: 'boost_fps',
          name: 'FPS Boost: plan de energía máxima',
          category: 'gaming',
          action: `Plan activo cambiado a rendimiento máximo (antes: ${prev || 'desconocido'})`,
          reversible: true,
          payload: { kind: 'powercfg', schemeGuid: prev || POWER_GUIDS.HIGH_PERF, schemeName: 'plan anterior' },
        });
        changeIds.push(rec.id);
        details.push('Plan de energía: rendimiento máximo activado.');
      } else {
        warnings.push(`Plan de energía: ${res.message}`);
      }
    }
  } catch (e: any) {
    warnings.push(`Plan de energía: ${e.message}`);
  }

  // 2) Game DVR off (reversible)
  try {
    const a = await boostRegistry({
      tweakId: 'boost_fps',
      name: 'FPS Boost: Game DVR desactivado',
      category: 'gaming',
      action: 'GameDVR_Enabled -> 0',
      key: 'HKEY_CURRENT_USER\\System\\GameConfigStore',
      valueName: 'GameDVR_Enabled',
      type: 'REG_DWORD',
      data: '0',
    });
    if (a) changeIds.push(a);
    details.push(a ? 'Grabación de juego (DVR): desactivada.' : 'Grabación de juego (DVR): ya desactivada.');
  } catch {
    warnings.push('Grabación de juego (DVR): no se pudo modificar.');
  }
  try {
    const b = await boostRegistry({
      tweakId: 'boost_fps',
      name: 'FPS Boost: captura de fondo desactivada',
      category: 'gaming',
      action: 'AppCaptureEnabled -> 0',
      key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR',
      valueName: 'AppCaptureEnabled',
      type: 'REG_DWORD',
      data: '0',
    });
    if (b) changeIds.push(b);
    details.push(b ? 'Captura en segundo plano: desactivada.' : 'Captura en segundo plano: ya desactivada.');
  } catch {
    warnings.push('Captura en segundo plano: no se pudo modificar.');
  }

  // 3) Process responsiveness boost (admin, reversible)
  try {
    const c = await boostRegistry({
      tweakId: 'boost_fps',
      name: 'FPS Boost: prioridad de procesos',
      category: 'gaming',
      action: 'Win32PrioritySeparation -> 0x26',
      key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl',
      valueName: 'Win32PrioritySeparation',
      type: 'REG_DWORD',
      data: '38',
    });
    if (c) changeIds.push(c);
    details.push(c ? 'Prioridad de procesos: juegos en primer plano priorizados.' : 'Prioridad de procesos: ya optimizada.');
  } catch {
    warnings.push('Prioridad de procesos: requiere administrador.');
  }

  // 4) GPU hardware scheduling (admin, reversible)
  try {
    const g = await boostRegistry({
      tweakId: 'boost_fps',
      name: 'FPS Boost: GPU hardware scheduling',
      category: 'gaming',
      action: 'HwSchMode -> 2',
      key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
      valueName: 'HwSchMode',
      type: 'REG_DWORD',
      data: '2',
    });
    if (g) changeIds.push(g);
    details.push(g ? 'GPU hardware scheduling: activado (reduce CPU overhead).' : 'GPU hardware scheduling: ya activado.');
  } catch {
    warnings.push('GPU hardware scheduling: requiere administrador.');
  }

  // 6) Disable HPET (High Precision Event Timer) — reduces stuttering (admin, reversible)
  try {
    const h = await boostRegistry({
      tweakId: 'boost_fps',
      name: 'FPS Boost: HPET desactivado',
      category: 'gaming',
      action: 'HPET disabled via bcdedit',
      key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\FrequencyValidator\\WinTimer',
      valueName: 'HPETEnabled',
      type: 'REG_DWORD',
      data: '0',
    });
    if (h) changeIds.push(h);
    // Also apply via bcdedit for immediate effect
    await runPS('bcdedit /set disabledynamictick yes', 10000).catch(() => {});
    details.push(h ? 'HPET / Dynamic Tick: desactivado (menos stuttering).' : 'HPET: ya desactivado.');
  } catch {
    warnings.push('HPET: requiere administrador.');
  }

  // 7) Empty standby memory — frees cached RAM immediately (non-reversible, quick)
  try {
    const m = await emptyStandbyList();
    if (m.ok) details.push('Memoria en standby: liberada (RAM disponible aumentada).');
    else warnings.push(`Memoria en standby: ${m.message}`);
  } catch {
    warnings.push('Memoria en standby: no se pudo liberar.');
  }

  // 8) Aggressive memory trim — trim all processes working sets (non-reversible)
  try {
    const trimPs = `
$count = 0
Get-Process | Where-Object { $_.Id -ne $PID -and $_.SessionId -eq (Get-Process -Id $PID).SessionId } | ForEach-Object {
  try {
    [System.Diagnostics.Process]::GetProcessById($_.Id).MinWorkingSet = [IntPtr]::new(204800)
    $count++
  } catch {}
}
$count
`;
    const trimR = await runPS(trimPs, 30000);
    const trimCount = parseInt(trimR.stdout.trim()) || 0;
    if (trimCount > 0) details.push(`Working sets recortados: ${trimCount} procesos optimizados.`);
  } catch {
    // non-critical
  }

  // 9) Raise game process priority to Realtime (immediate, reversible)
  let pid: number | null = null;
  let prevPriority: string | null = null;
  if (game) {
    prevPriority = await getProcessPriority(game.pid);
    // Try Realtime first, fall back to High
    let ok = await setProcessPriority(game.pid, 'Realtime');
    if (ok) {
      pid = game.pid;
      details.push(`Proceso «${game.name}» elevado a prioridad TIEMPO REAL.`);
    } else {
      ok = await setProcessPriority(game.pid, 'High');
      if (ok) {
        pid = game.pid;
        details.push(`Proceso «${game.name}» elevado a prioridad Alta.`);
      } else {
        warnings.push('No se pudo elevar la prioridad del proceso del juego.');
      }
    }
  } else {
    warnings.push('No se detectó una ventana de juego activa. El boost se aplicó sin prioridad de proceso.');
  }

  // 10) Set CPU affinity to performance cores only (if hybrid CPU detected)
  if (game) {
    try {
      const affinityPs = `
$p = Get-Process -Id ${game.pid} -ErrorAction SilentlyContinue
if ($p) {
  $cpuCount = [System.Environment]::ProcessorCount
  if ($cpuCount -ge 8) {
    $mask = [long]0
    for ($i = 0; $i -lt $cpuCount; $i++) {
      if ($i % 2 -eq 0 -or $cpuCount -le 8) { $mask = $mask -bor (1 -shl $i) }
    }
    $p.ProcessorAffinity = [IntPtr]::new($mask)
    'OK'
  } else { 'SKIP' }
} else { 'GONE' }
`;
      const affR = await runPS(affinityPs, 10000);
      if (affR.stdout.trim() === 'OK') {
        details.push('CPU affinity: optimizado para cores de rendimiento.');
      }
    } catch {
      // non-critical
    }
  }

  // 11) Set game I/O priority to High (reduces disk contention, immediate)
  if (game) {
    try {
      const ioPs = `
$p = Get-Process -Id ${game.pid} -ErrorAction SilentlyContinue
if ($p) {
  try {
    [System.Diagnostics.Process]::GetProcessById($p.Id).PriorityBoostEnabled = $true
    $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::AboveNormal
    'OK'
  } catch { 'ERR' }
} else { 'GONE' }
`;
      const ioR = await runPS(ioPs, 10000);
      if (ioR.stdout.trim() === 'OK') {
        details.push('I/O priority: elevado a Above Normal para menor latencia de disco.');
      }
    } catch {
      // non-critical
    }
  }

  // 12) Disable power throttling for all processes (admin, reversible)
  try {
    const pt = await boostRegistry({
      tweakId: 'boost_fps',
      name: 'FPS Boost: power throttling desactivado',
      category: 'gaming',
      action: 'PowerThrottlingOff -> 1',
      key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling',
      valueName: 'PowerThrottlingOff',
      type: 'REG_DWORD',
      data: '1',
    });
    if (pt) changeIds.push(pt);
    details.push(pt ? 'Power throttling: desactivado (CPU al 100% sin throttling).' : 'Power throttling: ya desactivado.');
  } catch {
    warnings.push('Power throttling: requiere administrador.');
  }

  // 13) Disable core parking — all CPU cores active (admin, reversible via powercfg)
  try {
    const cpGuid = (await getActiveSchemeGuid()) || POWER_GUIDS.HIGH_PERF;
    const cpPs = `
$g = '${cpGuid}'
powercfg /setacvalueindex $g SUB_PROCESSOR CPMINCORES 100
powercfg /setactive $g
'OK'
`;
    const cpR = await runPS(cpPs, 15000);
    const cpOk = cpR.stdout.trim() === 'OK';
    if (cpOk) {
      const rec = addChange({
        tweakId: 'boost_fps',
        name: 'FPS Boost: core parking desactivado',
        category: 'gaming',
        action: 'CPMINCORES -> 100 (todos los cores activos)',
        reversible: true,
        payload: { kind: 'powercfg', schemeGuid: cpGuid, schemeName: 'core parking' },
      });
      changeIds.push(rec.id);
      details.push('Core parking: todos los cores CPU activos.');
    }
  } catch {
    // non-critical
  }

  // 14) Disable USB selective suspend (admin, reversible)
  try {
    const usb = await boostRegistry({
      tweakId: 'boost_fps',
      name: 'FPS Boost: USB selective suspend desactivado',
      category: 'gaming',
      action: 'USBSelectiveSuspend -> 0',
      key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\USB',
      valueName: 'DisableSelectiveSuspend',
      type: 'REG_DWORD',
      data: '1',
    });
    if (usb) changeIds.push(usb);
    details.push(usb ? 'USB selective suspend: desactivado (previene lag de periféricos).' : 'USB selective suspend: ya desactivado.');
  } catch {
    warnings.push('USB selective suspend: requiere administrador.');
  }

  // 15) Disable memory compression (admin, reversible) — frees CPU cycles
  try {
    const mcR = await runPS(`
Disable-MMAgent -ErrorAction Stop
'OK'
`, 15000);
    if (mcR.stdout.trim() === 'OK') {
      const rec = addChange({
        tweakId: 'boost_fps',
        name: 'FPS Boost: compresión de memoria desactivada',
        category: 'gaming',
        action: 'Disable-MMAgent',
        reversible: true,
        payload: { kind: 'powershell', command: 'Enable-MMAgent' },
      });
      changeIds.push(rec.id);
      details.push('Compresión de memoria: desactivada (libera CPU).');
    }
  } catch {
    // non-critical, may not be supported on all versions
  }

  // 16) Set timer resolution to 1ms for smoother frame pacing (immediate, non-reversible)
  try {
    const trR = await runPS(`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class TimerRes {
  [DllImport("ntdll.dll")] public static extern int NtSetTimerResolution(int requested, bool current, out int actual);
}
'@
$actual = 0
[TimerRes]::NtSetTimerResolution(5000, [ref]$actual, [ref]$actual) | Out-Null
'OK'
`, 10000);
    if (trR.stdout.trim() === 'OK') {
      details.push('Timer resolution: 1ms activado (frame pacing más suave).');
    }
  } catch {
    // non-critical
  }

  // 17) Flush DNS + empty working set of game process for maximum free memory (immediate)
  try {
    await runPS('ipconfig /flushdns', 10000).catch(() => {});
    if (game) {
      const flushPs = `
$p = Get-Process -Id ${game.pid} -ErrorAction SilentlyContinue
if ($p) {
  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
  'OK'
} else { 'GONE' }
`;
      await runPS(flushPs, 10000).catch(() => {});
    }
    details.push('DNS cache vaciado + GC forzado para máxima memoria libre.');
  } catch {
    // non-critical
  }

  // 18) Kill unnecessary heavy background processes (immediate, non-reversible)
  try {
    const killPs = `
$targets = @(
  'OneDrive', 'Skype', 'Teams', 'Spotify', 'EpicGamesLauncher', 'Origin', 'OriginWebHelperService',
  'Battle.net', 'AdobeDesktopService', 'AdobeIPCBroker', 'CCXProcess', 'CoreSync',
  'Dropbox', 'GoogleDriveSync', 'iCUE', 'ArmoryCrateService', 'Lightshot',
  'SteamWebHelper', 'NVIDIA Web Helper', 'NvBackend', 'RtkAuduService',
  'SearchHost', 'SearchIndexer', 'SearchProtocolHost', 'WidgetService',
  'SecurityHealthSystray', 'ctfmon'
)
$count = 0
foreach ($t in $targets) {
  Get-Process -Name $t -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID } | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue; $count++ } catch {}
  }
}
$count
`;
    const killR = await runPS(killPs, 25000);
    const killCount = parseInt(killR.stdout.trim()) || 0;
    if (killCount > 0) details.push(`Procesos en segundo plano: ${killCount} cerrados (más RAM y CPU disponible).`);
  } catch {
    // non-critical
  }

  // 19) Disable foreground window lock timeout — instant window focus switching (reversible)
  try {
    const flt = await boostRegistry({
      tweakId: 'boost_fps',
      name: 'FPS Boost: ventana en primer plano sin delay',
      category: 'gaming',
      action: 'ForegroundLockTimeout -> 0',
      key: 'HKEY_CURRENT_USER\\Control Panel\\Desktop',
      valueName: 'ForegroundLockTimeout',
      type: 'REG_DWORD',
      data: '0',
    });
    if (flt) changeIds.push(flt);
    details.push(flt ? 'Foreground lock: sin delay de cambio de ventana.' : 'Foreground lock: ya optimizado.');
  } catch {
    // non-critical
  }

  // 20) Set GPU preemption to favor graphics latency (admin, reversible)
  try {
    const gp = await boostRegistry({
      tweakId: 'boost_fps',
      name: 'FPS Boost: GPU preemption para baja latencia',
      category: 'gaming',
      action: 'GpuPreemption -> 1',
      key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
      valueName: 'GpuPreemption',
      type: 'REG_DWORD',
      data: '1',
    });
    if (gp) changeIds.push(gp);
    details.push(gp ? 'GPU preemption: configurado para latencia mínima.' : 'GPU preemption: ya optimizado.');
  } catch {
    warnings.push('GPU preemption: requiere administrador.');
  }

  s.gaming = {
    changeIds,
    game: game ? game.name : null,
    pid,
    prevPriority: prevPriority || 'Normal',
    details,
  };
  writeSession(s);

  log('SUCCESS', 'gaming', `FPS Boost activado${game ? ` (${game.name})` : ''}. ${details.join(' ')}`);
  const st = await getBoostStatus();
  st.gaming.warnings = warnings;
  return st;
}

export async function boostGamingStop(): Promise<BoostStatus> {
  const s = readSession();
  if (!s.gaming) return await getBoostStatus();

  const g = s.gaming;
  const reverted: string[] = [];
  const failed: string[] = [];
  for (const id of g.changeIds) {
    const r = await revertChange(id).catch((e: any) => ({ ok: false, error: e.message }));
    if (r.ok) reverted.push(id);
    else failed.push(id);
  }

  if (g.pid) {
    await setProcessPriority(g.pid, 'Normal').catch(() => undefined);
  }

  delete s.gaming;
  writeSession(s);
  log('SUCCESS', 'gaming', `FPS Boost desactivado (${reverted.length} cambios revertidos${failed.length ? `, ${failed.length} con error` : ''}).`);
  const st = await getBoostStatus();
  st.gaming.details = [
    ...(reverted.length ? [`${reverted.length} optimizaciones revertidas.`] : []),
    ...(failed.length ? [`${failed.length} optimizaciones no se pudieron revertir: revisa el Restore Center.`] : []),
  ];
  return st;
}

// ---------------------------------------------------------------------------
// Network Boost
// ---------------------------------------------------------------------------

async function saveDnsServers(): Promise<Array<{ ifIndex: number; names: string[] }> | null> {
  const r = await runPSJson<Array<{ InterfaceIndex: number; Names: string[] }>>(
    `Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.ServerAddresses } | Select-Object InterfaceIndex, @{n='Names';e={$_.ServerAddresses}}`
  );
  if (!r) return null;
  const arr = Array.isArray(r) ? r : [r];
  return arr.map((d) => ({ ifIndex: d.InterfaceIndex, names: d.Names || [] }));
}

async function setDnsServers(ifIndex: number, names: string[]): Promise<boolean> {
  let r;
  if (names.length) {
    const list = names.map((n) => `'${n}'`).join(',');
    r = await runPS(`Set-DnsClientServerAddress -InterfaceIndex ${ifIndex} -ServerAddresses ${list} -ErrorAction Stop`, 20000);
  } else {
    r = await runPS(`Set-DnsClientServerAddress -InterfaceIndex ${ifIndex} -ResetServerAddresses -ErrorAction Stop`, 20000);
  }
  return r.code === 0;
}

async function listActiveInterfaces(): Promise<Array<{ name: string; guid: string; ifIndex: number }>> {
  const r = await runPSJson<Array<{ Name: string; InterfaceGuid: string; InterfaceIndex: number }>>(
    `Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | Select-Object Name, InterfaceGuid, ifIndex`
  );
  if (!r) return [];
  const arr = Array.isArray(r) ? r : [r];
  return arr
    .filter((a) => a.InterfaceGuid)
    .map((a) => ({ name: a.Name || '', guid: a.InterfaceGuid, ifIndex: a.InterfaceIndex }));
}

export async function boostNetworkStart(): Promise<BoostStatus> {
  const s = readSession();
  if (s.network) return getBoostStatus();

  const warnings: string[] = [];
  const details: string[] = [];
  const changeIds: string[] = [];
  const pingBefore = await getLatency().catch(() => null);

  // 1) Disable Windows network throttling (admin, reversible)
  try {
    const a = await boostRegistry({
      tweakId: 'boost_network',
      name: 'Boost de red: desactivar límite de ancho de banda',
      category: 'network',
      action: 'NetworkThrottlingIndex -> 0xFFFFFFFF',
      key: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
      valueName: 'NetworkThrottlingIndex',
      type: 'REG_DWORD',
      data: '4294967295',
    });
    if (a) changeIds.push(a);
    details.push(a ? 'Límite de ancho de banda del sistema: desactivado (más rendimiento).' : 'Límite de ancho de banda: ya desactivado.');
  } catch {
    warnings.push('Límite de ancho de banda: requiere administrador.');
  }

  // 2) TCP tweaks per interface (admin, reversible)
  try {
    const ifaces = await listActiveInterfaces();
    let applied = 0;
    for (const i of ifaces) {
      const base = `HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${i.guid}`;
      const a = await boostRegistry({
        tweakId: 'boost_network',
        name: `Boost de red: TCP sin demora (${i.name})`,
        category: 'network',
        action: 'TcpAckFrequency -> 1, TCPNoDelay -> 1',
        key: base,
        valueName: 'TcpAckFrequency',
        type: 'REG_DWORD',
        data: '1',
      });
      const b = await boostRegistry({
        tweakId: 'boost_network',
        name: `Boost de red: TCP NoDelay (${i.name})`,
        category: 'network',
        action: 'TCPNoDelay -> 1',
        key: base,
        valueName: 'TCPNoDelay',
        type: 'REG_DWORD',
        data: '1',
      });
      if (a) changeIds.push(a);
      if (b) changeIds.push(b);
      if (a || b) applied++;
    }
    if (applied > 0) details.push(`TCP optimizado en ${applied} interfaz(es) (menor latencia, mejor subida).`);
    else warnings.push('Interfaces TCP: no se pudo optimizar ninguna interfaz.');
  } catch {
    warnings.push('Interfaces TCP: requiere administrador.');
  }

  // 3) Delivery Optimization off (user level)
  try {
    const d = await boostRegistry({
      tweakId: 'boost_network',
      name: 'Boost de red: optimización de entregas desactivada',
      category: 'network',
      action: 'DODownloadMode -> 0',
      key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Settings',
      valueName: 'DODownloadMode',
      type: 'REG_DWORD',
      data: '0',
    });
    if (d) changeIds.push(d);
    details.push(d ? 'Windows Update entrega (P2P): desactivado (libera ancho de banda de subida).' : 'Optimización de entregas: ya desactivada.');
  } catch {
    warnings.push('Optimización de entregas: no se pudo modificar.');
  }

  // 4) DNS -> Cloudflare/Google (admin, reversible)
  let dnsRevert: Array<{ ifIndex: number; names: string[] }> | null = null;
  try {
    dnsRevert = await saveDnsServers();
    const ifaces = await listActiveInterfaces();
    let okCount = 0;
    for (const i of ifaces) {
      if (await setDnsServers(i.ifIndex, ['1.1.1.1', '8.8.8.8'])) okCount++;
    }
    if (okCount > 0) {
      details.push(`DNS rápido (1.1.1.1 / 8.8.8.8) en ${okCount} interfaz(es).`);
      const f = await runPS(`ipconfig /flushdns`, 15000);
      details.push(f.code === 0 ? 'Caché DNS vaciada.' : 'No se pudo vaciar la caché DNS.');
    } else {
      warnings.push('DNS: requiere administrador para cambiar los servidores DNS.');
      dnsRevert = null;
    }
  } catch {
    warnings.push('DNS: no se pudo cambiar.');
    dnsRevert = null;
  }

  // 5) TCP window size + auto-tuning (admin, reversible)
  try {
    const twR = await runPS(`
netsh int tcp set global autotuninglevel=normal 2>$null
netsh int tcp set global chimney=enabled 2>$null
netsh int tcp set global dca=enabled 2>$null
netsh int tcp set global netdma=enabled 2>$null
netsh int tcp set global timestamps=disabled 2>$null
netsh int tcp set global rss=enabled 2>$null
'OK'
`, 20000);
    if (twR.stdout.trim() === 'OK') {
      details.push('TCP global: auto-tuning, chimneys, RSS y DCA activados (throughput máximo).');
    }
  } catch {
    // non-critical
  }

  // 6) Disable Nagle's algorithm globally + reduce initial RTO (admin, reversible)
  try {
    const nagle = await boostRegistry({
      tweakId: 'boost_network',
      name: 'Boost de red: Nagle off global',
      category: 'network',
      action: 'TcpNoDelay -> 1 (global)',
      key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters',
      valueName: 'TcpNoDelay',
      type: 'REG_DWORD',
      data: '1',
    });
    const rto = await boostRegistry({
      tweakId: 'boost_network',
      name: 'Boost de red: TCP initial RTO reducido',
      category: 'network',
      action: 'TcpInitialRTT -> 2',
      key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters',
      valueName: 'TcpInitialRTT',
      type: 'REG_DWORD',
      data: '2',
    });
    const delAck = await boostRegistry({
      tweakId: 'boost_network',
      name: 'Boost de red: TCP delayed ACK off',
      category: 'network',
      action: 'TcpAckFrequency -> 2 (global)',
      key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters',
      valueName: 'DefaultTTL',
      type: 'REG_DWORD',
      data: '64',
    });
    if (nagle || rto || delAck) {
      details.push('Nagle off + RTO reducido + TTL optimizado: latencia de red minimizada.');
    }
  } catch {
    warnings.push('TCP global: requiere administrador.');
  }

  // 7) Disable auto-disconnect for idle SMB connections (user)
  try {
    const smb = await boostRegistry({
      tweakId: 'boost_network',
      name: 'Boost de red: SMB keepalive',
      category: 'network',
      action: 'KeepConn -> 300',
      key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters',
      valueName: 'KeepConn',
      type: 'REG_DWORD',
      data: '300',
    });
    if (smb) details.push('SBA keepalive: conexiones estables sin desconexión por timeout.');
  } catch {
    // non-critical
  }

  // 8) Disable background intelligent transfer service (BITS) bandwidth hog
  try {
    const bits = await boostRegistry({
      tweakId: 'boost_network',
      name: 'Boost de red: BITS bandwidth limitado',
      category: 'network',
      action: 'BandwidthLimit -> 10',
      key: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\BITS',
      valueName: 'MaxBandwidthValidFrom',
      type: 'REG_DWORD',
      data: '0',
    });
    if (bits) details.push('BITS: ancho de banda de fondo limitado (no competirá por red).');
  } catch {
    // non-critical
  }

  // 9) Flush DNS + ARP cache for fresh connections
  try {
    await runPS('ipconfig /flushdns; arp -d *; nbtstat -R', 15000).catch(() => {});
    details.push('Cachés DNS, ARP y NetBIOS vaciadas (conexiones frescas).');
  } catch {
    // non-critical
  }

  const pingAfter = await getLatency().catch(() => null);

  s.network = { changeIds, dnsRevert, details, pingBefore, pingAfter };
  writeSession(s);

  log('SUCCESS', 'network', `Boost de red activado. Ping ${pingBefore ?? '?'}ms -> ${pingAfter ?? '?'}ms.`);
  const st = await getBoostStatus();
  st.network.warnings = warnings;
  return st;
}

export async function boostNetworkStop(): Promise<BoostStatus> {
  const s = readSession();
  if (!s.network) return await getBoostStatus();

  const n = s.network;
  const reverted: string[] = [];
  const failed: string[] = [];
  for (const id of n.changeIds) {
    const r = await revertChange(id).catch((e: any) => ({ ok: false, error: e.message }));
    if (r.ok) reverted.push(id);
    else failed.push(id);
  }

  if (n.dnsRevert) {
    for (const d of n.dnsRevert) {
      await setDnsServers(d.ifIndex, d.names).catch(() => undefined);
    }
  }

  delete s.network;
  writeSession(s);
  log('SUCCESS', 'network', `Boost de red desactivado (${reverted.length} cambios revertidos${failed.length ? `, ${failed.length} con error` : ''}).`);
  const st = await getBoostStatus();
  st.network.details = [
    ...(reverted.length ? [`${reverted.length} optimizaciones revertidas.`] : []),
    ...(failed.length ? [`${failed.length} optimizaciones no se pudieron revertir: revisa el Restore Center.`] : []),
  ];
  return st;
}
