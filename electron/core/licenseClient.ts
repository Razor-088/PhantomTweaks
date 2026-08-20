import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { dataFile, ensureFile } from './paths';
import { log } from './logging';

const LICENSE_FILE = 'license.json';
const VALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SERVER_TIMEOUT_MS = 8000;

export interface LicenseData {
  licenseKey: string;
  token: string;
  expiresAt: string | null;
  licenseType: string;
  lastValidation: string;
  offlineGraceDays: number;
  status: 'active' | 'expired' | 'revoked' | 'suspended' | 'unknown';
}

interface LicenseResponse {
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

function getLicensePath(): string {
  return dataFile(LICENSE_FILE);
}

let localLicenseCache: LicenseData | null | undefined = undefined;

function readLocalLicense(): LicenseData | null {
  if (localLicenseCache !== undefined) return localLicenseCache;
  try {
    const raw = fs.readFileSync(getLicensePath(), 'utf-8');
    localLicenseCache = JSON.parse(raw);
  } catch {
    localLicenseCache = null;
  }
  return localLicenseCache ?? null;
}

function invalidateLicenseCache() {
  localLicenseCache = undefined;
}

function writeLocalLicense(data: LicenseData | null) {
  invalidateLicenseCache();
  try {
    if (data) {
      fs.writeFileSync(ensureFile(LICENSE_FILE), JSON.stringify(data, null, 2), 'utf-8');
    } else {
      try { fs.unlinkSync(getLicensePath()); } catch { /* ok */ }
    }
  } catch (err: any) {
    log('ERROR', 'license', `Error guardando licencia local: ${err.message}`);
  }
}

function execFileAsync(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: 'utf-8', timeout: 5000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

let cachedMachineId: string | null = null;

export async function getMachineId(): Promise<string> {
  if (cachedMachineId) return cachedMachineId;

  const parts: string[] = [];

  try {
    parts.push(os.hostname());
  } catch { /* ignore */ }

  try {
    const boardSerial = await execFileAsync('wmic', ['baseboard', 'get', 'serialnumber']);
    const match = boardSerial.match(/\S+/g);
    if (match && match.length > 1) parts.push(match[1]);
  } catch { /* ignore */ }

  try {
    const cpuId = await execFileAsync('wmic', ['cpu', 'get', 'ProcessorId']);
    const match = cpuId.match(/\S+/g);
    if (match && match.length > 1) parts.push(match[1]);
  } catch { /* ignore */ }

  if (parts.length === 0) {
    parts.push(os.platform(), os.arch(), String(os.cpus().length));
  }

  const raw = parts.join('|');
  cachedMachineId = crypto.createHash('sha256').update(raw).digest('hex');
  return cachedMachineId;
}

function getServerUrl(): string {
  // In production, this will be set via environment variable or config
  // For now, fallback to localhost for development
  return process.env.LICENSE_SERVER_URL || 'https://phantomtweaks-license-server.onrender.com';
}

async function serverRequest(endpoint: string, body: Record<string, any>): Promise<any> {
  const url = `${getServerUrl()}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return await response.json();
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado. Servidor no disponible.');
    }
    throw new Error('No se pudo conectar con el servidor de licencias.');
  }
}

export async function activateLicense(licenseKey: string): Promise<{ ok: boolean; error?: string; data?: LicenseData }> {
  try {
    const hwid = await getMachineId();
    const version = '1.0.0';

    const result: LicenseResponse = await serverRequest('/api/license/activate', {
      license_key: licenseKey,
      hwid,
      version,
    });

    if (!result.valid) {
      log('WARN', 'license', `Activación fallida: ${result.error}`);
      return { ok: false, error: result.error || 'Licencia inválida.' };
    }

    const data: LicenseData = {
      licenseKey: result.license!.key,
      token: result.token!,
      expiresAt: result.license!.expires_at,
      licenseType: result.license!.license_type,
      lastValidation: new Date().toISOString(),
      offlineGraceDays: 7,
      status: 'active',
    };

    writeLocalLicense(data);
    log('SUCCESS', 'license', `Licencia activada: ${result.license!.key}`);
    return { ok: true, data };

  } catch (err: any) {
    log('ERROR', 'license', `Error en activación: ${err.message}`);
    return { ok: false, error: err.message || 'Error de conexión.' };
  }
}

export async function validateLicense(): Promise<{ valid: boolean; error?: string; data?: LicenseData }> {
  const local = readLocalLicense();
  if (!local || local.status !== 'active') {
    return { valid: false, error: 'No hay licencia activa.' };
  }

  // Check offline grace period
  const lastValidation = new Date(local.lastValidation);
  const now = new Date();
  const daysSinceValidation = (now.getTime() - lastValidation.getTime()) / (1000 * 60 * 60 * 24);

  if (local.expiresAt) {
    const expiry = new Date(local.expiresAt);
    if (now > expiry) {
      local.status = 'expired';
      writeLocalLicense(local);
      return { valid: false, error: 'Tu licencia ha expirado.' };
    }
  }

  // If within grace period, allow offline
  if (daysSinceValidation < local.offlineGraceDays) {
    // Try online validation in background (don't block)
    serverRequest('/api/license/validate', { token: local.token, hwid: await getMachineId() })
      .then((result: any) => {
        if (result.valid) {
          local.lastValidation = new Date().toISOString();
          local.status = 'active';
          writeLocalLicense(local);
        } else {
          local.status = 'revoked';
          writeLocalLicense(local);
        }
      })
      .catch(() => { /* offline, keep current status */ });

    return { valid: true, data: local };
  }

  // Grace period exceeded — must validate online
  try {
    const hwid = await getMachineId();
    const result: LicenseResponse = await serverRequest('/api/license/validate', {
      token: local.token,
      hwid,
    });

    if (result.valid) {
      local.lastValidation = new Date().toISOString();
      local.status = 'active';
      if (result.license) {
        local.expiresAt = result.license.expires_at;
        local.licenseType = result.license.license_type;
      }
      writeLocalLicense(local);
      return { valid: true, data: local };
    } else {
      local.status = 'revoked';
      writeLocalLicense(local);
      return { valid: false, error: result.error || 'Licencia no válida.' };
    }
  } catch (err: any) {
    return { valid: false, error: 'Sin conexión y período de gracia expirado. Conéctate a Internet para validar.' };
  }
}

export async function deactivateLocal(): Promise<{ ok: boolean; error?: string }> {
  const local = readLocalLicense();
  if (!local) return { ok: false, error: 'No hay licencia local.' };

  try {
    const hwid = await getMachineId();
    await serverRequest('/api/license/deactivate', {
      license_key: local.licenseKey,
      hwid,
    });
  } catch { /* best effort */ }

  writeLocalLicense(null);
  log('INFO', 'license', 'Licencia desactivada localmente.');
  return { ok: true };
}

export function getLocalLicense(): LicenseData | null {
  return readLocalLicense();
}

export function isLicenseValid(): boolean {
  const local = readLocalLicense();
  if (!local || local.status !== 'active') return false;

  if (local.expiresAt && new Date(local.expiresAt) < new Date()) return false;

  const lastValidation = new Date(local.lastValidation);
  const daysSince = (Date.now() - lastValidation.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > local.offlineGraceDays + 1) return false;

  return true;
}

export function getLicenseStatus(): { valid: boolean; license: LicenseData | null; reason?: string } {
  const local = readLocalLicense();
  if (!local) return { valid: false, license: null, reason: 'no_license' };
  if (local.status === 'revoked') return { valid: false, license: local, reason: 'revoked' };
  if (local.status === 'suspended') return { valid: false, license: local, reason: 'suspended' };
  if (local.expiresAt && new Date(local.expiresAt) < new Date()) {
    return { valid: false, license: local, reason: 'expired' };
  }
  if (local.status !== 'active') return { valid: false, license: local, reason: local.status };
  return { valid: true, license: local };
}

// Async version that also validates against the server on startup
export async function getLicenseStatusAsync(): Promise<{ valid: boolean; license: LicenseData | null; reason?: string }> {
  const local = readLocalLicense();
  if (!local) return { valid: false, license: null, reason: 'no_license' };

  // Quick local checks first
  if (local.status === 'revoked') return { valid: false, license: local, reason: 'revoked' };
  if (local.status === 'suspended') return { valid: false, license: local, reason: 'suspended' };
  if (local.expiresAt && new Date(local.expiresAt) < new Date()) {
    return { valid: false, license: local, reason: 'expired' };
  }
  if (local.status !== 'active') return { valid: false, license: local, reason: local.status };

  // Local says valid — verify against server
  try {
    const hwid = await getMachineId();
    const result: LicenseResponse = await serverRequest('/api/license/validate', {
      token: local.token,
      hwid,
    });

    if (result.valid) {
      local.lastValidation = new Date().toISOString();
      if (result.license) {
        local.expiresAt = result.license.expires_at;
        local.licenseType = result.license.license_type;
      }
      writeLocalLicense(local);
      return { valid: true, license: local };
    } else {
      // Server says invalid — revoke locally
      local.status = 'revoked';
      writeLocalLicense(local);
      return { valid: false, license: local, reason: result.error || 'revoked' };
    }
  } catch {
    // Server unreachable — use offline grace period
    const lastValidation = new Date(local.lastValidation);
    const daysSince = (Date.now() - lastValidation.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= local.offlineGraceDays) {
      return { valid: true, license: local };
    }
    return { valid: false, license: local, reason: 'offline_expired' };
  }
}
