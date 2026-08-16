import { execFile, spawn } from 'child_process';

export interface PSResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

const POWERSHELL = process.env.SystemRoot
  ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  : 'powershell.exe';

function escapeArg(arg: string) {
  return `'${arg.replace(/'/g, "''")}'`;
}

export function runPS(script: string, timeoutMs = 30000): Promise<PSResult> {
  return new Promise((resolve) => {
    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ];
    execFile(
      POWERSHELL,
      args,
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          code: err ? ((err as any).code ?? 1) : 0,
        });
      }
    );
  });
}

/** Runs a PowerShell command that is expected to produce JSON on stdout. */
export async function runPSJson<T>(script: string, timeoutMs = 30000): Promise<T | null> {
  const r = await runPS(`${script} | ConvertTo-Json -Depth 6 -Compress`, timeoutMs);
  const out = r.stdout.trim();
  if (!out) return null;
  try {
    return JSON.parse(out) as T;
  } catch {
    return null;
  }
}

export function spawnPS(script: string): { child: ReturnType<typeof spawn>; kill: () => void } {
  const child = spawn(
    POWERSHELL,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true }
  );
  return { child, kill: () => child.kill() };
}

export function quotePsPath(p: string) {
  return escapeArg(p);
}

export { escapeArg };
