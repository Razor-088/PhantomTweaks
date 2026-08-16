import * as fs from 'fs';
import { dataFile, ensureFile } from './paths';

export interface AppSettings {
  language: 'es' | 'en';
  theme: 'dark' | 'light' | 'system';
  animations: boolean;
  transparency: boolean;
  runOnStartup: boolean;
  minimizeToTray: boolean;
  notifications: boolean;
  infoLevel: 'basic' | 'detailed' | 'advanced';
  confirmChanges: boolean;
  autoRestorePoint: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'es',
  theme: 'system',
  animations: true,
  transparency: true,
  runOnStartup: false,
  minimizeToTray: true,
  notifications: true,
  infoLevel: 'detailed',
  confirmChanges: true,
  autoRestorePoint: true,
};

let cache: AppSettings | null = null;

function read(): AppSettings {
  const file = dataFile('settings.json');
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let writeTimer: NodeJS.Timeout | null = null;
let pendingWrite: AppSettings | null = null;

function scheduleWrite(s: AppSettings) {
  pendingWrite = s;
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (!pendingWrite) return;
    const toWrite = pendingWrite;
    pendingWrite = null;
    try {
      const file = ensureFile('settings.json');
      fs.writeFileSync(file, JSON.stringify(toWrite, null, 2), 'utf-8');
    } catch {
      /* ignore write errors */
    }
  }, 250);
}

export function getSettings(): AppSettings {
  if (!cache) cache = read();
  return { ...cache };
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): AppSettings {
  const s = getSettings();
  s[key] = value;
  cache = s;
  scheduleWrite(s);
  return getSettings();
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  const s = { ...getSettings(), ...partial };
  cache = s;
  scheduleWrite(s);
  return getSettings();
}

export function resetSettings(): AppSettings {
  cache = { ...DEFAULT_SETTINGS };
  scheduleWrite(cache);
  return getSettings();
}
