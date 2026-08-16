import { Pool } from 'pg';
import { config } from '../config';

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.isProduction ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
  const p = getPool();
  const result = await p.query(text, params);
  return { rows: result.rows as T[], rowCount: result.rowCount || 0 };
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const { rows } = await query<T>(text, params);
  return rows[0] || null;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
  }
}
