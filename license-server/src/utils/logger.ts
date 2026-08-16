type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'SYSTEM';

export function log(level: LogLevel, category: string, message: string) {
  const now = new Date().toISOString();
  const line = `[${now}] [${level}] [${category}] ${message}`;

  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }
}
