import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  if (process.env.NODE_ENV !== 'production') {
    return res.status(500).json({
      error: 'Error interno del servidor.',
      _debug: err.message,
    });
  }

  return res.status(500).json({ error: 'Error interno del servidor.' });
}
