import * as fs from 'fs';
import * as path from 'path';
import { runPS } from './ps';
import { dataFile } from './paths';
import { log } from './logging';
import { optimizeMemory } from './windowsTweaks';
import { createScheduleWrite } from '../shared/scheduleWrite';

export interface DetectedGame {
  id: string;
  name: string;
  exe: string | null;
  platform: 'steam' | 'epic' | 'riot' | 'xbox' | 'gog' | 'battle.net' | 'other';
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
  // Valve / Steam
  { name: 'Counter-Strike 2', exe: 'cs2.exe', platform: 'steam' },
  { name: 'Counter-Strike 2', exe: 'cs2_win64.exe', platform: 'steam' },
  { name: 'Dota 2', exe: 'dota2.exe', platform: 'steam' },
  { name: 'Team Fortress 2', exe: 'tf2.exe', platform: 'steam' },
  { name: 'Portal 2', exe: 'portal2.exe', platform: 'steam' },
  { name: 'Left 4 Dead 2', exe: 'left4dead2.exe', platform: 'steam' },
  { name: 'Half-Life: Alyx', exe: 'hlvr.exe', platform: 'steam' },

  // Battle Royale / Shooters
  { name: 'Apex Legends', exe: 'r5apex.exe', platform: 'steam' },
  { name: 'PUBG: BATTLEGROUNDS', exe: 'tslgame.exe', platform: 'steam' },
  { name: 'Fortnite', exe: 'fortniteclient-win64-shipping.exe', platform: 'epic' },
  { name: 'Fortnite', exe: 'fortnitelauncher.exe', platform: 'epic' },
  { name: 'Call of Duty: MW II', exe: 'modernwarfare2.exe', platform: 'steam' },
  { name: 'Call of Duty: MW III', exe: 'modernwarfare3.exe', platform: 'steam' },
  { name: 'Call of Duty: Warzone', exe: 'warzone.exe', platform: 'steam' },
  { name: 'Call of Duty: Warzone', exe: 'modernwarfare.exe', platform: 'other' },
  { name: 'Battlefield 2042', exe: 'bf2042.exe', platform: 'other' },
  { name: 'Battlefield V', exe: 'bfv.exe', platform: 'other' },
  { name: 'The Finals', exe: 'thefinals.exe', platform: 'steam' },
  { name: 'The Finals', exe: 'thefinalseg.exe', platform: 'steam' },
  { name: 'Marathon', exe: 'marathon.exe', platform: 'other' },

  // Hero Shooters
  { name: 'Overwatch 2', exe: 'overwatch.exe', platform: 'battle.net' },
  { name: 'Valorant', exe: 'valorant.exe', platform: 'riot' },
  { name: 'Marvel Rivals', exe: 'marvelrivals.exe', platform: 'steam' },
  { name: 'Marvel Rivals', exe: 'MarvelRivals.exe', platform: 'steam' },

  // MMOs / RPGs
  { name: 'Diablo IV', exe: 'diablo iv.exe', platform: 'battle.net' },
  { name: 'Diablo IV', exe: 'diabloiv.exe', platform: 'battle.net' },
  { name: 'World of Warcraft', exe: 'wow.exe', platform: 'battle.net' },
  { name: 'Elden Ring', exe: 'eldenring.exe', platform: 'steam' },
  { name: 'Baldur\'s Gate 3', exe: 'bg3.exe', platform: 'steam' },
  { name: 'Cyberpunk 2077', exe: 'cyberpunk2077.exe', platform: 'gog' },
  { name: 'Hogwarts Legacy', exe: 'hogwartslegacy.exe', platform: 'steam' },
  { name: 'Red Dead Redemption 2', exe: 'rdr2.exe', platform: 'steam' },
  { name: 'Starfield', exe: 'starfield.exe', platform: 'other' },
  { name: 'Final Fantasy VII Rebirth', exe: 'ff7rebirth.exe', platform: 'steam' },
  { name: 'Final Fantasy XIV', exe: 'ffxiv.exe', platform: 'other' },
  { name: 'Genshin Impact', exe: 'genshinimpact.exe', platform: 'other' },
  { name: 'Honkai: Star Rail', exe: 'starrail.exe', platform: 'other' },
  { name: 'Wuthering Waves', exe: 'client.exe', platform: 'other' },

