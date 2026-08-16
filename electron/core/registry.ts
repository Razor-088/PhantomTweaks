import { execFile } from 'child_process';

export interface RegValue {
  type: string;
  data: string;
  exists: boolean;
}

function run(exe: string, args: string[], timeoutMs = 10000): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve) => {
    execFile(exe, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve({ stdout: stdout || '', code: err ? ((err as any).code ?? 1) : 0 });
    });
  });
}

export async function regQuery(key: string, valueName: string): Promise<RegValue> {
  const { stdout, code } = await run('reg.exe', ['query', key, '/v', valueName]);
  if (code !== 0) return { type: '', data: '', exists: false };
  // reg output looks like:
  // HKEY_CURRENT_USER\... 
  //     VALUE    REG_DWORD    0x1
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^\s+(.*?)\s+(REG_[A-Z_]+)\s+(.*)$/);
    if (m) {
      return { type: m[2], data: m[3].trim(), exists: true };
    }
  }
  return { type: '', data: '', exists: false };
}

export async function regSet(key: string, valueName: string, type: string, data: string): Promise<void> {
  const args = ['add', key, '/v', valueName, '/t', type, '/d', data, '/f'];
  const r = await run('reg.exe', args);
  if (r.code !== 0) {
    throw new Error(`No se pudo escribir el registro en ${key}\\${valueName}. ${r.stdout}`);
  }
}

export async function regDelete(key: string, valueName: string): Promise<void> {
  const { code } = await run('reg.exe', ['delete', key, '/v', valueName, '/f']);
  if (code !== 0) {
    // value may not exist; ignore
  }
}

export async function regKeyExists(key: string): Promise<boolean> {
  const { code } = await run('reg.exe', ['query', key]);
  return code === 0;
}

/** DWORD helpers */
export async function setDword(key: string, value: string, data: number | string) {
  await regSet(key, value, 'REG_DWORD', String(data));
}

export async function getDword(key: string, value: string): Promise<number | null> {
  const v = await regQuery(key, value);
  if (!v.exists) return null;
  const m = v.data.match(/0x([0-9a-fA-F]+)/);
  if (m) return parseInt(m[1], 16);
  const n = Number(v.data);
  return isNaN(n) ? null : n;
}
