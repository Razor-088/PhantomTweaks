export function Logo({ size = 20, stroke = 1, animated = false }: { size?: number; stroke?: number; animated?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden="true"
      className={animated ? 'animate-spin-slow' : ''}
    >
      <defs>
        <linearGradient id="pt-logo-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b2ffd0" />
          <stop offset="1" stopColor="#00b65c" />
        </linearGradient>
        <linearGradient id="pt-logo-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00ff88" stopOpacity="0.3" />
          <stop offset="1" stopColor="#00ff88" stopOpacity="0" />
        </linearGradient>
        <filter id="pt-glow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M61 188 A195 165 0 0 1 451 188 L448 388 C491 418 501 458 438 490 C376 520 296 520 256 516 C206 512 146 512 126 502 C66 488 56 453 64 388 Z"
        fill="url(#pt-logo-body)"
        stroke="#008c46"
        strokeWidth={11 * stroke}
        strokeLinejoin="round"
        filter="url(#pt-glow)"
      />
      <rect x="124" y="132" width="100" height="56" rx="28" fill="#041a10" />
      <rect x="288" y="132" width="100" height="56" rx="28" fill="#041a10" />
      <path
        d="M220 200 L288 200 L244 252 L284 252 L226 328 L252 270 L214 270 Z"
        fill="#eaffc4"
        stroke="#96c85a"
        strokeWidth={4 * stroke}
        strokeLinejoin="round"
        filter="url(#pt-glow)"
      />
    </svg>
  );
}

export function LogoLarge({ className = '' }: { className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      {/* Rotating orbit ring */}
      <div className="absolute inset-[-12px] rounded-full border border-gaccent/10 orbit-ring pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-gaccent/60" />
      </div>
      <div className="relative rounded-2xl bg-gaccent-dim border border-gaccent/20 p-4 shadow-[0_0_30px_rgba(0,255,136,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]">
        <Logo size={48} />
      </div>
    </div>
  );
}