  // Survival / Sandbox
  { name: 'Palworld', exe: 'palworld-win64-shipping.exe', platform: 'steam' },
  { name: 'Rust', exe: 'rust.exe', platform: 'steam' },
  { name: 'Terraria', exe: 'terraria.exe', platform: 'steam' },
  { name: 'Minecraft', exe: 'javaw.exe', platform: 'other' },
  { name: 'Minecraft', exe: 'minecraft.exe', platform: 'other' },
  { name: 'Minecraft', exe: 'Minecraft.Windows.exe', platform: 'xbox' },
  { name: 'Subnautica', exe: 'subnautica.exe', platform: 'steam' },
  { name: 'Valheim', exe: 'valheim.exe', platform: 'steam' },
  { name: 'ARK: Survival Evolved', exe: 'shootergame.exe', platform: 'steam' },

  // Racing
  { name: 'Rocket League', exe: 'rocketleague.exe', platform: 'epic' },
  { name: 'Forza Horizon 5', exe: 'forzahorizon5.exe', platform: 'other' },
  { name: 'Forza Motorsport', exe: 'forzamotorsport.exe', platform: 'other' },

  // Fighting
  { name: 'TEKKEN 8', exe: 'tekken8.exe', platform: 'steam' },
  { name: 'Street Fighter 6', exe: 're-engine.exe', platform: 'steam' },

  // Action / Adventure
  { name: 'Star Wars Outlaws', exe: 'starwarsoutlaws.exe', platform: 'other' },
  { name: 'Black Myth: Wukong', exe: 'b1.exe', platform: 'steam' },
  { name: 'God of War Ragnarok', exe: 'GoWR.exe', platform: 'steam' },
  { name: 'Ghost of Tsushima', exe: 'GoT.exe', platform: 'steam' },
  { name: 'Hollow Knight', exe: 'hollow knight.exe', platform: 'steam' },
  { name: 'Hollow Knight: Silksong', exe: 'silksong.exe', platform: 'steam' },

  // Co-op / Party
  { name: 'Lethal Company', exe: 'Lethal Company.exe', platform: 'steam' },
  { name: 'Deep Rock Galactic', exe: 'FSDWin64.exe', platform: 'steam' },
  { name: 'Helldivers 2', exe: 'helldivers2.exe', platform: 'steam' },
  { name: 'It Takes Two', exe: 'ItTakesTwo.exe', platform: 'steam' },

  // Strategy
  { name: 'Civilization VI', exe: 'civilizationvi.exe', platform: 'steam' },
  { name: 'Total War: Warhammer III', exe: 'warhammer3.exe', platform: 'steam' },

  // Riot
  { name: 'League of Legends', exe: 'leagueclient.exe', platform: 'riot' },
  { name: 'League of Legends', exe: 'league of legends.exe', platform: 'riot' },
  { name: 'Teamfight Tactics', exe: 'riotclientstables.exe', platform: 'riot' },
  { name: '2XKO', exe: '2xko.exe', platform: 'riot' },

  // Misc
  { name: 'Roblox', exe: 'robloxplayerbeta.exe', platform: 'other' },
  { name: 'Dead by Daylight', exe: 'deadbydaylight.exe', platform: 'steam' },
  { name: 'Stardew Valley', exe: 'stardewvalley.exe', platform: 'steam' },
  { name: 'Fall Guys', exe: 'fallguys_client.exe', platform: 'epic' },
  { name: 'Fortnite', exe: 'FortniteLauncher.exe', platform: 'epic' },
  { name: 'Phasmophobia', exe: 'Phasmophobia.exe', platform: 'steam' },
  { name: 'Satisfactory', exe: 'FactoryGameSteam.exe', platform: 'steam' },
  { name: 'The First Descendant', exe: 'TheFirstDescendant.exe', platform: 'steam' },
  { name: 'Once Human', exe: 'OnceHuman.exe', platform: 'steam' },
  { name: 'Delta Force', exe: 'deltaforce.exe', platform: 'steam' },
  { name: 'Zenless Zone Zero', exe: 'ZenlessZoneZero.exe', platform: 'other' },
];

const GAME_OPTIMIZATIONS_FILE = 'gameOptimizations.json';
const CUSTOM_GAMES_FILE = 'customGames.json';
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

export function loadCustomGames(): DetectedGame[] {
  try {
    return JSON.parse(fs.readFileSync(dataFile(CUSTOM_GAMES_FILE), 'utf-8')) as DetectedGame[];
  } catch {
    return [];
  }
}

export function saveCustomGame(game: DetectedGame): { ok: boolean } {
  const list = loadCustomGames();
  const idx = list.findIndex(g => g.id === game.id);
  if (idx >= 0) list[idx] = game;
  else list.push(game);
  fs.writeFileSync(dataFile(CUSTOM_GAMES_FILE), JSON.stringify(list, null, 2));
  return { ok: true };
}

