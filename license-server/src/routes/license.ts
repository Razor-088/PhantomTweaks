import { Router, Request, Response } from 'express';
import { activateLicense, validateSession, deactivateLicense } from '../services/licenseService';
import { rateLimit } from '../middleware/rateLimit';
import { log } from '../utils/logger';

const router = Router();

const activateLimiter = rateLimit({ windowMs: 60000, max: 10, key: 'activate' });
const validateLimiter = rateLimit({ windowMs: 60000, max: 30, key: 'validate' });
const deactivateLimiter = rateLimit({ windowMs: 60000, max: 5, key: 'deactivate' });

// POST /api/license/activate
router.post('/activate', activateLimiter, async (req: Request, res: Response) => {
  const { license_key, hwid, version } = req.body;

  if (!license_key || !hwid) {
    return res.status(400).json({ valid: false, error: 'license_key y hwid son requeridos.' });
  }

  if (typeof license_key !== 'string' || typeof hwid !== 'string') {
    return res.status(400).json({ valid: false, error: 'Parámetros inválidos.' });
  }

  if (license_key.length > 30 || hwid.length > 512) {
    return res.status(400).json({ valid: false, error: 'Parámetros fuera de rango.' });
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  try {
    const result = await activateLicense(license_key, hwid, ip, version || 'unknown');
    const status = result.valid ? 200 : 403;
    return res.status(status).json(result);
  } catch (err: any) {
    log('ERROR', 'license', `Error en activate: ${err.message}`);
    return res.status(500).json({ valid: false, error: 'Error interno del servidor.' });
  }
});

// POST /api/license/validate
router.post('/validate', validateLimiter, async (req: Request, res: Response) => {
  const { token, hwid } = req.body;

  if (!token || !hwid) {
    return res.status(400).json({ valid: false, error: 'token y hwid son requeridos.' });
  }

  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const result = await validateSession(token, hwid, ip);
    const status = result.valid ? 200 : 403;
    return res.status(status).json(result);
  } catch (err: any) {
    log('ERROR', 'license', `Error en validate: ${err.message}`);
    return res.status(500).json({ valid: false, error: 'Error interno del servidor.' });
  }
});

// POST /api/license/deactivate
router.post('/deactivate', deactivateLimiter, async (req: Request, res: Response) => {
  const { license_key, hwid } = req.body;

  if (!license_key || !hwid) {
    return res.status(400).json({ ok: false, error: 'license_key y hwid son requeridos.' });
  }

  try {
    const result = await deactivateLicense(license_key, hwid);
    const status = result.ok ? 200 : 403;
    return res.status(status).json(result);
  } catch (err: any) {
    log('ERROR', 'license', `Error en deactivate: ${err.message}`);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
});

export default router;
