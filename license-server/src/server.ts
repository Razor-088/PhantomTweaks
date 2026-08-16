import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as crypto from 'crypto';
import { config } from './config';
import { getPool, closePool } from './database/pool';
import { runMigrations } from './database/migrate';
import healthRoutes from './routes/health';
import licenseRoutes from './routes/license';
import adminRoutes from './routes/admin';
import webhookRoutes from './routes/webhook';
import { errorHandler } from './middleware/errorHandler';
import { log } from './utils/logger';

const app = express();

// ── Security ──
app.use(helmet());
app.use(cors({
  origin: config.isProduction ? false : true,
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing with raw body for webhook signature verification ──
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf.toString();
  },
  limit: '1mb',
}));

// ── Trust proxy (Render uses reverse proxy) ──
app.set('trust proxy', 1);

// ── Routes ──
app.use(healthRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/admin', adminRoutes);
app.use(webhookRoutes);

// ── Serve admin panel static files ──
app.use('/admin', express.static('admin'));

// ── Error handler ──
app.use(errorHandler);

// ── Start ──
async function start() {
  // Validate required env vars
  if (!config.databaseUrl) {
    console.error('[FATAL] DATABASE_URL is not set.');
    process.exit(1);
  }
  if (!config.jwtSecret) {
    console.error('[FATAL] JWT_SECRET is not set.');
    process.exit(1);
  }
  if (!config.adminPassword) {
    console.error('[FATAL] ADMIN_PASSWORD is not set.');
    process.exit(1);
  }

  log('SYSTEM', 'server', 'PhantomTweaks License Server starting...');
  log('SYSTEM', 'server', `Node: ${process.version}`);
  log('SYSTEM', 'server', `Env: ${config.nodeEnv}`);
  log('SYSTEM', 'server', `Port: ${config.port}`);

  // Test database connection
  try {
    const pool = getPool();
    await pool.query('SELECT NOW()');
    log('SUCCESS', 'database', 'PostgreSQL connected.');
  } catch (err: any) {
    console.error('[FATAL] Cannot connect to database:', err.message);
    process.exit(1);
  }

  // Run migrations
  await runMigrations();

  // Warn about optional but recommended config
  if (!config.sellauthWebhookSecret) {
    log('WARN', 'server', 'SELLAUTH_WEBHOOK_SECRET not set — webhook signature verification disabled. Set this in production!');
  }
  if (!config.sellauthApiKey) {
    log('WARN', 'server', 'SELLAUTH_API_KEY not set — SellAuth API features disabled.');
  }

  // Seed admin user if needed
  try {
    const pool = getPool();
    const check = await pool.query('SELECT id FROM admin_users WHERE username = $1', [config.adminUsername]);
    if (check.rowCount === 0) {
      const { hashPassword } = await import('./utils/crypto');
      const hash = await hashPassword(config.adminPassword);
      await pool.query(
        'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)',
        [config.adminUsername, hash]
      );
      log('SUCCESS', 'database', `Admin user '${config.adminUsername}' created.`);
    }
  } catch (err: any) {
    log('WARN', 'database', `Could not seed admin user: ${err.message}`);
  }

  // Start listening
  const server = app.listen(config.port, '0.0.0.0', () => {
    log('SUCCESS', 'server', `Listening on 0.0.0.0:${config.port}`);
    log('SYSTEM', 'server', `Health: http://localhost:${config.port}/health`);
    log('SYSTEM', 'server', `Admin:  http://localhost:${config.port}/admin`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    log('SYSTEM', 'server', 'Shutting down...');
    server.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});

export default app;
