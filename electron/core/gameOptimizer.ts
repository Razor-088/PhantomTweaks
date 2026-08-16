import * as fs from 'fs';
import * as path from 'path';
import { runPS, runPSJson } from './ps';
import { dataFile, ensureFile } from './paths';
import { log } from './logging';
import { optimizeMemory, emptyStandbyList } from './windowsTweaks';

export interface DetectedGame {
  id: string;
  name: string;
  exe: string | null;
  platform: 'steam' | 'epic' | 'riot' | 'xbox' | 'gog' | 'other';
  installPath: string | null;
  running: boolean;
  pid: number | null;
}

export interface GameOptimization {
  id: string;
  gameId: string;
  name: string;
  applyPowerPlan: boolean;
  memoryClean: boolean;
  priority: 'normal' | 'high' | 'realtime';
  gameDvrOff: boolean;
  fullscreenOptOff: boolean;
  gameModeOn: boolean;
  networkOptimize: boolean;
  cpuCoreAffinity: number | null;
  autoApply: boolean;
  createdAt: string;
}

const KNOWN_GAMES: Array<{ name: string; exe: string; platform: DetectedGame['platform'] }> = [
  { name: 'VALORANT', exe: 'valorant.exe', platform: 'riot' },
  { name: 'League of Legends', exe: 'league of legends.exe', platform: 'riot' },
  { name: 'League of Legends', exe: 'leagueclient.exe', platform: 'riot' },
  { name: 'Fortnite', exe: 'fortniteclient-win64-shipping.exe', platform: 'epic' },
  { name: 'Fortnite', exe: 'fortnitelauncher.exe', platform: 'epic' },
  { name: 'Counter-Strike 2', exe: 'cs2.exe', platform: 'steam' },
  { name: 'Counter-Strike 2', exe: 'cs2_win64.exe', platform: 'steam' },
  { name: 'Dota 2', exe: 'dota2.exe', platform: 'steam' },
  { name: 'Apex Legends', exe: 'r5apex.exe', platform: 'steam' },
  { name: 'Apex Legends', exe: 'apex legends.exe', platform: 'other' },
  { name: 'Call of Duty: Modern Warfare', exe: 'modernwarfare.exe', platform: 'other' },
  { name: 'Call of Duty: Warzone', exe: 'modernwarfare.exe', platform: 'other' },
  { name: 'PUBG: BATTLEGROUNDS', exe: 'tslgame.exe', platform: 'steam' },
  { name: 'Overwatch 2', exe: 'overwatch.exe', platform: 'other' },
  { name: 'Rocket League', exe: 'rocketleague.exe', platform: 'epic' },
  { name: 'Grand Theft Auto V', exe: 'gta5.exe', platform: 'steam' },
  { name: 'Cyberpunk 2077', exe: 'cyberpunk2077.exe', platform: 'gog' },
  { name: 'Elden Ring', exe: 'eldenring.exe', platform: 'steam' },
  { name: 'Starfield', exe: 'starfield.exe', platform: 'other' },
  { name: 'Palworld', exe: 'palworld-win64-shipping.exe', platform: 'steam' },
  { name: 'Minecraft', exe: 'javaw.exe', platform: 'other' },
  { name: 'Minecraft', exe: 'minecraft.exe', platform: 'other' },
  { name: 'Hogwarts Legacy', exe: 'hogwartslegacy.exe', platform: 'steam' },
  { name: 'Diablo IV', exe: 'diablo iv.exe', platform: 'other' },
  { name: 'Hollow Knight', exe: 'hollow knight.exe', platform: 'steam' },
  { name: 'Baldurs Gate 3', exe: 'bg3.exe', platform: 'steam' },
  { name: 'Red Dead Redemption 2', exe: 'rdr2.exe', platform: 'other' },
  { name: 'Tom Clancys Rainbow Six Siege', exe: 'rainbowsix.exe', platform: 'steam' },
  { name: 'Tom Clancys Rainbow Six Siege', exe: 'rainbowsix_vulkan.exe', platform: 'steam' },
  { name: 'Battlefield 2042', exe: 'bf2042.exe', platform: 'other' },
  { name: 'Minecraft Legends', exe: 'minecraftlegends.exe', platform: 'other' },
  { name: 'The Finals', exe: 'thefinals.exe', platform: 'steam' },
  { name: 'Marvel Rivals', exe: 'marvelrivals.exe', platform: 'steam' },
  { name: 'Genshin Impact', exe: 'genshinimpact.exe', platform: 'other' },
  { name: 'Roblox', exe: 'robloxplayerbeta.exe', platform: 'other' },
  { name: 'League of Legends', exe: 'riotclientservices.exe', platform: 'riot' },
  { name: 'Teamfight Tactics', exe: 'riotclientstables.exe', platform: 'riot' },
  { name: 'Dead by Daylight', exe: 'deadbydaylight.exe', platform: 'steam' },
  { name: 'Rust', exe: 'rust.exe', platform: 'steam' },
  { name: 'Terraria', exe: 'terraria.exe', platform: 'steam' },
  { name: 'Stardew Valley', exe: 'stardewvalley.exe', platform: 'steam' },
];

