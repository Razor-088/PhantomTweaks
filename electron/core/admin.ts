import { runPS } from './ps';
import { app } from 'electron';

let adminCheckCache: { result: boolean; ts: number } | null = null;
const ADMIN_CHECK_TTL = 30_000;

export async function isAdmin(): Promise<boolean> {
  if (adminCheckCache && Date.now() - adminCheckCache.ts < ADMIN_CHECK_TTL) {
    return adminCheckCache.result;
  }
  const r = await runPS(
    `$id = [Security.Principal.WindowsIdentity]::GetCurrent(); $p = New-Object Security.Principal.WindowsPrincipal($id); if ($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 'admin' } else { 'user' }`,
    10000
  );
  const result = r.stdout.trim() === 'admin';
  adminCheckCache = { result, ts: Date.now() };
  return result;
}

export async function relaunchAsAdmin(): Promise<{ ok: boolean; error?: string }> {
  try {
    const exe = process.execPath;
    const args = process.argv.slice(1);
    const argList = args.length > 0
      ? ` @(${args.map(a => `'${a.replace(/'/g, "''")}'`).join(', ')})`
      : '';
    const ps = `Start-Process -FilePath '${exe.replace(/'/g, "''")}' -ArgumentList${argList} -Verb RunAs -Wait:$false`;
    const r = await runPS(ps, 15000);
    if (r.code === 0) {
      setTimeout(() => app.quit(), 2000);
      return { ok: true };
    }
    const err = r.stderr.trim();
    if (err.includes('cancelled') || err.includes('cancelado')) {
      return { ok: false, error: 'El usuario canceló la elevación de privilegios.' };
    }
    return { ok: false, error: err || 'No se pudo iniciar como administrador.' };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
