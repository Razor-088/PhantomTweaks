import * as fs from 'fs';
import * as path from 'path';
import { getDataDir, ensureDataDir } from './paths';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'SYSTEM';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
}

let today: string | null = null;
let stream: fs.WriteStream | null = null;

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function nowStamp() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentFile(): string {
  const d = new Date();
  const key = dateKey(d);
  if (key !== today) {
    if (stream) {
      stream.end();
      stream = null;
    }
    today = key;
    const dir = path.join(getDataDir(), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `phantontweaks-${key}.log`);
    stream = fs.createWriteStream(file, { flags: 'a' });
  }
  return stream!.path as string;
}

export function initLog() {
  ensureDataDir();
  currentFile();
}

export function log(level: LogLevel, category: string, message: string) {
  try {
    const entry: LogEntry = {
      timestamp: `${dateKey(new Date())} ${nowStamp()}`,
      level,
      category,
      message,
    };
    const line = `[${nowStamp()}] [${level}] [${category}] ${message}\n`;
    currentFile();
    if (stream) stream.write(line);
    // eslint-disable-next-line no-console
    console.log(line.trimEnd());
  } catch {
    // logging must never crash the app
  }
}

export function getLogs(limit = 1000): LogEntry[] {
  try {
    const dir = path.join(getDataDir(), 'logs');
    if (!fs.existsSync(dir)) return [];
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.log'))
      .sort()
      .slice(-3);
    const entries: LogEntry[] = [];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(dir, f), 'utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        const m = line.match(/^\[(.*?)\] \[(.*?)\] \[(.*?)\] (.*)$/);
        if (m) entries.push({ timestamp: m[1], level: m[2] as LogLevel, category: m[3], message: m[4] });
      }
    }
    return entries.slice(-limit);
  } catch {
    return [];
  }
}

export function exportLogs(): string {
  const dir = path.join(getDataDir(), 'logs');
  if (!fs.existsSync(dir)) throw new Error('No hay registros que exportar.');
  const out = path.join(getDataDir(), `phantontweaks-export-${Date.now()}.log`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.log'));
  const content = files
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf-8'))
    .join('');
  fs.writeFileSync(out, content, 'utf-8');
  return out;
}

export function clearLogs() {
  if (stream) {
    stream.end();
    stream = null;
  }
  today = null;
  const dir = path.join(getDataDir(), 'logs');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {
        /* ignore */
      }
    }
  }
}
