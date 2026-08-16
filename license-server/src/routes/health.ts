import { Router } from 'express';
import { getPool } from '../database/pool';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

export default router;
