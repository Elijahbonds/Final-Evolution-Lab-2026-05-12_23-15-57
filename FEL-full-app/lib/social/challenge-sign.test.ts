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

// ---- CHALLENGE-SIGN-V2 (2026-10-19): the full payload is signed. Spec CHALLENGE-SIGN-NESTED §5, approved by Elijah.
import {
  CHALLENGE_MAX_CANONICAL_BYTES,
  CHALLENGE_V1_SUNSET_MS,
  ChallengePayloadError,
  canonicalV2,
  challengeVersionLive,
  verifyChallenge,
} from './challenge-sign';

const nested: ChallengePayload = {
  v: 2, modeKey: 'dunkContest', score: 46, tag: 'ATHLETE', ghost: [{ t: 0, kind: 'dunk1', court: 'venice' }, { t: 1.5, x: 2 }], t: 0,
};
// frozen golden vector, computed in node at main 2ab6a314 and re-checked at 239663df
const V1_GOLDEN: ChallengePayload = {
  v: 1, modeKey: 'dunkContest', score: 46, tag: 'ATHLETE', ghost: [{ t: 0, kind: 'dunk1', court: 'venice' }], t: 1760000000000,
};
const V1_GOLDEN_SIG = 'IFwnxTjmBC32aMymTtJksnW1AYeQMmUcu8msAGqmZKo';
const BEFORE_SUNSET = Date.UTC(2026, 9, 19, 12);

