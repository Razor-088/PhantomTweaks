import * as fs from 'fs';
import { ensureFile, dataFile } from './paths';
import { regSet, regDelete, regQuery } from './registry';
import { runPS } from './ps';
import { log } from './logging';

export type ChangeCategory = 'windows' | 'gaming' | 'privacy' | 'system' | 'cleanup' | 'network' | 'performance';

export interface RegistryPayload {
  kind: 'registry';
  key: string;
  valueName: string;
  type: string;
  /** data to restore (previous value). If null, the value should be deleted on revert. */
  revertData: string | null;
  revertType: string;
}

export interface PowercfgPayload {
  kind: 'powercfg';
  schemeGuid: string;
  schemeName: string;
}

export interface ChangeRecord {
  id: string;
  date: string;
  tweakId: string;
  name: string;
  category: ChangeCategory;
  action: string;
  reversible: boolean;
  reverted: boolean;
  payload: RegistryPayload | PowercfgPayload | null;
}

let cache: ChangeRecord[] | null = null;

function readChanges(): ChangeRecord[] {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(dataFile('changes.json'), 'utf-8');
    cache = JSON.parse(raw) as ChangeRecord[];
  } catch {
    cache = [];
  }
  return cache!;
}

let writeTimer: NodeJS.Timeout | null = null;

function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      fs.writeFileSync(ensureFile('changes.json'), JSON.stringify(cache, null, 2), 'utf-8');
    } catch {
      /* ignore */
    }
  }, 200);
}

export function addChange(rec: Omit<ChangeRecord, 'id' | 'date' | 'reverted'>): ChangeRecord {
  const full: ChangeRecord = {
    ...rec,
    id: `chg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    date: new Date().toLocaleString('es-ES'),
    reverted: false,
  };
  const list = readChanges();
  list.unshift(full);
  cache = list;
  scheduleWrite();
  log('SYSTEM', 'restore', `Cambio registrado: ${rec.name}`);
  return full;
}

export function getHistory(): ChangeRecord[] {
  return readChanges();
}

export function isReverted(id: string): boolean {
  const c = readChanges().find((x) => x.id === id);
  return !!c?.reverted;
}

export async function revertChange(id: string): Promise<{ ok: boolean; error?: string }> {
  const c = readChanges().find((x) => x.id === id);
  if (!c) return { ok: false, error: 'Cambio no encontrado.' };
  if (c.reverted) return { ok: false, error: 'Este cambio ya fue revertido.' };
  if (!c.reversible || !c.payload) return { ok: false, error: 'Este cambio no es reversible.' };

  try {
    const p = c.payload;
    if (p.kind === 'registry') {
      if (p.revertData === null) {
        await regDelete(p.key, p.valueName);
      } else {
        await regSet(p.key, p.valueName, p.revertType || p.type, p.revertData);
      }
    } else if (p.kind === 'powercfg') {
      await runPS(`powercfg -setactive ${p.schemeGuid}`);
    }

    c.reverted = true;
    scheduleWrite();
    log('SUCCESS', 'restore', `Revertido: ${c.name}`);
    return { ok: true };
  } catch (e: any) {
    log('ERROR', 'restore', `Error al revertir ${c.name}: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

export async function createRestorePoint(description: string): Promise<{ ok: boolean; error?: string }> {
  const ps = `try { Checkpoint-Computer -Description '${description.replace(/'/g, "''")}' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop; 'OK' } catch { $_.Exception.Message }`;
  const r = await runPS(ps, 120000);
  const out = r.stdout.trim();
  if (out === 'OK') {
    log('SUCCESS', 'restore', `Punto de restauración creado: ${description}`);
    return { ok: true };
  }
  log('WARN', 'restore', `No se pudo crear punto de restauración: ${out}`);
  return { ok: false, error: out || 'No se pudo crear el punto de restauración.' };
}

export async function listRestorePoints(): Promise<Array<{ date: string; description: string }>> {
  const ps = `Get-ComputerRestorePoint | Sort-Object CreationTime -Descending | Select-Object -First 10 CreationTime, Description | ConvertTo-Json -Depth 3 -Compress`;
  const r = await runPS(ps, 20000);
  try {
    const parsed = JSON.parse(r.stdout.trim());
    if (!parsed) return [];
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((p: any) => ({
      date: p.CreationTime || '',
      description: p.Description || '',
    }));
  } catch {
    return [];
  }
}

export async function isSystemRestoreEnabled(): Promise<boolean> {
  const r = await runPS(
    `$e = Get-ComputerRestorePoint -ErrorAction SilentlyContinue; if ($e -or $?) { 'enabled' } else { 'disabled' }`,
    15000
  );
  return r.stdout.trim() === 'enabled';
}

/** Convenience: record a registry change and apply it (used by tweaks). */
export async function applyRegistryChange(
  tweakId: string,
  name: string,
  category: ChangeCategory,
  action: string,
  key: string,
  valueName: string,
  newType: string,
  newData: string,
  autoRestorePoint: boolean
): Promise<ChangeRecord> {
  if (autoRestorePoint) {
    // Restore point creation is heavy; skip unless explicitly triggered from UI.
  }
  const prev = await regQuery(key, valueName);
  await regSet(key, valueName, newType, newData);
  return addChange({
    tweakId,
    name,
    category,
    action,
    reversible: true,
    payload: {
      kind: 'registry',
      key,
      valueName,
      type: newType,
      revertData: prev.exists ? prev.data : null,
      revertType: prev.exists ? prev.type : newType,
    },
  });
}
