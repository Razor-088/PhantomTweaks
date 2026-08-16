import * as fs from 'fs';
import { ensureFile, dataFile } from './paths';
import { runPS, runPSJson } from './ps';
import { regQuery } from './registry';
import { addChange, revertChange, applyRegistryChange, ChangeCategory } from './restoreManager';
import { getLatency } from './networkTools';
import { log } from './logging';

const ULTRA_GUID = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
const HIGH_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';

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

function readSession(): Session {
  try {
    return JSON.parse(fs.readFileSync(dataFile('boost-session.json'), 'utf-8')) as Session;
  } catch {
    return {};
  }
}

let sessionWriteTimer: NodeJS.Timeout | null = null;
let pendingSession: Session | null = null;

function writeSession(s: Session) {
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
  };
}

export function getBoostStatus(): BoostStatus {
  const s = readSession();
  const st = emptyStatus();
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
  return st;
}

async function getActiveSchemeGuid(): Promise<string | null> {
  const r = await runPS(`powercfg /getactivescheme`, 15000);
  const m = r.stdout.match(/\(([0-9a-fA-F-]{36})\)/);
  return m ? m[1].toLowerCase() : null;
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

async function setPowerPlan(targetGuid: string): Promise<{ ok: boolean; message: string }> {
  const r = await runPS(`powercfg -setactive ${targetGuid}`, 20000);
  return { ok: r.code === 0, message: r.stderr || 'Plan de energía actualizado.' };
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
  if (s.gaming) return getBoostStatus();

  const game = await detectForegroundGame();
  const warnings: string[] = [];
  const details: string[] = [];
  const changeIds: string[] = [];

  // 1) Power plan -> Ultimate / High performance (reversible)
  try {
    const prev = await getActiveSchemeGuid();
    const target = prev === HIGH_GUID ? HIGH_GUID : ULTRA_GUID;
    const want = prev === HIGH_GUID ? HIGH_GUID : ULTRA_GUID;
    if (prev === want) {
      details.push('Plan de energía: ya estaba en rendimiento máximo.');
    } else {
      const ultra = await runPS(`powercfg -list | Select-String -Pattern '${ULTRA_GUID}'`, 15000);
      const guid = ultra.stdout.trim() ? ULTRA_GUID : HIGH_GUID;
      const res = await setPowerPlan(guid);
      if (res.ok) {
        const rec = addChange({
          tweakId: 'boost_fps',
          name: 'FPS Boost: plan de energía máxima',
          category: 'gaming',
          action: `Plan activo cambiado a rendimiento máximo (antes: ${prev || 'desconocido'})`,
          reversible: true,
          payload: { kind: 'powercfg', schemeGuid: prev || HIGH_GUID, schemeName: 'plan anterior' },
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

  // 4) Raise game process priority (immediate, visible)
  let pid: number | null = null;
  let prevPriority: string | null = null;
  if (game) {
    prevPriority = await getProcessPriority(game.pid);
    const ok = await setProcessPriority(game.pid, 'High');
    if (ok) {
      pid = game.pid;
      details.push(`Proceso del juego «${game.name}» elevado a prioridad Alta.`);
    } else {
      warnings.push('No se pudo elevar la prioridad del proceso del juego.');
    }
  } else {
    warnings.push('No se detectó una ventana de juego activa. El boost se aplicó sin prioridad de proceso.');
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
  const st = getBoostStatus();
  st.gaming.warnings = warnings;
  return st;
}

export async function boostGamingStop(): Promise<BoostStatus> {
  const s = readSession();
  if (!s.gaming) return getBoostStatus();

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
  const st = getBoostStatus();
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

  const pingAfter = await getLatency().catch(() => null);

  s.network = { changeIds, dnsRevert, details, pingBefore, pingAfter };
  writeSession(s);

  log('SUCCESS', 'network', `Boost de red activado. Ping ${pingBefore ?? '?'}ms -> ${pingAfter ?? '?'}ms.`);
  const st = getBoostStatus();
  st.network.warnings = warnings;
  return st;
}

export async function boostNetworkStop(): Promise<BoostStatus> {
  const s = readSession();
  if (!s.network) return getBoostStatus();

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
  const st = getBoostStatus();
  st.network.details = [
    ...(reverted.length ? [`${reverted.length} optimizaciones revertidas.`] : []),
    ...(failed.length ? [`${failed.length} optimizaciones no se pudieron revertir: revisa el Restore Center.`] : []),
  ];
  return st;
}