export function deleteCustomGame(id: string): { ok: boolean } {
  const list = loadCustomGames().filter(g => g.id !== id);
  fs.writeFileSync(dataFile(CUSTOM_GAMES_FILE), JSON.stringify(list, null, 2));
  return { ok: true };
}

const scheduleWrite = createScheduleWrite(() => optCache, GAME_OPTIMIZATIONS_FILE);

function getDynamicSteamBases(): string[] {
  const bases: string[] = [];
  const programFiles = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
  ];
  for (const p of programFiles) {
    try { if (fs.existsSync(p)) bases.push(p); } catch { /* ignore */ }
  }
  const drives = ['C:', 'D:', 'E:', 'F:', 'G:'];
  for (const d of drives) {
    const extra = [`${d}\\Steam`, `${d}\\SteamLibrary`, `${d}\\Games\\Steam`];
    for (const p of extra) {
      try { if (fs.existsSync(p) && !bases.includes(p)) bases.push(p); } catch { /* ignore */ }
    }
  }
  return bases;
}

function parseSteamLibraries(): string[] {
  const paths: string[] = [];
  const bases = getDynamicSteamBases();
  for (const base of bases) {
    const vdf = path.join(base, 'steamapps', 'libraryfolders.vdf');
    try {
      const content = fs.readFileSync(vdf, 'utf-8');
      const dirMatches = content.matchAll(/"path"\s+"([^"]+)"/gi);
      for (const m of dirMatches) {
        const libPath = m[1].replace(/\\\\/g, '\\');
        const common = path.join(libPath, 'steamapps', 'common');
        if (!paths.includes(common)) paths.push(common);
      }
      const localCommon = path.join(base, 'steamapps', 'common');
      if (!paths.includes(localCommon)) paths.push(localCommon);
    } catch {
      const localCommon = path.join(base, 'steamapps', 'common');
      if (!paths.includes(localCommon)) paths.push(localCommon);
    }
  }
  return paths;
}

function parseSteamAppManifests(): Array<{ name: string; installDir: string; steamBase: string }> {
  const results: Array<{ name: string; installDir: string; steamBase: string }> = [];
  const bases = getDynamicSteamBases();
  for (const base of bases) {
    const steamApps = path.join(base, 'steamapps');
    try {
      const files = fs.readdirSync(steamApps);
      for (const f of files) {
        if (!f.startsWith('appmanifest_') || !f.endsWith('.acf')) continue;
        try {
          const content = fs.readFileSync(path.join(steamApps, f), 'utf-8');
          const name = content.match(/"name"\s+"([^"]+)"/)?.[1];
          const installDir = content.match(/"installdir"\s+"([^"]+)"/)?.[1];
          if (name && installDir) {
            results.push({ name, installDir, steamBase: base });
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  return results;
}

function parseEpicManifests(): string[] {
  const paths: string[] = [];
  const epicBasePaths = ['C:\\Program Files\\Epic Games', 'D:\\Epic Games', 'E:\\Epic Games', 'C:\\Games\\Epic Games', 'D:\\Games\\Epic Games'];
  for (const p of epicBasePaths) {
    try { if (fs.existsSync(p)) paths.push(p); } catch { /* ignore */ }
  }
  const manifestDirs = [
    'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests',
    'D:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests',
  ];
  for (const manifestDir of manifestDirs) {
    try {
      const files = fs.readdirSync(manifestDir);
      for (const f of files) {
        if (!f.endsWith('.item')) continue;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(manifestDir, f), 'utf-8'));
          if (data.InstallLocation && !paths.includes(data.InstallLocation)) {
            paths.push(data.InstallLocation);
          }
        } catch { /* skip */ }
      }
    } catch { /* no manifest dir */ }
  }
  return paths;
}

function scanDirDeep(dirPath: string, maxDepth: number, depth = 0): fs.Dirent[] {
  if (depth > maxDepth) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch { return []; }
  return entries;
}

function findExesInDir(dirPath: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const exes: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch { return exes; }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
      exes.push(path.join(dirPath, entry.name));
    } else if (entry.isDirectory() && depth < maxDepth) {
      exes.push(...findExesInDir(path.join(dirPath, entry.name), maxDepth, depth + 1));
    }
  }
  return exes;
}

