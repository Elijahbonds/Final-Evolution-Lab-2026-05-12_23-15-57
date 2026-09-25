/**
 * CELL secret encryption (Phase 2).
 *
 * User-supplied provider API keys are encrypted at rest with AES-256-GCM using a
 * key derived from NEXTAUTH_SECRET. Plaintext keys are NEVER stored or returned
 * to the client — only an encrypted blob and a 4-char hint for display.
 *
 * HOTFIX (2026-09-24): FAILS CLOSED. With NEXTAUTH_SECRET unset this used to fall back to a literal that is in the
 * repo, so every key stored by a misconfigured server was encrypted under a secret anyone can read. There is no
 * fallback now: using Cell crypto without the secret throws CellSecretMissingError. It throws when a key is actually
 * derived, not at import, so a build or a page that never touches Cell keys is unaffected by the env.
 */
import crypto from 'crypto';

export class CellSecretMissingError extends Error {
  constructor() {
    super('NEXTAUTH_SECRET is not set: Cell provider keys cannot be encrypted or decrypted without it (lib/cell-crypto.ts)');
    this.name = 'CellSecretMissingError';
  }
}

function deriveKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new CellSecretMissingError();
  // 32-byte key from the app secret
  return crypto.createHash('sha256').update(secret).digest();
}

/** Encrypt a plaintext string → base64(iv | tag | ciphertext). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decrypt a base64(iv | tag | ciphertext) blob → plaintext, or '' on a bad blob. Throws CellSecretMissingError when
 *  the secret is unset: the key is derived outside the try so a config error is never mistaken for a corrupt blob. */
export function decryptSecret(blob: string): string {
  const key = deriveKey();
  try {
    const raw = Buffer.from(blob, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
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
