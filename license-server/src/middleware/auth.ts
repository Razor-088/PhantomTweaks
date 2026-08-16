import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import { verifyPassword } from '../utils/crypto';
import { queryOne } from '../database/pool';

interface AdminPayload {
  username: string;
  iat: number;
  exp: number;
}

export function adminLogin(req: Request, res: Response) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
  }

  if (username !== config.adminUsername) {
    return res.status(401).json({ error: 'Credenciales inválidas.' });
  }

  if (password !== config.adminPassword) {
    return res.status(401).json({ error: 'Credenciales inválidas.' });
  }

  const token = jwt.sign(
    { username },
    config.jwtSecret,
    { expiresIn: '24h' }
  );

  return res.json({ token, expires_in: 86400 });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de administrador requerido.' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AdminPayload;
    (req as any).adminUser = payload.username;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}