const GAME_DIRS_TO_SKIP = new Set([
  'steamworks shared', 'commonredist', 'directx', 'vcredist', '_commonredist',
  'redist', 'prereqs', 'support', 'tools', 'launcher', 'sdk',
]);

async function findInstalledGames(): Promise<DetectedGame[]> {
  const found: DetectedGame[] = [];
  const seen = new Set<string>();

  function addGame(exePath: string, platform: DetectedGame['platform']) {
    const exeName = path.basename(exePath);
    const exeLower = exeName.toLowerCase();
    if (seen.has(exeLower)) return;
    const known = KNOWN_GAMES.find(g => g.exe.toLowerCase() === exeLower);
    if (known) {
      seen.add(exeLower);
      found.push({
        id: `${known.platform}-${exeLower.replace(/\s+/g, '-')}`,
        name: known.name,
        exe: exeName,
        platform: known.platform || platform,
        installPath: path.dirname(exePath),
        running: false,
        pid: null,
      });
    }
  }

  const steamDirs = parseSteamLibraries();
  const epicDirs = parseEpicManifests();
  const allDirs = [...steamDirs, ...epicDirs,
    'C:\\GOG Games', 'D:\\GOG Games', 'C:\\Program Files (x86)\\GOG Galaxy\\Games',
    'C:\\Program Files\\WindowsApps', 'D:\\XboxGames', 'E:\\XboxGames',
  ];

  for (const dir of allDirs) {
    let topEntries: fs.Dirent[];
    try {
      topEntries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { continue; }
    for (const entry of topEntries) {
      if (!entry.isDirectory()) continue;
      const dirName = entry.name.toLowerCase();
      if (GAME_DIRS_TO_SKIP.has(dirName)) continue;
      const fullPath = path.join(dir, entry.name);
      const exes = findExesInDir(fullPath, 3);
      for (const exe of exes) {
        addGame(exe, 'steam');
      }
    }
  }

  const manifests = parseSteamAppManifests();
  for (const m of manifests) {
    if (seen.has(m.name.toLowerCase())) continue;
    const installDir = path.join(m.steamBase, 'steamapps', 'common', m.installDir);
    const exes = findExesInDir(installDir, 3);
    for (const exe of exes) {
      addGame(exe, 'steam');
    }
  }

  for (const game of KNOWN_GAMES) {
    if (seen.has(game.exe.toLowerCase().trim())) continue;
    const extraBases = [
      'C:\\Program Files (x86)', 'C:\\Program Files',
      'D:\\', 'E:\\', 'C:\\Games', 'D:\\Games',
      'C:\\Riot Games', 'D:\\Riot Games',
      'C:\\Program Files (x86)\\Overwatch',
      'C:\\Program Files\\Overwatch',
    ];
    for (const base of extraBases) {
      const exePath = path.join(base, game.exe);
      try {
        fs.accessSync(exePath);
        addGame(exePath, game.platform);
        break;
      } catch { /* not found */ }
    }
  }

  return found;
}

export async function detectInstalledGames(): Promise<DetectedGame[]> {
  let installed = await findInstalledGames();

  const custom = loadCustomGames();
  for (const c of custom) {
    if (!installed.find(g => g.id === c.id)) {
      installed.push({ ...c, running: false, pid: null });
    }
  }

  const runningPs = await runPS(`
    $procs = Get-Process | Where-Object {
      $_.ProcessName -ne 'Idle'
    } | Select-Object Id, ProcessName
    if ($procs) { $procs | ConvertTo-Json -Depth 3 -Compress } else { '[]' }
  `, 15000);

  let running: Array<{ Id: number; ProcessName: string }> = [];
  try {
    const parsed = JSON.parse(runningPs.stdout.trim());
    running = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch { /* ignore */ }

  const runningMap = new Map<string, number>();
  for (const r of running) {
    runningMap.set(r.ProcessName.toLowerCase(), r.Id);
  }

  for (const game of installed) {
    if (!game.exe) continue;
    const exeName = game.exe.replace(/\.exe$/i, '').toLowerCase();
    const pid = runningMap.get(exeName);
    if (pid != null) {
      game.running = true;
      game.pid = pid;
    }
  }

  log('INFO', 'games', `Juegos detectados: ${installed.length} instalados, ${running.length} procesos activos`);
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

  if (opt.applyPowerPlan) {
    try {
      const r = await runPS('powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', 10000);
      if (r.code === 0) applied.push('Plan de energía: Alto rendimiento');
      else errors.push('No se pudo cambiar el plan de energía');
    } catch { errors.push('Error al cambiar plan de energía'); }
  }

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
