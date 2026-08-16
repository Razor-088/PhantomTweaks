import * as crypto from 'crypto';

const SALT_LEN = 16;
const KEY_LEN = 64;

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN).toString('hex');
  const derived = crypto.scryptSync(password, salt, KEY_LEN);
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, KEY_LEN);
  return constantTimeCompare(derived.toString('hex'), hash);
}

export function generateToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return constantTimeCompare(hmac, signature);
}
