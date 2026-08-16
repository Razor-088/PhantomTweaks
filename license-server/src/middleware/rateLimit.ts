import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getStore(key: string): Map<string, RateLimitEntry> {
  if (!stores.has(key)) stores.set(key, new Map());
  return stores.get(key)!;
}

export function rateLimit(opts: { windowMs: number; max: number; key?: string }) {
  const storeKey = opts.key || 'default';

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const store = getStore(storeKey);
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    entry.count++;
    if (entry.count > opts.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.' });
    }

    next();
  };
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [, store] of stores) {
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }
}, 300000);
