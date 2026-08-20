import React from 'react';

interface Props {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
  animated?: boolean;
  height?: number;
}

export const ProgressBar = React.memo(function ProgressBar({ value, max = 100, className = '', barClassName = '', animated, height = 6 }: Props) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`relative w-full bg-gbase3 rounded-full overflow-hidden ${className}`} style={{ height }}>
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${barClassName || 'bg-gaccent'}`}
        style={{
          width: `${pct}%`,
          boxShadow: '0 0 12px rgba(0,255,136,0.3), 0 0 4px rgba(0,255,136,0.5)',
        }}
      />
      {animated && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.35) 50%, transparent 65%)',
            backgroundSize: '200% 100%',
            animation: 'gtshimmer 2.2s linear infinite',
          }}
        />
      )}
    </div>
  );
});
