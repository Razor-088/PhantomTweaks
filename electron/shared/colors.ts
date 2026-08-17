export function lineColor(pct: number): string {
  if (pct < 50) return '#00ff88';
  if (pct < 75) return '#ffb84d';
  return '#ff4d6d';
}
