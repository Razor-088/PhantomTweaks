import { runPS } from './ps';
import { log } from './logging';

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

export const PROTECTED_PROCESSES = new Set([
  'system',
  'system idle process',
  'registry',
  'memory compression',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'winlogon.exe',
  'services.exe',
  'lsass.exe',
  'lsm.exe',
  'svchost.exe',
  'dwm.exe',
  'explorer.exe',
  'win32kfull.sys',
  'fontdrvhost.exe',
  'winlogon',
  'logonui.exe',
  'audiodg.exe',
  'searchindexer.exe',
  'spoolsv.exe',
  'ctfmon.exe',
  'securityhealthservice.exe',
  'sihost.exe',
  'taskhostw.exe',
  'runtimebroker.exe',
  'dllhost.exe',
  'conhost.exe',
  'wininit',
]);

const GET_PROCESS_SCRIPT = `Get-Process | Select-Object Id,ProcessName,WorkingSet64,TotalProcessorTime,Path,SessionId | ConvertTo-Json -Depth 4 -Compress`;

interface PsSample {
  pid: number;
  name: string;
  totalMs: number;
  memMb: number;
  path: string | null;
  sessionId: number;
}

let previousSample: PsSample[] | null = null;
let lastFetch = 0;
const CACHE_TTL = 2500;

async function sampleProcesses(): Promise<PsSample[]> {
  const r = await runPS(GET_PROCESS_SCRIPT, 12000);
  if (!r.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(r.stdout.trim());
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((p: any) => ({
      pid: Number(p.pid) || 0,
      name: (p.name || 'unknown') + (Number(p.pid) ? '' : ''),
      totalMs: parseTotalProcessorTime(p.TotalProcessorTime),
      memMb: Number(p.WorkingSet64) ? Math.round(Number(p.WorkingSet64) / 1048576) : 0,
      path: p.Path || null,
      sessionId: Number(p.SessionId) ?? 0,
    }));
  } catch {
    return [];
  }
}

function parseTotalProcessorTime(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const m = val.match(/(\d+):(\d+):(\d+)\.(\d+)/);
    if (m) return ((+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 + Math.floor(+m[4] / 10000));
    const ticks = Number(val);
    return isNaN(ticks) ? 0 : ticks / 10000;
  }
  if (typeof val === 'object' && val.Ticks != null) return Number(val.Ticks) / 10000;
  return 0;
}

export async function listProcesses(): Promise<ProcessRow[]> {
  const now = Date.now();
  if (previousSample && now - lastFetch < CACHE_TTL) {
    return previousSample.map((p) => ({
      pid: p.pid,
      name: p.name,
      cpuPct: 0,
      memMb: p.memMb,
      workingSetMb: p.memMb,
      path: p.path,
      sessionId: p.sessionId,
      protected: isProtected(p.pid, p.name),
    }));
  }

  const current = await sampleProcesses();
  const cores = require('os').cpus().length;

  const result: ProcessRow[] = current.map((p) => {
    let cpuPct = 0;
    if (previousSample) {
      const prev = previousSample.find((x) => x.pid === p.pid);
      if (prev) {
        const dt = p.totalMs - prev.totalMs;
        if (dt > 0) cpuPct = Math.round((dt * 100) / (CACHE_TTL * cores) * 10) / 10;
      }
    }
    return {
      pid: p.pid,
      name: p.name,
      cpuPct: Math.max(0, Math.min(100, cpuPct)),
      memMb: p.memMb,
      workingSetMb: p.memMb,
      path: p.path,
      sessionId: p.sessionId,
      protected: isProtected(p.pid, p.name),
    };
  });

  previousSample = current;
  lastFetch = now;
  return result;
}

export function isProtected(pid: number, name: string): boolean {
  if (pid <= 8) return true;
  const n = name.toLowerCase();
  if (PROTECTED_PROCESSES.has(n)) return true;
  if (n.startsWith('svchost')) return true;
  return false;
}

export async function getProcessInfo(pid: number) {
  const r = await runPS(
    `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object ProcessId,Name,ExecutablePath,CommandLine,CreationDate,WorkingSetSize | ConvertTo-Json -Depth 3 -Compress`,
    15000
  );
  if (!r.stdout.trim()) return null;
  try {
    return JSON.parse(r.stdout.trim());
  } catch {
    return null;
  }
}

export async function killProcess(pid: number): Promise<{ ok: boolean; error?: string; warning?: string }> {
  if (pid <= 8) return { ok: false, error: 'No se pueden finalizar procesos esenciales del sistema.' };

  const info = await getProcessInfo(pid);
  const name = info?.Name || `PID ${pid}`;

  if (isProtected(pid, name)) {
    return { ok: false, error: 'Este proceso está protegido por PhantomTweaks por ser crítico para el sistema.' };
  }

  const r = await runPS(`Stop-Process -Id ${pid} -Force -ErrorAction Stop; 'OK'`, 15000);
  if (r.stdout.trim() === 'OK') {
    log('SUCCESS', 'process', `Proceso finalizado: ${name} (PID ${pid})`);
    previousSample = null;
    return { ok: true };
  }
  log('WARN', 'process', `No se pudo finalizar ${name}: ${r.stderr}`);
  return { ok: false, error: r.stderr || 'No se pudo finalizar el proceso. Puede requerir permisos de administrador.' };
}
