import { query, queryOne } from '../database/pool';
import { generateLicenseKey, isValidFormat } from '../utils/licenseGenerator';
import { sha256 } from '../utils/crypto';
import { config } from '../config';
import { log } from '../utils/logger';

export interface License {
  id: number;
  license_key: string;
  product: string;
  status: string;
  sellauth_order_id: string | null;
  sellauth_customer_id: string | null;
  sellauth_customer_email: string | null;
  hwid: string | null;
  activation_count: number;
  max_activations: number;
  license_type: string;
  expires_at: string | null;
  custom_expires_at: string | null;
  last_validation: string | null;
  last_ip: string | null;
  last_version: string | null;
  offline_grace_days: number;
  created_at: string;
  updated_at: string;
}

interface ActivateResult {
  valid: boolean;
  error?: string;
  license?: {
    key: string;
    product: string;
    status: string;
    expires_at: string | null;
    license_type: string;
  };
  token?: string;
  expires_at?: string;
}

function computeExpiry(type: string, customDate?: string | null): Date | null {
  const now = new Date();
  switch (type) {
    case 'lifetime': return null;
    case '30d':  return new Date(now.getTime() + 30 * 86400000);
    case '90d':  return new Date(now.getTime() + 90 * 86400000);
    case '1y':   return new Date(now.getTime() + 365 * 86400000);
    case 'custom': return customDate ? new Date(customDate) : null;
    default: return null;
  }
}

function isExpired(lic: License): boolean {
  if (!lic.expires_at) return false;
  return new Date(lic.expires_at) < new Date();
}

function computeExpiresAt(lic: License): Date | null {
  if (lic.expires_at) return new Date(lic.expires_at);
  if (lic.license_type === 'custom' && lic.custom_expires_at) return new Date(lic.custom_expires_at);
  return null;
}

export async function activateLicense(
  licenseKey: string,
  hwidRaw: string,
  ip: string,
  version: string
): Promise<ActivateResult> {
  const key = licenseKey.trim().toUpperCase();

  if (!isValidFormat(key)) {
    return { valid: false, error: 'Formato de licencia inválido.' };
  }

  const lic = await queryOne<License>(
    'SELECT * FROM licenses WHERE license_key = $1',
    [key]
  );

  if (!lic) {
    log('WARN', 'license', `Activación fallida - clave no encontrada: ${key.slice(0, 8)}...`);
    return { valid: false, error: 'Licencia no encontrada.' };
  }

  if (lic.product !== 'phantontweaks') {
    return { valid: false, error: 'Licencia no válida para este producto.' };
  }

  if (lic.status === 'revoked') {
    return { valid: false, error: 'Esta licencia ha sido revocada.' };
  }

  if (lic.status === 'suspended') {
    return { valid: false, error: 'Esta licencia está suspendida.' };
  }

  if (isExpired(lic)) {
    await query('UPDATE licenses SET status = $1, updated_at = NOW() WHERE id = $2', ['expired', lic.id]);
    return { valid: false, error: 'Esta licencia ha expirado.' };
  }

  const hwidHash = sha256(hwidRaw);

  if (lic.hwid && lic.hwid !== hwidHash) {
    log('WARN', 'license', `HWID mismatch: key=${key.slice(0,8)}... expected=${lic.hwid.slice(0,8)}... got=${hwidHash.slice(0,8)}...`);
    return { valid: false, error: 'Esta licencia ya está vinculada a otro dispositivo.' };
  }

  if (!lic.hwid && lic.activation_count >= lic.max_activations) {
    return { valid: false, error: 'Se ha alcanzado el número máximo de activaciones.' };
  }

  const expiry = computeExpiresAt(lic);

  await query(
    `UPDATE licenses
     SET hwid = COALESCE(hwid, $1),
         activation_count = activation_count + 1,
         last_validation = NOW(),
         last_ip = $2,
         last_version = $3,
         status = 'active',
         updated_at = NOW()
     WHERE id = $4`,
    [hwidHash, ip, version, lic.id]
  );

  const token = await createSession(lic.id, hwidHash, ip);

  const tokenExpiry = new Date(Date.now() + config.tokenExpiryHours * 3600000);

  log('SUCCESS', 'license', `Activación exitosa: ${key.slice(0,8)}... HWID=${hwidHash.slice(0,8)}...`);

  return {
    valid: true,
    license: {
      key: lic.license_key,
      product: lic.product,
      status: 'active',
      expires_at: expiry ? expiry.toISOString() : null,
      license_type: lic.license_type,
    },
    token,
    expires_at: tokenExpiry.toISOString(),
  };
}

