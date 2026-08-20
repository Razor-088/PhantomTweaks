interface SkeletonProps {
  className?: string;
  count?: number;
  type?: 'text' | 'card' | 'circle';
}

export function Skeleton({ className, count = 1, type = 'text' }: SkeletonProps) {
  const base = 'bg-gpanel2 animate-pulse rounded';
  const typeClass = type === 'circle' ? 'w-10 h-10 rounded-full' : type === 'card' ? 'h-20 rounded-xl' : 'h-3 w-full';
  const items = Array.from({ length: count });

  if (count === 1) {
    return <div className={`${base} ${typeClass} ${className || ''}`} />;
  }

  return (
    <>
      {items.map((_, i) => (
        <div key={i} className={`${base} ${typeClass} ${className || ''} mb-2 last:mb-0`} />
      ))}
    </>
  );
}

const skeletonMap: Record<string, string> = {
  'text-sm': 'h-3 w-full',
  'text-xs': 'h-2 w-full',
  'card': 'h-20 rounded-xl',
  'circle': 'w-10 h-10 rounded-full',
  'metric': 'h-4 w-3/4',
};

export function LoadingSkeleton({ variant = 'text-sm', lines = 3 }: { variant?: string; lines?: number }) {
  const dims = skeletonMap[variant] || skeletonMap['text-sm'];
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`bg-gpanel2 animate-pulse rounded ${dims}`} />
      ))}
    </div>
  );
}
