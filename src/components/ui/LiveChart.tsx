interface Props {
  data: number[];
  color?: string;
  height?: number;
  min?: number;
  max?: number;
}

export function LiveChart({ data, color = '#00ff88', height = 80, min = 0, max = 100 }: Props) {
  if (!data || data.length < 2) return null;
  const width = 100;
  let dataMax = min;
  for (let i = 0; i < data.length; i++) { if (data[i] > dataMax) dataMax = data[i]; }
  const padded = Math.max(min, Math.min(max, dataMax));
  const range = padded - min > 0 ? padded - min : 1;
  const h = height;
  const pad = 2;
  const plotH = Math.max(h - pad * 2, 10);

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = pad + plotH - ((Math.max(min, Math.min(max, v)) - min) / range) * plotH;
    return `${x},${y + 0.5}`;
  });

  const linePath = `M${pts.join(' L')}`;
  const areaPath = `${linePath} L${width},${h - pad} L0,${h - pad} Z`;

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${width} ${h}`} preserveAspectRatio="none" className="w-full">
      <defs>
        <linearGradient id={`lc-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#lc-${color.replace('#', '')})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}