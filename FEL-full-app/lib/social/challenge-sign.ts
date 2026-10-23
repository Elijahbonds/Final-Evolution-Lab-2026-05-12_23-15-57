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

/** A payload that cannot be signed (non-finite number, unsafe score/t, bad type, `\u0000`, over the size cap). The
 *  mint route answers 400 for it. */
export class ChallengePayloadError extends Error {
  constructor(why: string) {
    super(`challenge payload rejected: ${why}`);
    this.name = 'ChallengePayloadError';
  }
}

/**
 * CHALLENGE-SIGN-V2 (2026-10-19, spec CHALLENGE-SIGN-NESTED, approved by Elijah). v1 signed `canonicalV1`, whose array
 * replacer is a key allow-list at EVERY depth, so nested ghost keys (`kind`, `court`, markers) were never signed. v2
 * signs the full payload. v1 rows keep verifying, score trusted and nested data not, up to and including Sunday
 * Jan 31, 2027 PT (owner's date); from Feb 1, 2027 00:00 PST v1 fails closed. v1 rows are never re-signed.
 */
export const CHALLENGE_V1_SUNSET_MS = Date.UTC(2027, 1, 1, 8, 0, 0); // 2027-02-01T00:00:00-08:00 (PST)
/** UTF-8 bytes of canonicalV2(payload). Over it: mint refuses, verify is false before any HMAC. */
export const CHALLENGE_MAX_CANONICAL_BYTES = 4096;
const V2_DOMAIN = 'fel-challenge:v2\n';

/** v1 canonical form, FROZEN: byte-identical to the pre-v2 function (golden vector in challenge-sign.test.ts). */
function canonicalV1(p: ChallengePayload): string {
  return JSON.stringify(p, Object.keys(p).sort());
}

/** v2 canonical form: keys sorted (UTF-16 code units) at every depth, `undefined` values dropped, array order kept,
 *  finite numbers only (`-0` -> `0`), no `\u0000` in strings. Anything else throws ChallengePayloadError. */
export function canonicalV2(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ChallengePayloadError('non-finite number');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value === 'string') {
    if (value.includes('\u0000')) throw new ChallengePayloadError('\\u0000 in a string');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalV2).join(',')}]`;
  const proto = typeof value === 'object' ? Object.getPrototypeOf(value) : undefined;
  if (proto === Object.prototype || proto === null) {
    const o = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const k of Object.keys(o).sort()) {
      if (o[k] === undefined) continue;
      if (k.includes('\u0000')) throw new ChallengePayloadError('\\u0000 in a key');
      parts.push(`${JSON.stringify(k)}:${canonicalV2(o[k])}`);
    }
    return `{${parts.join(',')}}`;
  }
  throw new ChallengePayloadError(`unsupported type ${typeof value}`);
}

/** Ghost floats are quantised to 3 decimals at mint so a Postgres jsonb round trip returns the same doubles. */
function quantise(n: unknown): unknown {
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 1000) / 1000 : n;
}

function hmac(key: string, input: string): string {
  return crypto.createHmac('sha256', key).update(input).digest('base64url');
}

/** Strict base64url of exactly 32 bytes (canonical encoding only), else null. Never throws. */
function sigBytes(sig: unknown): Buffer | null {
  if (typeof sig !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return null;
  const b = Buffer.from(sig, 'base64url');
  return b.length === 32 && b.toString('base64url') === sig ? b : null;
}

function sigMatches(expected: string, sig: unknown): boolean {
  const a = sigBytes(expected);
  const b = sigBytes(sig);
  return !!a && !!b && crypto.timingSafeEqual(a, b);
}

/** Cheap version gate with no secret and no HMAC, for pages that render from the columns: v2 is live, v1 is live
 *  until the sunset, anything else is not. */
export function challengeVersionLive(payload: unknown, now: number = Date.now()): boolean {
  const v = (payload as { v?: unknown } | null | undefined)?.v;
  if (v === 2) return true;
  if (v === 1) return now < CHALLENGE_V1_SUNSET_MS;
  return false;
}

/** Sign a payload as v2, stamping the real server time. Returns sig + short code. Throws ChallengePayloadError for a
 *  payload that cannot be signed (see canonicalV2, plus: score and t must be safe integers, size cap). */
export function signPayload(payload: ChallengePayload): { payload: ChallengePayload; sig: string; code: string } {
  const key = secret();
  const stamped: ChallengePayload = {
    ...payload,
    v: 2,
    ghost: (payload.ghost ?? []).map((m) => Object.fromEntries(Object.entries(m).map(([k, n]) => [k, quantise(n)])) as typeof m),
    t: Date.now(),
  };
  if (!Number.isSafeInteger(stamped.score)) throw new ChallengePayloadError('score must be a safe integer');
  if (!Number.isSafeInteger(stamped.t)) throw new ChallengePayloadError('t must be a safe integer');
  const canon = canonicalV2(stamped);
  if (Buffer.byteLength(canon, 'utf8') > CHALLENGE_MAX_CANONICAL_BYTES) throw new ChallengePayloadError('over the size cap');
  const sig = hmac(key, V2_DOMAIN + canon);
  const code = crypto
    .createHash('sha256')
    .update(sig)
    .digest('base64url')
    .slice(0, 16);
  return { payload: stamped, sig, code };
}

/**
 * Verify a stored payload and return only what its signature actually covers, or null (forged, corrupt, unknown
 * version, v1 past the sunset). v2: the payload as stored. v1: `parse(canonicalV1(payload))`, so each ghost moment is
 * reduced to `{t}` (plus any key that shares a top-level name): consumers default `kind`/`court`. Throws
 * ChallengeSecretMissingError when no secret is set: the secret is read outside the try so a config error is never
 * mistaken for a forged link.
 */
export function verifyChallenge(payload: ChallengePayload, sig: string, now: number = Date.now()): ChallengePayload | null {
  const key = secret();
  try {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.v === 2) {
      const canon = canonicalV2(payload);
      if (Buffer.byteLength(canon, 'utf8') > CHALLENGE_MAX_CANONICAL_BYTES) return null;
      return sigMatches(hmac(key, V2_DOMAIN + canon), sig) ? payload : null;
    }
    if (payload.v === 1) {
      if (now >= CHALLENGE_V1_SUNSET_MS) return null;
      const canon = canonicalV1(payload);
      return sigMatches(hmac(key, canon), sig) ? (JSON.parse(canon) as ChallengePayload) : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Verify a payload against its signature (see verifyChallenge). */
export function verifyPayload(payload: ChallengePayload, sig: string): boolean {
  return verifyChallenge(payload, sig) !== null;
}
