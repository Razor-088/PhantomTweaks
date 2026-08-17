import { runPS } from '../core/ps';

export async function getActiveSchemeGuid(): Promise<string | null> {
  const r = await runPS('powercfg /getactivescheme', 15000);
  const m = r.stdout.match(/\(([0-9a-fA-F-]{36})\)/);
  return m ? m[1].toLowerCase() : null;
}

export async function getActiveSchemeName(guid: string): Promise<string> {
  const r = await runPS(`powercfg /query ${guid}`, 15000);
  const m = r.stdout.match(/Scheme GUID: .*?\((.*?)\)/s);
  if (m) return m[1].trim();
  const m2 = r.stdout.match(/Nombre del plan de energía: (.*)/);
  return m2 ? m2[1].trim() : guid;
}

export async function getActiveScheme(): Promise<{ guid: string; name: string } | null> {
  const guid = await getActiveSchemeGuid();
  if (!guid) return null;
  const name = await getActiveSchemeName(guid);
  return { guid, name };
}

export async function setPowerPlan(targetGuid: string): Promise<{ ok: boolean; message: string }> {
  const r = await runPS(`powercfg -setactive ${targetGuid}`, 20000);
  return { ok: r.code === 0, message: r.stderr || 'Plan de energía actualizado.' };
}