const GAME_OPTIMIZATIONS_FILE = 'gameOptimizations.json';
let optCache: GameOptimization[] | null = null;

function loadOptimizations(): GameOptimization[] {
  if (optCache) return optCache;
  try {
    optCache = JSON.parse(fs.readFileSync(dataFile(GAME_OPTIMIZATIONS_FILE), 'utf-8')) as GameOptimization[];
  } catch {
    optCache = [];
  }
  return optCache!;
}

let writeTimer: NodeJS.Timeout | null = null;

function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      fs.writeFileSync(ensureFile(GAME_OPTIMIZATIONS_FILE), JSON.stringify(optCache, null, 2), 'utf-8');
    } catch { /* ignore */ }
  }, 300);
}

const STEAM_PATHS = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\common',
  'D:\\Steam\\steamapps\\common',
  'E:\\Steam\\steamapps\\common',
  'D:\\SteamLibrary\\steamapps\\common',
  'E:\\SteamLibrary\\steamapps\\common',
  'F:\\SteamLibrary\\steamapps\\common',
];

const EPIC_PATHS = [
  'C:\\Program Files\\Epic Games',
  'D:\\Epic Games',
  'E:\\Epic Games',
];

const GOG_PATHS = [
  'C:\\GOG Games',
  'D:\\GOG Games',
  'C:\\Program Files (x86)\\GOG Galaxy\\Games',
];

const XBOX_PATHS = [
  'C:\\Program Files\\WindowsApps',
  'D:\\XboxGames',
];

function findInstalledGames(): DetectedGame[] {
  const found: DetectedGame[] = [];
  const seen = new Set<string>();

  function scanDir(dirPath: string) {
    try {
      if (!fs.existsSync(dirPath)) return;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(dirPath, entry.name);
        try {
          const files = fs.readdirSync(fullPath);
          const exeFiles = files.filter(f => f.endsWith('.exe'));
          for (const exe of exeFiles) {
            const exeLower = exe.toLowerCase();
            const known = KNOWN_GAMES.find(g => g.exe.toLowerCase() === exeLower);
            if (known && !seen.has(exeLower)) {
              seen.add(exeLower);
              found.push({
                id: `${known.platform}-${exeLower.replace(/\s+/g, '-')}`,
                name: known.name,
                exe: exe,
                platform: known.platform,
                installPath: fullPath,
                running: false,
                pid: null,
              });
            }
          }
        } catch { /* skip inaccessible */ }
      }
    } catch { /* skip */ }
  }

  for (const p of STEAM_PATHS) scanDir(p);
  for (const p of EPIC_PATHS) scanDir(p);
  for (const p of GOG_PATHS) scanDir(p);
  for (const p of XBOX_PATHS) scanDir(p);

  return found;
}

