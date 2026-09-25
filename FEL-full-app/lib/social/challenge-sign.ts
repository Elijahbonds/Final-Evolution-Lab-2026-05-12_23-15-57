/**
 * lib/social/challenge-sign.ts
 * ============================
 * M13 Step 4 — server signs + stamps challenge payloads so a share link
 * cannot be forged (a tampered score would poison the K-factor funnel and the
 * ghost duel). HMAC-SHA256 over the canonical JSON, keyed by the server
 * secret. The signature travels alongside the payload; the code stored in the
 * DB is a short content hash used as the public /c/<code> id.
 *
 * HOTFIX (2026-09-24): FAILS CLOSED, like lib/cell-crypto.ts. With neither secret set this used to sign with a literal
 * that is in the repo, so anyone could forge a signed /c/<code> challenge with any score. There is no fallback now:
 * signing or verifying without a secret throws ChallengeSecretMissingError. It throws at use time, never at import.
 */

import crypto from 'node:crypto';
import type { ChallengePayload } from './challenge-link-core';

export class ChallengeSecretMissingError extends Error {
  constructor() {
    super('Neither NEXTAUTH_SECRET nor CHALLENGE_SIGN_SECRET is set: challenge links cannot be signed or verified (lib/social/challenge-sign.ts)');
    this.name = 'ChallengeSecretMissingError';
  }
}

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.CHALLENGE_SIGN_SECRET;
  if (!s) throw new ChallengeSecretMissingError();
  return s;
}

/** Canonical stable stringify (sorted keys) so signing is deterministic. */
function canonical(p: ChallengePayload): string {
  return JSON.stringify(p, Object.keys(p).sort());
}

/** Sign a payload, stamping the real server time. Returns sig + short code. */
export function signPayload(payload: ChallengePayload): { payload: ChallengePayload; sig: string; code: string } {
  const stamped: ChallengePayload = { ...payload, t: Date.now() };
  const sig = crypto.createHmac('sha256', secret()).update(canonical(stamped)).digest('base64url');
  const code = crypto
    .createHash('sha256')
    .update(sig)
    .digest('base64url')
    .slice(0, 16);
  return { payload: stamped, sig, code };
}

/** Verify a payload against its signature. Throws ChallengeSecretMissingError when no secret is set: the secret is
 *  read outside the try so a config error is never mistaken for a forged link. */
export function verifyPayload(payload: ChallengePayload, sig: string): boolean {
  const key = secret();
  try {
    const expected = crypto.createHmac('sha256', key).update(canonical(payload)).digest('base64url');
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
