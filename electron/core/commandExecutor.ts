import { spawnPS } from './ps';
import { log } from './logging';

export type CommandClass = 'SAFE' | 'ADMIN' | 'ADVANCED';

const BLOCKED_PATTERNS: RegExp[] = [
  /\bformat\s+[a-z]:/i,
  /\b(?:rd|rmdir|rm)\s+\/(?:s|q)\s+[\\\/]/i,
  /\bdel\s+\/(?:f|q|s)\s+[\\\/]/i,
  /remove-item\s+-?recurse\s+[\\\/]/i,
  /Remove-Item\s+['"]HKLM:/i,
  /\breg\s+delete\s+HKLM/i,
  /\bshutdown\s+(\/s|\/r|\/f)/i,
  /\btaskkill\s+\/PID\s+\d+/i,
  /net\s+user\s+\w+\s+\*/i,
  /net\s+localgroup\s+Administrators/i,
  /sc\s+delete\s+\w+/i,
  /Format-Volume/i,
  /Clear-Disk/i,
  /Initialize-Disk/i,
  /Set-Disk\s+-IsOffline/i,
  /Invoke-Expression\s*\(/i,
  /start-process\s+-verb\s+runas/i,
];

const ADMIN_PATTERNS: RegExp[] = [
  /ipconfig\s*\/\s*(flushdns|release|renew)/i,
  /netsh\s+(winsock|int\s+ip\s+reset)/i,
  /powercfg\s+(\/change|\/setac)/i,
  /powercfg\s+\/setactive/i,
  /sc\s+config/i,
  /clear-recyclebin\s+-?drive\s+c/i,
];

export function classifyCommand(command: string): CommandClass {
  if (BLOCKED_PATTERNS.some((r) => r.test(command))) return 'ADVANCED';
  if (ADMIN_PATTERNS.some((r) => r.test(command))) return 'ADMIN';
  if (/^powercfg|^netsh|^sc\b|^wmic\b|^reg\b/i.test(command)) return 'ADMIN';
  return 'SAFE';
}

export function isBlocked(command: string): boolean {
  return BLOCKED_PATTERNS.some((r) => r.test(command));
}

export interface TerminalOutput {
  kind: 'out' | 'err' | 'info' | 'exit';
  text: string;
}
export type TerminalSink = (o: TerminalOutput) => void;

export async function runTerminalCommand(command: string, mode: 'SAFE' | 'ADMIN' | 'ADVANCED', sink: TerminalSink): Promise<void> {
  const cls = classifyCommand(command);
  if (cls === 'ADVANCED' && mode !== 'ADVANCED') {
    sink({ kind: 'err', text: `[Bloqueado] Este comando está clasificado como ${cls} y no se ejecutará.` });
    sink({ kind: 'exit', text: 'BLOCKED' });
    return;
  }
  if (cls === 'ADMIN' && mode !== 'ADMIN' && mode !== 'ADVANCED') {
    sink({ kind: 'err', text: `[Requiere modo ADMIN] Clasificado como ${cls}. Confirma el modo avanzado para continuar.` });
    sink({ kind: 'exit', text: 'BLOCKED' });
    return;
  }

  sink({ kind: 'info', text: `PS C:\\> ${command}\n` });
  const child = spawnPS(command);
  let killed = false;

  const timer = setTimeout(() => {
    killed = true;
    child.kill();
    sink({ kind: 'err', text: '\n[PhantomTweaks] Tiempo excedido, el comando fue cancelado.\n' });
    sink({ kind: 'exit', text: 'TIMEOUT' });
  }, 30000);

  child.child.stdout?.on('data', (d) => sink({ kind: 'out', text: d.toString() }));
  child.child.stderr?.on('data', (d) => sink({ kind: 'err', text: d.toString() }));
  child.child.on('close', (code) => {
    clearTimeout(timer);
    if (!killed) {
      sink({ kind: 'exit', text: String(code ?? 1) });
    }
  });
  child.child.on('error', () => {
    clearTimeout(timer);
    if (!killed) {
      killed = true;
      sink({ kind: 'err', text: 'No se pudo iniciar el comando.' });
      sink({ kind: 'exit', text: 'ERROR' });
    }
  });

  log('INFO', 'terminal', `Comando ejecutado (${cls}): ${command}`);
}

export function suggestCommand(s: string): string[] {
  const all = [
    'ping 8.8.8.8',
    'ping -n 4 google.com',
    'ipconfig',
    'ipconfig /all',
    'ipconfig /flushdns',
    'systeminfo',
    'netstat -ano',
    'netstat -anob',
    'tracert 8.8.8.8',
    'powercfg /energy',
    'powercfg /batteryreport',
    'whoami',
    'hostname',
    'tasklist',
    'wmic cpu get name',
    'Get-NetAdapter',
    'Get-NetIPConfiguration',
    'Get-CimInstance Win32_VideoController | Select Name',
    'fsutil fsinfo drives',
  ];
  if (!s) return all;
  return all.filter((c) => c.toLowerCase().includes(s.toLowerCase())).slice(0, 8);
}