export async function detectInstalledGames(): Promise<DetectedGame[]> {
  const installed = findInstalledGames();

  const runningPs = await runPS(`
    $known = @('valorant','leagueclient','league of legends','fortniteclient','fortnitelauncher',
      'cs2','cs2_win64','dota2','r5apex','modernwarfare','tslgame','overwatch',
      'rocketleague','gta5','cyberpunk2077','eldenring','starfield','palworld',
      'javaw','minecraft','hogwartslegacy','diablo iv','hollow knight','bg3',
      'rdr2','rainbowsix','bf2042','thefinals','marvelrivals','genshinimpact',
      'robloxplayerbeta','deadbydaylight','rust','terraria','stardewvalley',
      'riotclientservices','riotclientstables')
    $procs = Get-Process | Where-Object {
      $name = $_.ProcessName.ToLower()
      $known -contains $name -or $name -like '*game*' -or $name -like '*launcher*'
    } | Select-Object Id, ProcessName
    if ($procs) { $procs | ConvertTo-Json -Depth 3 -Compress } else { '[]' }
  `, 10000);

  let running: Array<{ Id: number; ProcessName: string }> = [];
  try {
    const parsed = JSON.parse(runningPs.stdout.trim());
    running = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch { /* ignore */ }

  for (const game of installed) {
    const exeName = game.exe?.replace(/\.exe$/i, '').toLowerCase() || '';
    const match = running.find(r => r.ProcessName.toLowerCase() === exeName);
    if (match) {
      game.running = true;
      game.pid = match.Id;
    }
  }

  log('INFO', 'games', `Juegos detectados: ${installed.length} instalados, ${running.length} ejecutándose`);
  return installed;
}

export async function detectRunningGames(): Promise<DetectedGame[]> {
  const installed = await detectInstalledGames();
  return installed.filter(g => g.running);
}

export function listGameOptimizations(): GameOptimization[] {
  return loadOptimizations();
}

export function getGameOptimization(id: string): GameOptimization | undefined {
  return loadOptimizations().find(o => o.id === id);
}

export function getOptimizationForGame(gameId: string): GameOptimization | undefined {
  return loadOptimizations().find(o => o.gameId === gameId);
}

export function saveGameOptimization(o: GameOptimization): GameOptimization {
  const list = loadOptimizations();
  const idx = list.findIndex(x => x.id === o.id);
  if (idx >= 0) {
    list[idx] = o;
  } else {
    list.push(o);
  }
  optCache = list;
  scheduleWrite();
  log('SYSTEM', 'games', `Optimización de juego guardada: ${o.name}`);
  return o;
}

export function deleteGameOptimization(id: string): { ok: boolean } {
  const list = loadOptimizations().filter(o => o.id !== id);
  optCache = list;
  scheduleWrite();
  log('SYSTEM', 'games', `Optimización de juego eliminada: ${id}`);
  return { ok: true };
}

export async function applyGameOptimization(
  optimizationId: string
): Promise<{ ok: boolean; applied: string[]; errors: string[] }> {
  const opt = getGameOptimization(optimizationId);
  if (!opt) return { ok: false, applied: [], errors: ['Optimización no encontrada'] };

  const applied: string[] = [];
  const errors: string[] = [];

  // Set power plan
  if (opt.applyPowerPlan) {
    try {
      const r = await runPS('powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', 10000);
      if (r.code === 0) applied.push('Plan de energía: Alto rendimiento');
      else errors.push('No se pudo cambiar el plan de energía');
    } catch { errors.push('Error al cambiar plan de energía'); }
  }

  // Set process priority
  if (opt.gameId) {
    const game = (await detectInstalledGames()).find(g => g.id === opt.gameId);
    if (game?.exe) {
      const exeName = game.exe.replace(/\.exe$/i, '');
      const priorityMap = { normal: 'Normal', high: 'High', realtime: 'Realtime' };
      try {
        const r = await runPS(`
          $proc = Get-Process -Name '${exeName.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($proc) {
            $proc.PriorityClass = '${priorityMap[opt.priority]}'
            'ok'
          } else { 'not_found' }
        `, 10000);
        if (r.stdout.trim() === 'ok') applied.push(`Prioridad: ${opt.priority}`);
        else if (r.stdout.trim() === 'not_found') applied.push('Juego no detectado en memoria (se aplicará al iniciar)');
      } catch { errors.push('No se pudo establecer prioridad'); }
    }
  }

  // Memory clean
  if (opt.memoryClean) {
    try {
      const memResult = await optimizeMemory();
      if (memResult.ok) applied.push('Limpieza de memoria');
      else errors.push(memResult.message);
    } catch { errors.push('Limpieza de memoria falló'); }
  }

  log('SUCCESS', 'games', `Optimización ${opt.name} aplicada: ${applied.join(', ')}`);
  return { ok: errors.length === 0, applied, errors };
}

export async function deactivateGameOptimization(
  optimizationId: string
): Promise<{ ok: boolean; applied: string[]; errors: string[] }> {
  const opt = getGameOptimization(optimizationId);
  if (!opt) return { ok: false, applied: [], errors: ['Optimización no encontrada'] };

  const applied: string[] = [];
  const errors: string[] = [];

  if (opt.applyPowerPlan) {
    try {
      await runPS('powercfg -setactive 381b4222-f694-41f0-9685-ff5bb260df2e', 10000);
      applied.push('Plan de energía restaurado a Equilibrado');
    } catch { errors.push('No se pudo restaurar el plan de energía'); }
  }

  log('SUCCESS', 'games', `Optimización ${opt.name} desactivada`);
  return { ok: errors.length === 0, applied, errors };
}

export async function getGameBoostStatus(): Promise<{
  activeOptimizations: string[];
  runningGames: string[];
  totalOptimizations: number;
}> {
  const opts = loadOptimizations();
  const games = await detectRunningGames();
  return {
    activeOptimizations: opts.map(o => o.name),
    runningGames: games.map(g => g.name),
    totalOptimizations: opts.length,
  };
}
