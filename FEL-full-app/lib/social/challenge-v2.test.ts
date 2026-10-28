// CHALLENGE-SIGN-V2 (2026-10-19), spec CHALLENGE-SIGN-NESTED §5 tests 5, 7, 8, 9: the service, the mint route and the
// /c/<code> page, DRIVEN with the database stood in for (an in-memory ChallengeLink table). The signer itself is
// covered in challenge-sign.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next-auth', () => ({ getServerSession: async () => null }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async () => undefined }));
vi.mock('@/components/public-chrome', () => ({ PublicTopBar: () => null, PublicLegalFooter: () => null }));
vi.mock('@/components/challenge-landing', () => ({
  ChallengeLanding: (p: { score: number; tag: string }) => createElement('div', null, `LANDING ${p.tag} ${p.score}`),
}));

type Row = Record<string, any>;
const rows = new Map<string, Row>();
vi.mock('@/lib/db', () => ({
  prisma: {
    challengeLink: {
      // jsonb stand-in: the payload is stored as a JSON round trip, the way Postgres hands it back
      create: async ({ data }: { data: Row }) => {
        const row = { ...data, payload: JSON.parse(JSON.stringify(data.payload)), opened: 0, attempted: 0, beaten: 0 };
        rows.set(data.code, row);
        return row;
      },
      findUnique: async ({ where }: { where: { code: string } }) => rows.get(where.code) ?? null,
      update: async ({ where }: { where: { code: string } }) => rows.get(where.code),
    },
  },
}));

import { mintChallenge, resolveAttempt } from './challenge-service';
import { CHALLENGE_MAX_CANONICAL_BYTES, CHALLENGE_V1_SUNSET_MS, canonicalV2 } from './challenge-sign';
import { POST as mintPOST } from '@/app/api/challenge/mint/route';

const NOW = Date.UTC(2026, 9, 19, 12);
const V1_ROW = {
  code: 'v1goldenrow00000', ownerUserId: null, modeKey: 'dunkContest', score: 46, display: null, tag: 'ATHLETE',
  payload: { v: 1, modeKey: 'dunkContest', score: 46, tag: 'ATHLETE', ghost: [{ t: 0, kind: 'dunk1', court: 'venice' }], t: 1760000000000 },
  sig: 'IFwnxTjmBC32aMymTtJksnW1AYeQMmUcu8msAGqmZKo', opened: 0, attempted: 0, beaten: 0,
};

