import { runPS } from '../core/ps';

let cachedGuid: string | null = null;
let cachedGuidTime = 0;
const GUID_CACHE_TTL = 30_000;

export async function getActiveSchemeGuid(): Promise<string | null> {
  const now = Date.now();
  if (cachedGuid !== null && now - cachedGuidTime < GUID_CACHE_TTL) return cachedGuid;
  const r = await runPS('powercfg /getactivescheme', 15000);
  const m = r.stdout.match(/\(([0-9a-fA-F-]{36})\)/);
  cachedGuid = m ? m[1].toLowerCase() : null;
  cachedGuidTime = now;
  return cachedGuid;
}

export async function getActiveScheme(): Promise<{ guid: string; name: string } | null> {
  const guid = await getActiveSchemeGuid();
  if (!guid) return null;
  const r = await runPS(`powercfg /getactivescheme`, 15000);
  const nameMatch = r.stdout.match(/:\s+(.+?)\s*$/m);
  const name = nameMatch ? nameMatch[1].trim() : guid;
  return { guid, name };
}

export async function setPowerPlan(targetGuid: string): Promise<{ ok: boolean; message: string }> {
  const r = await runPS(`powercfg -setactive ${targetGuid}`, 20000);
  if (r.code === 0) { cachedGuid = targetGuid; cachedGuidTime = Date.now(); }
  return { ok: r.code === 0, message: r.stderr || 'Plan de energía actualizado.' };
}
