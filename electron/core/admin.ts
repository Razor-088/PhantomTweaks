import { runPS } from './ps';
import { app } from 'electron';

export async function isAdmin(): Promise<boolean> {
  const r = await runPS(
    `$id = [Security.Principal.WindowsIdentity]::GetCurrent(); $p = New-Object Security.Principal.WindowsPrincipal($id); if ($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 'admin' } else { 'user' }`,
    10000
  );
  return r.stdout.trim() === 'admin';
}

export async function relaunchAsAdmin(): Promise<{ ok: boolean; error?: string }> {
  try {
    const exe = process.execPath;
    const args = process.argv.slice(1);
    const ps = `Start-Process -FilePath '${exe.replace(/'/g, "''")}' -ArgumentList '${args.join("','").replace(/'/g, "''")}' -Verb RunAs`;
    const r = await runPS(ps, 10000);
    if (r.code === 0) {
      app.quit();
      return { ok: true };
    }
    return { ok: false, error: r.stderr || 'No se pudo iniciar como administrador.' };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
