/**
 * CELL secret encryption (Phase 2).
 *
 * User-supplied provider API keys are encrypted at rest with AES-256-GCM using a
 * key derived from NEXTAUTH_SECRET. Plaintext keys are NEVER stored or returned
 * to the client — only an encrypted blob and a 4-char hint for display.
 */
import crypto from 'crypto';

function deriveKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET || 'cell-fallback-secret-change-me';
  // 32-byte key from the app secret
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/** Encrypt a plaintext string → base64(iv | tag | ciphertext). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decrypt a base64(iv | tag | ciphertext) blob → plaintext, or '' on failure. */
export function decryptSecret(blob: string): string {
  try {
    const raw = Buffer.from(blob, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}

/** Last 4 chars of a key for masked display. */
export function keyHint(plain: string): string {
  const s = String(plain || '');
  return s.length <= 4 ? s : s.slice(-4);
}
