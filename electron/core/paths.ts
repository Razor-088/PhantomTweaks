import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let dataDir = path.join(os.homedir(), 'PhantomTweaks');

export function initPaths(dir: string) {
  if (dir) dataDir = dir;
}

export function getDataDir(): string {
  return dataDir;
}

export function ensureDataDir(): string {
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function dataFile(name: string): string {
  return path.join(dataDir, name);
}

export function ensureFile(name: string): string {
  const f = dataFile(name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  return f;
}
