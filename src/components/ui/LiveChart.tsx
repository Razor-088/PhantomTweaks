import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';

interface Props {
  data: number[];
  color?: string;
  height?: number;
  min?: number;
  max?: number;
}

export function LiveChart({ data, color = '#00ff88', height = 80, min = 0, max = 100 }: Props) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[min, max]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.8}
            fill={`url(#grad-${color.replace('#', '')})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
