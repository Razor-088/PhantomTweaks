import * as fs from 'fs';
import * as path from 'path';
import { getPool } from './pool';

export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.log('[MIGRATE] No migrations directory found, skipping.');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`[MIGRATE] Running: ${file}`);
    try {
      await pool.query(sql);
      console.log(`[MIGRATE] OK: ${file}`);
    } catch (err: any) {
      if (err.code === '42710' || err.message?.includes('already exists')) {
        console.log(`[MIGRATE] Skip (already applied): ${file}`);
      } else {
        console.error(`[MIGRATE] Error in ${file}:`, err.message);
        throw err;
      }
    }
  }

  console.log('[MIGRATE] All migrations complete.');
}

// Run directly: node dist/database/migrate.js
if (require.main === module) {
  import('../config').then(({ config }) => {
    if (!config.databaseUrl) {
      console.error('[MIGRATE] DATABASE_URL not set.');
      process.exit(1);
    }
    runMigrations()
      .then(() => { console.log('[MIGRATE] Done.'); process.exit(0); })
      .catch((e) => { console.error('[MIGRATE] Failed:', e.message); process.exit(1); });
  });
}
