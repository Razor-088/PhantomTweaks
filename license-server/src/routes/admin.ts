import { Router, Request, Response } from 'express';
import { requireAdmin, adminLogin } from '../middleware/auth';
import {
  createLicense, getLicense, searchLicenses, listLicenses, countLicenses,
  revokeLicense, suspendLicense, reactivateLicense, resetHwid,
  updateExpiry, updateMaxActivations, logActivity,
} from '../services/licenseService';
import { log } from '../utils/logger';

const router = Router();

// POST /api/admin/login
router.post('/login', (req: Request, res: Response) => adminLogin(req, res));

// All routes below require admin auth
router.use(requireAdmin);

// GET /api/admin/licenses
router.get('/licenses', async (req: Request, res: Response) => {
  const { search, limit, offset } = req.query;
  const lim = Math.min(parseInt(limit as string) || 50, 200);
  const off = parseInt(offset as string) || 0;

  try {
    if (search && typeof search === 'string') {
      const licenses = await searchLicenses(search, lim, off);
      return res.json({ licenses, count: licenses.length });
    }
    const licenses = await listLicenses(lim, off);
    const counts = await countLicenses();
    return res.json({ licenses, counts, count: licenses.length });
  } catch (err: any) {
    log('ERROR', 'admin', `Error listando licencias: ${err.message}`);
    return res.status(500).json({ error: 'Error interno.' });
  }
});

// GET /api/admin/licenses/:key
router.get('/licenses/:key', async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string;
    const lic = await getLicense(key);
    if (!lic) return res.status(404).json({ error: 'Licencia no encontrada.' });
    return res.json(lic);
  } catch (err: any) {
    return res.status(500).json({ error: 'Error interno.' });
  }
});

// POST /api/admin/licenses
router.post('/licenses', async (req: Request, res: Response) => {
  const { license_type, max_activations } = req.body;
  const validTypes = ['lifetime', '30d', '90d', '1y', 'custom'];
  const type = validTypes.includes(license_type) ? license_type : 'lifetime';
  const maxAct = Math.min(Math.max(parseInt(max_activations) || 1, 1), 10);

  try {
    const lic = await createLicense({ licenseType: type, maxActivations: maxAct });
    return res.status(201).json(lic);
  } catch (err: any) {
    log('ERROR', 'admin', `Error creando licencia: ${err.message}`);
    return res.status(500).json({ error: 'Error interno.' });
  }
});

// POST /api/admin/licenses/:key/revoke
router.post('/licenses/:key/revoke', async (req: Request, res: Response) => {
  const result = await revokeLicense(req.params.key as string);
  return res.status(result.ok ? 200 : 404).json(result);
});

// POST /api/admin/licenses/:key/suspend
router.post('/licenses/:key/suspend', async (req: Request, res: Response) => {
  const result = await suspendLicense(req.params.key as string);
  return res.status(result.ok ? 200 : 404).json(result);
});

// POST /api/admin/licenses/:key/reactivate
router.post('/licenses/:key/reactivate', async (req: Request, res: Response) => {
  const result = await reactivateLicense(req.params.key as string);
  return res.status(result.ok ? 200 : 404).json(result);
});

// POST /api/admin/licenses/:key/reset-hwid
router.post('/licenses/:key/reset-hwid', async (req: Request, res: Response) => {
  const result = await resetHwid(req.params.key as string);
  return res.status(result.ok ? 200 : 404).json(result);
});

// PUT /api/admin/licenses/:key/expiry
router.put('/licenses/:key/expiry', async (req: Request, res: Response) => {
  const { expires_at } = req.body;
  const result = await updateExpiry(req.params.key as string, expires_at || null);
  return res.status(result.ok ? 200 : 404).json(result);
});

// PUT /api/admin/licenses/:key/max-activations
router.put('/licenses/:key/max-activations', async (req: Request, res: Response) => {
  const { max_activations } = req.body;
  const max = parseInt(max_activations);
  if (!max || max < 1 || max > 10) {
    return res.status(400).json({ ok: false, error: 'max_activations debe ser entre 1 y 10.' });
  }
  const result = await updateMaxActivations(req.params.key as string, max);
  return res.status(result.ok ? 200 : 404).json(result);
});

// GET /api/admin/dashboard
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const counts = await countLicenses();
    return res.json(counts);
  } catch {
    return res.status(500).json({ error: 'Error interno.' });
  }
});

export default router;
