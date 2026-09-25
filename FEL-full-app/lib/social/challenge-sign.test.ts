import { afterEach, describe, expect, it, vi } from 'vitest';

// Challenge signing fails closed (2026-09-24), like lib/cell-crypto.ts: no literal fallback secret. A server with
// neither NEXTAUTH_SECRET nor CHALLENGE_SIGN_SECRET used to sign with a string that is in the repo, so a forged
// /c/<code> challenge with any score would have verified.

import { ChallengeSecretMissingError, signPayload, verifyPayload } from './challenge-sign';
import type { ChallengePayload } from './challenge-link-core';

const payload: ChallengePayload = { v: 1, modeKey: 'dunkContest', score: 46, tag: 'ATHLETE', ghost: [], t: 0 };

afterEach(() => { vi.unstubAllEnvs(); });

describe('challenge link signing', () => {
  it('signs and verifies under NEXTAUTH_SECRET, and a tampered score or another secret does not verify', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    const { payload: stamped, sig, code } = signPayload(payload);
    expect(stamped.t).toBeGreaterThan(0);
    expect(code).toHaveLength(16);
    expect(verifyPayload(stamped, sig)).toBe(true);
    expect(verifyPayload({ ...stamped, score: 99 }, sig)).toBe(false);
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-b');
    expect(verifyPayload(stamped, sig)).toBe(false);
  });

  it('uses CHALLENGE_SIGN_SECRET when NEXTAUTH_SECRET is unset', () => {
    vi.stubEnv('NEXTAUTH_SECRET', '');
    vi.stubEnv('CHALLENGE_SIGN_SECRET', 'test-challenge-secret');
    const { payload: stamped, sig } = signPayload(payload);
    expect(verifyPayload(stamped, sig)).toBe(true);
  });

  it('refuses to sign or verify with no secret, rather than using a literal anyone can read', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    const { payload: stamped, sig } = signPayload(payload);
    for (const unset of ['', undefined]) {
      vi.stubEnv('NEXTAUTH_SECRET', unset);
      vi.stubEnv('CHALLENGE_SIGN_SECRET', unset);
      expect(() => signPayload(payload)).toThrow(ChallengeSecretMissingError);
      // not answered as "forged": a missing secret is a config error the caller must see
      expect(() => verifyPayload(stamped, sig)).toThrow(/CHALLENGE_SIGN_SECRET is set/);
    }
  });
});
