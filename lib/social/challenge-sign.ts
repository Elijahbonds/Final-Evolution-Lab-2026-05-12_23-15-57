/**
 * lib/social/challenge-sign.ts
 * ============================
 * M13 Step 4 — server signs + stamps challenge payloads so a share link
 * cannot be forged (a tampered score would poison the K-factor funnel and the
 * ghost duel). HMAC-SHA256 over the canonical JSON, keyed by the server
 * secret. The signature travels alongside the payload; the code stored in the
 * DB is a short content hash used as the public /c/<code> id.
 */

import crypto from 'node:crypto';
import type { ChallengePayload } from './challenge-link-core';

function secret(): string {
  return process.env.NEXTAUTH_SECRET || process.env.CHALLENGE_SIGN_SECRET || 'fel-dev-challenge-secret';
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

/** Verify a payload against its signature. */
export function verifyPayload(payload: ChallengePayload, sig: string): boolean {
  try {
    const expected = crypto.createHmac('sha256', secret()).update(canonical(payload)).digest('base64url');
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