beforeEach(() => {
  rows.clear();
  vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

async function mint(body: unknown) {
  const res = await mintPOST(new Request('http://x/api/challenge/mint', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}

/** Moments whose stored payload canonicalises to exactly `bytes` (strings <= 32, <= 8 extra keys per moment). */
function momentsFor(bytes: number, modeKey: string, score: number) {
  const ghost: Record<string, number | string>[] = [];
  const size = () => Buffer.byteLength(canonicalV2({ v: 2, modeKey, score, tag: 'ATHLETE', ghost, t: NOW }));
  let m: Record<string, number | string> = { t: 0 };
  ghost.push(m);
  let keys = 0;
  for (;;) {
    const r = bytes - size();
    if (r <= 0) break;
    if (keys === 8) { m = { t: ghost.length }; ghost.push(m); keys = 0; continue; }
    const k = `k${keys++}`;                                // adds `,"kN":"<s>"` = 8 + s bytes
    if (r <= 40) m[k] = 'x'.repeat(r - 8);
    else if (r < 48) m[k] = 'x'.repeat(r - 16);            // leave exactly 8 for an empty-string key
    else m[k] = 'x'.repeat(32);
  }
  return ghost;
}

describe('CHALLENGE-SIGN-V2: service', () => {
  it('7. mint -> the row is v2 -> resolveAttempt verifies, targetScore is the payload score, the rematch row is v2', async () => {
    const minted = await mintChallenge({ modeKey: 'dunkContest', score: 40, keyMoments: [{ t: 0, kind: 'dunk1', court: 'venice' }] });
    const row = rows.get(minted.code)!;
    expect(row.payload.v).toBe(2);
    expect(row.payload.ghost).toEqual([{ t: 0, kind: 'dunk1', court: 'venice' }]);
    // CHALLENGES-2 (test changed): a signed-in winner. A guest's win no longer mints an ownerless rematch (owner: a guest
    // signs up to rematch), and this test is about the rematch row's signature, so it plays as an account.
    const r = await resolveAttempt({ code: minted.code, attemptScore: 50, attemptTag: 'ME', userId: 'u1' });
    if (!r || r === 'expired') throw new Error('resolved');
    expect(r?.targetScore).toBe(40);
    expect(r?.beat).toBe(true);
    expect(rows.get(r!.rematch!.code)!.payload.v).toBe(2);
    expect(((await resolveAttempt({ code: r!.rematch!.code, attemptScore: 1 })) as { targetScore: number }).targetScore).toBe(50);
  });

  it('7b. a nested ghost edit on a stored v2 row is forged (null), where v1 would have let it through', async () => {
    const minted = await mintChallenge({ modeKey: 'dunkContest', score: 40, keyMoments: [{ t: 0, kind: 'dunk1', court: 'venice' }] });
    rows.get(minted.code)!.payload.ghost[0].court = 'rucker';
    expect(await resolveAttempt({ code: minted.code, attemptScore: 50 })).toBeNull();
  });

  it('8. a row whose score, tag, modeKey or display column differs from the payload resolves null', async () => {
    const edits: [string, unknown][] = [['score', 1], ['tag', 'OTHER'], ['modeKey', 'threePoint'], ['display', 'shown'], ['display', '']];
    for (const [col, val] of edits) {
      const minted = await mintChallenge({ modeKey: 'dunkContest', score: 40 + edits.findIndex((e) => e[1] === val) });
      expect(await resolveAttempt({ code: minted.code, attemptScore: 0 })).not.toBeNull();
      rows.get(minted.code)![col] = val;
      expect(await resolveAttempt({ code: minted.code, attemptScore: 0 })).toBeNull();
    }
    const withDisplay = await mintChallenge({ modeKey: 'dunkContest', score: 7, display: 'Windmill' });
    expect(await resolveAttempt({ code: withDisplay.code, attemptScore: 0 })).not.toBeNull();
    rows.get(withDisplay.code)!.display = null;
    expect(await resolveAttempt({ code: withDisplay.code, attemptScore: 0 })).toBeNull();
  });

  it('5. a v1 row resolves on its signed score until the sunset, then 404s (null)', async () => {
    rows.set(V1_ROW.code, structuredClone(V1_ROW));
    const r = await resolveAttempt({ code: V1_ROW.code, attemptScore: 10 });
    expect(r?.targetScore).toBe(46);
    expect(r?.vs).toBe('ATHLETE');
    rows.get(V1_ROW.code)!.payload.score = 10;
    expect(await resolveAttempt({ code: V1_ROW.code, attemptScore: 50 })).toBeNull(); // tampered v1 score
    rows.set(V1_ROW.code, structuredClone(V1_ROW));
    vi.setSystemTime(CHALLENGE_V1_SUNSET_MS);
    expect(await resolveAttempt({ code: V1_ROW.code, attemptScore: 10 })).toBeNull();
  });
});

describe('CHALLENGE-SIGN-V2: /c/<code> page', () => {
  async function page(code: string) {
    const { default: ChallengePage } = await import('@/app/c/[code]/page');
    return renderToStaticMarkup(await ChallengePage({ params: { code } }));
  }

  it('5. a v1 row renders until Jan 31, 2027 PT, then shows the invalid-or-expired copy; v2 always renders', async () => {
    rows.set(V1_ROW.code, structuredClone(V1_ROW));
    const v2 = await mintChallenge({ modeKey: 'dunkContest', score: 33 });
    vi.setSystemTime(CHALLENGE_V1_SUNSET_MS - 1);
    expect(await page(V1_ROW.code)).toContain('LANDING ATHLETE 46');
    vi.setSystemTime(CHALLENGE_V1_SUNSET_MS);
    const expired = await page(V1_ROW.code);
    expect(expired).toContain('This challenge link is invalid or has expired.');
    expect(expired).not.toContain('LANDING');
    expect(await page(v2.code)).toContain('LANDING ATHLETE 33');
    rows.get(v2.code)!.payload.v = 9;
    expect(await page(v2.code)).toContain('This challenge link is invalid or has expired.');
  });
});

describe('CHALLENGE-SIGN-V2: mint route', () => {
  const ok = { modeKey: 'dunkContest', score: 46 };

  it('9. strict moments: a nested object/array, a 33-char string, a 9th extra key, a bad key, a non-finite t -> 400', async () => {
    const eight = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`k${i}`, i]));
    expect((await mint({ ...ok, keyMoments: [{ t: 0, ...eight }] })).status).toBe(200);
    expect((await mint({ ...ok, keyMoments: [{ t: 0, s: 'x'.repeat(32), b: true, n: 1.5 }] })).status).toBe(200);
    const bad = [
      { t: 0, nested: { a: 1 } },
      { t: 0, arr: [1] },
      { t: 0, s: 'x'.repeat(33) },
      { t: 0, ...eight, k8: 1 },
      { t: 0, '1bad': 1 },
      { t: 0, _x: 1 },
      { t: 0, ['k'.repeat(25)]: 1 },
      { t: 0, nul: null },
      { t: '0' },
      {},
    ];
    for (const m of bad) expect((await mint({ ...ok, keyMoments: [m] })).status, JSON.stringify(m)).toBe(400);
    expect((await mint({ ...ok, keyMoments: Array.from({ length: 41 }, (_, t) => ({ t })) })).status).toBe(400);
  });

  it('9. size cap at the route: a payload of exactly 4096 B mints, 4097 B is 400; an unsafe score is 400 not 500', async () => {
    const at = momentsFor(CHALLENGE_MAX_CANONICAL_BYTES, ok.modeKey, ok.score);
    expect(at.length).toBeLessThanOrEqual(40);
    const r = await mint({ ...ok, keyMoments: at });
    expect(r.status).toBe(200);
    expect(Buffer.byteLength(canonicalV2(rows.get(r.body.code)!.payload))).toBe(CHALLENGE_MAX_CANONICAL_BYTES);
    const over = momentsFor(CHALLENGE_MAX_CANONICAL_BYTES + 1, ok.modeKey, ok.score);
    expect((await mint({ ...ok, keyMoments: over })).status).toBe(400);
    expect((await mint({ ...ok, score: 1e300 })).status).toBe(400);
    expect((await mint({ ...ok, athleteTag: 'a\u0000b' })).status).toBe(400);
  });
});