describe('challenge signing v2', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('1. a nested ghost tamper fails: court, kind, an added or removed moment key, reordered moments', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    const { payload: p, sig } = signPayload(nested);
    expect(p.v).toBe(2);
    expect(verifyPayload(p, sig)).toBe(true);
    const g = p.ghost;
    const tampers: ChallengePayload['ghost'][] = [
      [{ ...g[0], court: 'rucker' }, g[1]],
      [{ ...g[0], kind: 'dunk2' }, g[1]],
      [{ ...g[0], extra: 1 }, g[1]],
      [{ t: 0, kind: 'dunk1' }, g[1]],
      [g[1], g[0]],
      [g[0]],
    ];
    for (const ghost of tampers) expect(verifyPayload({ ...p, ghost }, sig)).toBe(false);
    for (const k of ['display', 'modeKey', 'tag'] as const) expect(verifyPayload({ ...p, [k]: 'X' }, sig)).toBe(false);
    expect(verifyPayload({ ...p, t: p.t + 1 }, sig)).toBe(false);
  });

  it('2. key order does not matter, and a JSON round trip (stands in for jsonb) still verifies', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    const a = { v: 2, modeKey: 'm', score: 3, tag: 'T', ghost: [{ t: 0, kind: 'k', court: 'c' }], t: 5 };
    const b = { t: 5, ghost: [{ court: 'c', t: 0, kind: 'k' }], tag: 'T', score: 3, modeKey: 'm', v: 2 };
    expect(canonicalV2(a)).toBe(canonicalV2(b));
    expect(canonicalV2(a)).toBe('{"ghost":[{"court":"c","kind":"k","t":0}],"modeKey":"m","score":3,"t":5,"tag":"T","v":2}');
    expect(canonicalV2({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalV2([3, 1, 2])).toBe('[3,1,2]');
    const { payload: p, sig } = signPayload({ ...nested, display: undefined });
    expect(verifyPayload(JSON.parse(JSON.stringify(p)), sig)).toBe(true);
    const shuffled = JSON.parse(JSON.stringify(p, Object.keys(p).reverse())) as ChallengePayload;
    shuffled.ghost = p.ghost.map((m) => Object.fromEntries(Object.entries(m).reverse()) as typeof m);
    expect(verifyPayload(shuffled, sig)).toBe(true);
  });

  it('3. numbers: -0 is 0, NaN/Infinity throw at sign and fail verify, floats quantise, score/t must be safe integers', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    expect(canonicalV2(-0)).toBe(canonicalV2(0));
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => canonicalV2(bad)).toThrow(ChallengePayloadError);
      expect(() => signPayload({ ...nested, ghost: [{ t: bad }] })).toThrow(ChallengePayloadError);
    }
    const { payload: p, sig } = signPayload({ ...nested, ghost: [{ t: 0.123456789, x: -0.0004, y: 1 / 3 }] });
    expect(p.ghost[0]).toEqual({ t: 0.123, x: -0, y: 0.333 });
    expect(verifyPayload(JSON.parse(JSON.stringify(p)), sig)).toBe(true);
    expect(verifyPayload({ ...p, ghost: [{ t: NaN }] }, sig)).toBe(false);
    expect(verifyPayload({ ...p, score: Infinity }, sig)).toBe(false);
    expect(() => signPayload({ ...nested, score: 46.5 })).toThrow(ChallengePayloadError);
    expect(() => signPayload({ ...nested, score: 2 ** 60 })).toThrow(ChallengePayloadError);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1.5); // fake timers floor the clock, so stub Date.now directly
    expect(() => signPayload(nested)).toThrow(/t must be a safe integer/);
    now.mockRestore();
  });

  it('3b. other types throw, and \\u0000 is refused', () => {
    expect(() => canonicalV2(() => 1)).toThrow(ChallengePayloadError);
    expect(() => canonicalV2(BigInt(1))).toThrow(ChallengePayloadError);
    expect(() => canonicalV2(Symbol('s'))).toThrow(ChallengePayloadError);
    expect(() => canonicalV2(new Date(0))).toThrow(ChallengePayloadError);
    expect(() => canonicalV2('a\u0000b')).toThrow(ChallengePayloadError);
    expect(canonicalV2({ s: 'é"\n', n: null, b: false })).toBe('{"b":false,"n":null,"s":"é\\"\\n"}');
  });

  it('4. the v1 golden vector still verifies (frozen canonicalV1, same secret and precedence)', () => {
    vi.useFakeTimers({ now: BEFORE_SUNSET });
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    expect(verifyPayload(V1_GOLDEN, V1_GOLDEN_SIG)).toBe(true);
    expect(verifyPayload(JSON.parse(JSON.stringify(V1_GOLDEN)), V1_GOLDEN_SIG)).toBe(true);
  });

  it('5. v1 hands back only what it signed, a tampered v1 score fails, and v1 sunsets after Jan 31, 2027 PT', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    vi.useFakeTimers({ now: BEFORE_SUNSET });
    const trusted = verifyChallenge(V1_GOLDEN, V1_GOLDEN_SIG);
    expect(trusted?.ghost).toEqual([{ t: 0 }]);
    expect(trusted?.score).toBe(46);
    expect(verifyPayload({ ...V1_GOLDEN, score: 47 }, V1_GOLDEN_SIG)).toBe(false);
    // nested v1 data was never signed: it still verifies, and is still dropped from what callers get
    expect(verifyChallenge({ ...V1_GOLDEN, ghost: [{ t: 0, court: 'rucker' }] }, V1_GOLDEN_SIG)?.ghost).toEqual([{ t: 0 }]);
    // the cutoff: the last millisecond of Jan 31, 2027 PST still verifies; Feb 1, 00:00 PST does not
    expect(CHALLENGE_V1_SUNSET_MS).toBe(Date.parse('2027-02-01T00:00:00-08:00'));
    vi.setSystemTime(Date.parse('2027-01-31T23:59:59.999-08:00'));
    expect(verifyPayload(V1_GOLDEN, V1_GOLDEN_SIG)).toBe(true);
    expect(challengeVersionLive(V1_GOLDEN)).toBe(true);
    vi.setSystemTime(CHALLENGE_V1_SUNSET_MS);
    expect(verifyPayload(V1_GOLDEN, V1_GOLDEN_SIG)).toBe(false);
    expect(challengeVersionLive(V1_GOLDEN)).toBe(false);
    // v2 is not sunset
    const { payload: p, sig } = signPayload(nested);
    expect(verifyPayload(p, sig)).toBe(true);
    expect(challengeVersionLive(p)).toBe(true);
    expect(challengeVersionLive({ v: 3 })).toBe(false);
    expect(challengeVersionLive(null)).toBe(false);
  });

  it('6. no downgrade: a v2 sig with v rewritten to 1, or a v1 sig presented as v2, fails; unknown versions fail', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    vi.useFakeTimers({ now: BEFORE_SUNSET });
    const { payload: p, sig } = signPayload(nested);
    expect(verifyPayload({ ...p, v: 1 }, sig)).toBe(false);
    expect(verifyPayload({ ...V1_GOLDEN, v: 2 }, V1_GOLDEN_SIG)).toBe(false);
    for (const v of [0, 3, '2' as unknown as number, undefined as unknown as number]) expect(verifyPayload({ ...p, v }, sig)).toBe(false);
  });

  it('9. size: realistic 40 moments fit; exactly 4096 B signs, 4097 B refuses to sign and fails verify', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    const forty = Array.from({ length: 40 }, (_, i) => ({ t: i * 0.125, kind: 'dunk1', court: 'venice' }));
    const { payload: p, sig } = signPayload({ ...nested, ghost: forty });
    expect(Buffer.byteLength(canonicalV2(p))).toBeLessThan(CHALLENGE_MAX_CANONICAL_BYTES);
    expect(verifyPayload(p, sig)).toBe(true);
    vi.useFakeTimers({ now: BEFORE_SUNSET });
    const base = { ...nested, ghost: [] as ChallengePayload['ghost'] };
    const sized = (bytes: number) => {
      const stamped = { ...base, v: 2, t: BEFORE_SUNSET };
      const pad = bytes - Buffer.byteLength(canonicalV2({ ...stamped, display: '' }));
      return { ...base, display: 'd'.repeat(pad) };
    };
    const at = signPayload(sized(CHALLENGE_MAX_CANONICAL_BYTES));
    expect(Buffer.byteLength(canonicalV2(at.payload))).toBe(CHALLENGE_MAX_CANONICAL_BYTES);
    expect(verifyPayload(at.payload, at.sig)).toBe(true);
    expect(() => signPayload(sized(CHALLENGE_MAX_CANONICAL_BYTES + 1))).toThrow(/size cap/);
    // a row 1 byte over fails verify before any HMAC, even with a sig made over it by the right key
    const over = { ...at.payload, display: at.payload.display + 'd' };
    const crypto = require('node:crypto') as typeof import('node:crypto');
    const forgedSig = crypto.createHmac('sha256', 'test-secret-a').update('fel-challenge:v2\n' + canonicalV2(over)).digest('base64url');
    expect(verifyPayload(over, forgedSig)).toBe(false);
  });

  it('10. compare hygiene: wrong-length, non-base64url, non-canonical or empty sigs are false with no throw', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    const { payload: p, sig } = signPayload(nested);
    const lastAlt = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    for (const bad of ['', sig.slice(0, -1), sig + 'A', sig.slice(0, -2) + '+/', `${sig.slice(0, -1)}=`, lastAlt, null, 42]) {
      expect(() => verifyPayload(p, bad as string)).not.toThrow();
      expect(verifyPayload(p, bad as string)).toBe(false);
    }
    expect(verifyPayload(null as unknown as ChallengePayload, sig)).toBe(false);
  });

  it('11. the secret is unchanged: NEXTAUTH_SECRET beats CHALLENGE_SIGN_SECRET when both are set', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    vi.stubEnv('CHALLENGE_SIGN_SECRET', 'test-challenge-secret');
    const { payload: p, sig } = signPayload(nested);
    vi.stubEnv('CHALLENGE_SIGN_SECRET', 'something-else');
    expect(verifyPayload(p, sig)).toBe(true);
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-b');
    vi.stubEnv('CHALLENGE_SIGN_SECRET', 'test-challenge-secret');
    expect(verifyPayload(p, sig)).toBe(false);
  });
});
