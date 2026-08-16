export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : decimals)} ${sizes[i]}`;
}

export function formatMbps(mbps: number): string {
  return `${mbps.toFixed(1)} Mbps`;
}

export function formatClock(mhz: number | null): string {
  if (!mhz) return '—';
  if (mhz >= 1000) return `${(mhz / 1000).toFixed(2)} GHz`;
  return `${Math.round(mhz)} MHz`;
}

export function formatUptime(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours % 24);
  return `${days}d ${rem}h`;
}

export function cls(pct: number): string {
  if (pct >= 85) return 'text-gdanger';
  if (pct >= 60) return 'text-gwarn';
  return 'text-gaccent';
}

export function fmtDate(iso: string): string {
  if (!iso) return '—';
  return iso;
}
