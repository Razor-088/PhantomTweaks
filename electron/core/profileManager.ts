import * as fs from 'fs';
import { dataFile, ensureFile } from './paths';
import { runPS } from './ps';
import { log } from './logging';

export interface GameProfile {
  id: string;
  name: string;
  game: string;
  powerPlan: string;
  priority: 'normal' | 'high' | 'realtime';
  memoryClean: boolean;
  tweaks: string[];
  autoApply: boolean;
  createdAt: string;
}

let profilesCache: GameProfile[] | null = null;

function readProfiles(): GameProfile[] {
  if (profilesCache) return profilesCache;
  try {
    profilesCache = JSON.parse(fs.readFileSync(dataFile('profiles.json'), 'utf-8')) as GameProfile[];
  } catch {
    profilesCache = [];
  }
  return profilesCache!;
}

let writeTimer: NodeJS.Timeout | null = null;

function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      fs.writeFileSync(ensureFile('profiles.json'), JSON.stringify(profilesCache, null, 2), 'utf-8');
    } catch { /* ignore */ }
  }, 300);
}

export function listProfiles(): GameProfile[] {
  return readProfiles();
}

export function getProfile(id: string): GameProfile | undefined {
  return readProfiles().find((p) => p.id === id);
}

export function saveProfile(p: GameProfile): GameProfile {
  const list = readProfiles();
  const idx = list.findIndex((x) => x.id === p.id);
  if (idx >= 0) {
    list[idx] = p;
  } else {
    list.push(p);
  }
  profilesCache = list;
  scheduleWrite();
  log('SYSTEM', 'profiles', `Perfil guardado: ${p.name}`);
  return p;
}

export function deleteProfile(id: string): { ok: boolean } {
  const list = readProfiles().filter((p) => p.id !== id);
  profilesCache = list;
  scheduleWrite();
  log('SYSTEM', 'profiles', `Perfil eliminado: ${id}`);
  return { ok: true };
}

const PRIORITY_MAP = { normal: 'Normal', high: 'High', realtime: 'Realtime' } as const;

export async function applyProfile(id: string): Promise<{ ok: boolean; applied: string[]; errors: string[] }> {
  const profile = getProfile(id);
  if (!profile) return { ok: false, applied: [], errors: ['Perfil no encontrado'] };

  const applied: string[] = [];
  const errors: string[] = [];

  // Power plan
  try {
    const GUID = profile.powerPlan.includes('8c5e7fda') ? '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c' :
                 profile.powerPlan.includes('e9a42b02') ? 'e9a42b02-d5df-448d-aa00-03f14749eb61' :
                 '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
    await runPS(`powercfg /setactive ${GUID}`, 10000);
    applied.push('Plan de energía');
  } catch (e: any) { errors.push(`Power plan: ${e.message}`); }

  // Process priority for the game
  if (profile.game) {
    try {
      const r = await runPS(`
        $proc = Get-Process -Name '${profile.game.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($proc) {
          $proc.PriorityClass = '${PRIORITY_MAP[profile.priority]}'
          'ok'
        } else { 'not_found' }
      `, 10000);
      if (r.stdout.trim() === 'ok') applied.push(`Prioridad: ${profile.priority}`);
    } catch { errors.push('No se pudo establecer prioridad'); }
  }

  // Memory clean
  if (profile.memoryClean) {
    try {
      await runPS(`
        $proc = Get-Process | Where-Object { $_.WorkingSet64 -gt 100MB } | Sort-Object WorkingSet64 -Descending | Select-Object -First 5
        foreach ($p in $proc) { [System.GC]::Collect($p.Id, 2, $true) }
        EmptyStandbyList 2>$null
      `, 15000);
      applied.push('Limpieza de memoria');
    } catch { errors.push('Limpieza de memoria falló'); }
  }

  log('SUCCESS', 'profiles', `Perfil ${profile.name} aplicado: ${applied.join(', ')}`);
  return { ok: errors.length === 0, applied, errors };
}

export async function restoreProfile(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    await runPS('powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e', 10000);
    log('SUCCESS', 'profiles', `Perfil ${id} restaurado: plan de energía en equilibrado`);
    return { ok: true, message: 'Plan de energía restaurado a Equilibrado' };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
}

export async function detectRunningGames(): Promise<string[]> {
  const r = await runPS(`
    $games = @('valorant','fortnite','cs2','csgo','dota2','apex','warzone','pubg','overwatch','minecraft','rocketleague','gta5','cyberpunk','eldenring','starfield','palworld')
    $running = Get-Process | Where-Object {
      $name = $_.ProcessName.ToLower()
      $games -contains $name -or $name -like '*game*' -or $name -like '*launcher*'
    } | Select-Object -ExpandProperty ProcessName -Unique
    if ($running) { $running -join ',' } else { 'none' }
  `, 10000);
  const result = r.stdout.trim();
  if (result === 'none') return [];
  return result.split(',').map((s) => s.trim()).filter(Boolean);
}