export async function validateSession(
  token: string,
  hwidRaw: string,
  ip?: string
): Promise<{ valid: boolean; error?: string; license?: any }> {
  const hwidHash = sha256(hwidRaw);

  const session = await queryOne<any>(
    `SELECT s.id AS session_id, s.token, s.hwid, s.ip AS session_ip, s.expires_at, s.last_validated,
            l.id AS license_id, l.license_key, l.status, l.expires_at AS license_expires_at,
            l.license_type, l.offline_grace_days, l.product
     FROM sessions s
     JOIN licenses l ON l.id = s.license_id
     WHERE s.token = $1 AND s.hwid = $2`,
    [token, hwidHash]
  );

  if (!session) {
    return { valid: false, error: 'Sesión no válida.' };
  }

  if (new Date(session.expires_at) < new Date()) {
    return { valid: false, error: 'Sesión expirada.' };
  }

  if (session.status !== 'active') {
    return { valid: false, error: `Licencia ${session.status}.` };
  }

  if (session.license_expires_at && new Date(session.license_expires_at) < new Date()) {
    return { valid: false, error: 'Licencia expirada.' };
  }

  await query(
    'UPDATE sessions SET last_validated = NOW() WHERE id = $1',
    [session.session_id]
  );

  await query(
    'UPDATE licenses SET last_validation = NOW(), last_ip = $2 WHERE id = $1',
    [session.license_id, ip || '']
  );

  const licExpiry = session.license_expires_at ? new Date(session.license_expires_at) : null;

  return {
    valid: true,
    license: {
      key: session.license_key,
      product: session.product,
      status: session.status,
      expires_at: licExpiry ? licExpiry.toISOString() : null,
      license_type: session.license_type,
    },
  };
}

export async function deactivateLicense(
  licenseKey: string,
  hwidRaw: string
): Promise<{ ok: boolean; error?: string }> {
  const key = licenseKey.trim().toUpperCase();
  const hwidHash = sha256(hwidRaw);

  const lic = await queryOne<License>(
    'SELECT * FROM licenses WHERE license_key = $1',
    [key]
  );

  if (!lic) return { ok: false, error: 'Licencia no encontrada.' };
  if (lic.hwid !== hwidHash) return { ok: false, error: 'HWID no coincide.' };

  await query(
    `UPDATE licenses SET hwid = NULL, activation_count = GREATEST(activation_count - 1, 0), updated_at = NOW() WHERE id = $1`,
    [lic.id]
  );

  await query('DELETE FROM sessions WHERE license_id = $1', [lic.id]);

  log('INFO', 'license', `Desactivación: ${key.slice(0,8)}...`);
  return { ok: true };
}

async function createSession(licenseId: number, hwid: string, ip: string): Promise<string> {
  const crypto = await import('crypto');
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.tokenExpiryHours * 3600000);

  await query(
    'INSERT INTO sessions (license_id, token, hwid, ip, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [licenseId, token, hwid, ip, expiresAt.toISOString()]
  );

  return token;
}

