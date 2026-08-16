import * as crypto from 'crypto';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SEGMENT_LEN = 4;
const SEGMENTS = 4;
const PREFIX = 'PHNT';

export function generateLicenseKey(): string {
  const segments: string[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const bytes = crypto.randomBytes(SEGMENT_LEN);
    let seg = '';
    for (let j = 0; j < SEGMENT_LEN; j++) {
      seg += CHARS[bytes[j] % CHARS.length];
    }
    segments.push(seg);
  }
  return `${PREFIX}-${segments.join('-')}`;
}

export function isValidFormat(key: string): boolean {
  return /^PHNT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}
