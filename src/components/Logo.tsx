export function Logo({ size = 20, stroke = 1 }: { size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="pt-logo-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b2ffd0" />
          <stop offset="1" stopColor="#00b65c" />
        </linearGradient>
      </defs>
      <path
        d="M61 188 A195 165 0 0 1 451 188 L448 388 C491 418 501 458 438 490 C376 520 296 520 256 516 C206 512 146 512 126 502 C66 488 56 453 64 388 Z"
        fill="url(#pt-logo-body)"
        stroke="#008c46"
        strokeWidth={11 * stroke}
        strokeLinejoin="round"
      />
      <rect x="124" y="132" width="100" height="56" rx="28" fill="#041a10" />
      <rect x="288" y="132" width="100" height="56" rx="28" fill="#041a10" />
      <path
        d="M220 200 L288 200 L244 252 L284 252 L226 328 L252 270 L214 270 Z"
        fill="#eaffc4"
        stroke="#96c85a"
        strokeWidth={4 * stroke}
        strokeLinejoin="round"
      />
    </svg>
  );
}