export async function createLicense(opts: {
  licenseType: string;
  maxActivations?: number;
  sellauthOrderId?: string;
  sellauthCustomerId?: string;
  sellauthCustomerEmail?: string;
}): Promise<License> {
  const key = generateLicenseKey();
  const expiry = computeExpiry(opts.licenseType);
  const maxAct = opts.maxActivations || 1;

  const lic = await queryOne<License>(
    `INSERT INTO licenses
     (license_key, product, status, license_type, expires_at, max_activations,
      sellauth_order_id, sellauth_customer_id, sellauth_customer_email)
     VALUES ($1, 'phantontweaks', 'active', $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [key, opts.licenseType, expiry ? expiry.toISOString() : null, maxAct,
     opts.sellauthOrderId || null, opts.sellauthCustomerId || null, opts.sellauthCustomerEmail || null]
  );

  log('SUCCESS', 'license', `Licencia creada: ${key}`);
  return lic!;
}

export async function revokeLicense(licenseKey: string): Promise<{ ok: boolean; error?: string }> {
  const key = licenseKey.trim().toUpperCase();
  const result = await query(
    "UPDATE licenses SET status = 'revoked', updated_at = NOW() WHERE license_key = $1 RETURNING id",
    [key]
  );
  if (result.rowCount === 0) return { ok: false, error: 'Licencia no encontrada.' };
  await query('DELETE FROM sessions WHERE license_id = $1', [result.rows[0].id]);
  log('INFO', 'license', `Revocada: ${key}`);
  return { ok: true };
}

export async function suspendLicense(licenseKey: string): Promise<{ ok: boolean; error?: string }> {
  const key = licenseKey.trim().toUpperCase();
  const result = await query(
    "UPDATE licenses SET status = 'suspended', updated_at = NOW() WHERE license_key = $1 RETURNING id",
    [key]
  );
  if (result.rowCount === 0) return { ok: false, error: 'Licencia no encontrada.' };
  await query('DELETE FROM sessions WHERE license_id = $1', [result.rows[0].id]);
  log('INFO', 'license', `Suspendida: ${key}`);
  return { ok: true };
}

export async function reactivateLicense(licenseKey: string): Promise<{ ok: boolean; error?: string }> {
  const key = licenseKey.trim().toUpperCase();
  const result = await query(
    "UPDATE licenses SET status = 'active', updated_at = NOW() WHERE license_key = $1 AND status IN ('suspended','expired') RETURNING id",
    [key]
  );
  if (result.rowCount === 0) return { ok: false, error: 'Licencia no encontrada o ya activa.' };
  log('INFO', 'license', `Reactivada: ${key}`);
  return { ok: true };
}

export async function resetHwid(licenseKey: string): Promise<{ ok: boolean; error?: string }> {
  const key = licenseKey.trim().toUpperCase();
  const result = await query(
    'UPDATE licenses SET hwid = NULL, activation_count = 0, updated_at = NOW() WHERE license_key = $1 RETURNING id',
    [key]
  );
  if (result.rowCount === 0) return { ok: false, error: 'Licencia no encontrada.' };
  await query('DELETE FROM sessions WHERE license_id = $1', [result.rows[0].id]);
  log('INFO', 'license', `HWID reseteado: ${key}`);
  return { ok: true };
}

export async function updateExpiry(licenseKey: string, expiresAt: string | null): Promise<{ ok: boolean; error?: string }> {
  const key = licenseKey.trim().toUpperCase();
  const result = await query(
    'UPDATE licenses SET expires_at = $1, updated_at = NOW() WHERE license_key = $2 RETURNING id',
    [expiresAt, key]
  );
  if (result.rowCount === 0) return { ok: false, error: 'Licencia no encontrada.' };
  log('INFO', 'license', `Expiración actualizada: ${key} → ${expiresAt || 'lifetime'}`);
  return { ok: true };
}

export async function updateMaxActivations(licenseKey: string, max: number): Promise<{ ok: boolean; error?: string }> {
  const key = licenseKey.trim().toUpperCase();
  const result = await query(
    'UPDATE licenses SET max_activations = $1, updated_at = NOW() WHERE license_key = $2 RETURNING id',
    [max, key]
  );
  if (result.rowCount === 0) return { ok: false, error: 'Licencia no encontrada.' };
  return { ok: true };
}

export async function getLicense(licenseKey: string): Promise<License | null> {
  return queryOne<License>('SELECT * FROM licenses WHERE license_key = $1', [licenseKey.trim().toUpperCase()]);
}

export async function searchLicenses(search: string, limit = 50, offset = 0): Promise<License[]> {
  const pattern = `%${search}%`;
  const { rows } = await query<License>(
    `SELECT * FROM licenses
     WHERE license_key ILIKE $1 OR sellauth_customer_email ILIKE $1 OR hwid ILIKE $1 OR sellauth_order_id ILIKE $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [pattern, limit, offset]
  );
  return rows;
}

export async function listLicenses(limit = 50, offset = 0): Promise<License[]> {
  const { rows } = await query<License>(
    'SELECT * FROM licenses ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return rows;
}

export async function countLicenses(): Promise<Record<string, number>> {
  const { rows } = await query<{ status: string; count: string }>(
    'SELECT status, COUNT(*) as count FROM licenses GROUP BY status'
  );
  const counts: Record<string, number> = { total: 0 };
  for (const r of rows) {
    counts[r.status] = parseInt(r.count, 10);
    counts.total += parseInt(r.count, 10);
  }
  return counts;
}

export async function getLicenseByOrder(orderId: string): Promise<License | null> {
  return queryOne<License>('SELECT * FROM licenses WHERE sellauth_order_id = $1', [orderId]);
}

export async function logActivity(licenseKey: string, action: string, details?: string, ip?: string, hwid?: string) {
  await query(
    'INSERT INTO activity_log (license_key, action, details, ip, hwid) VALUES ($1, $2, $3, $4, $5)',
    [licenseKey, action, details || null, ip || null, hwid || null]
  );
}
