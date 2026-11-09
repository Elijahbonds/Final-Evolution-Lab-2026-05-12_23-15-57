// DEMO-MODELS-1: the settings reach the client on the hero-body answer, and ONLY while one is on, so with every setting off the
// answer is exactly what it was. The client's store takes them from that answer (absent = all off). The demo stage's early fetch
// asks for the same file the spawn will load.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as unknown, prisma: null as any }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
vi.mock('@/lib/creator/athleteAxes-server', () => ({ axesFor: async () => null }));

import { GET as heroBodyGET } from '@/app/api/v1/hero-body/route';
import { DEMO_MODEL_FLAG_ENV, NO_DEMO_MODEL_FLAGS, demoModelFlags, setDemoModelFlags } from '@/lib/babylon/core/demoModels';
import { invalidateIdentity, resolveIdentity } from '@/lib/babylon/core/playerIdentity';
import { setSignedOutVisitor } from '@/lib/babylon/core/visitor';
import { demoBodyUrl, demoStageBodyUrl, unscaledBodyUrl } from '@/lib/library/demoWarm';
import { COACH_BODY_MOBILE_URL, COACH_BODY_URL } from '@/lib/babylon/core/heroBody';
import { newSpyDb, seedUser, spyPrisma } from '@/tests/helpers/writeSpyDb';
import { defaultFace } from '@/lib/closet/wearable-catalog';

const ENV = Object.values(DEMO_MODEL_FLAG_ENV);
function signedIn(email = 'dm1@fel.test') {
  const db = newSpyDb();
  seedUser(db, 'dm1', 1990);
  db.tables.avatarLook = [{ id: 'al1', userId: 'dm1', face: defaultFace(), equipped: {}, jersey: { number: 0, name: '' } }];
  h.prisma = spyPrisma(db);
  h.session = { user: { id: 'dm1', email } };
}
beforeEach(() => { h.session = null; });
afterEach(() => { for (const e of ENV) delete process.env[e]; delete process.env.FEL_SCAN_OWNER_EMAILS; setDemoModelFlags(NO_DEMO_MODEL_FLAGS); vi.unstubAllGlobals(); setSignedOutVisitor(false); });

describe('GET /api/v1/hero-body', () => {
  it('every setting off: the guest answer has exactly its old keys (no `demo`)', async () => {
    const j = await (await heroBodyGET()).json();
    expect(Object.keys(j).sort()).toEqual(['body', 'frame', 'guest', 'palette', 'scanOwned']);
    expect(j).toEqual({ body: 'kit-male', guest: true, frame: null, palette: null, scanOwned: false });
  });
  it('every setting off: the signed-in answer has no `demo` either', async () => {
    signedIn();
    const j = await (await heroBodyGET()).json();
    expect(j).not.toHaveProperty('demo');
    expect(j.guest).toBe(false);
  });
  for (const [k, env] of Object.entries(DEMO_MODEL_FLAG_ENV)) {
    it(`${env} on: guest and signed-in answers carry demo with only ${k} on`, async () => {
      process.env[env] = '1';
      const want = { ...NO_DEMO_MODEL_FLAGS, [k]: true };
      expect((await (await heroBodyGET()).json()).demo).toEqual(want);
      signedIn();
      expect((await (await heroBodyGET()).json()).demo).toEqual(want);
    });
  }
});

describe('the client takes the settings from that answer', () => {
  const answer = (j: unknown) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => j })));
  it('absent `demo` (every setting off): the store is all off', async () => {
    setDemoModelFlags({ ...NO_DEMO_MODEL_FLAGS, coachBody: true });
    answer({ body: 'kit-male', guest: true, frame: null, palette: null, scanOwned: false });
    setSignedOutVisitor(true); invalidateIdentity();
    await resolveIdentity(true);
    expect(demoModelFlags()).toEqual(NO_DEMO_MODEL_FLAGS);
  });
  it('a `demo` answer sets the store; a failed read is all off', async () => {
    answer({ body: 'kit-male', guest: true, frame: null, palette: null, scanOwned: false, demo: { ...NO_DEMO_MODEL_FLAGS, tryGuestCoach: true } });
    setSignedOutVisitor(true); invalidateIdentity();
    await resolveIdentity(true);
    expect(demoModelFlags()).toEqual({ ...NO_DEMO_MODEL_FLAGS, tryGuestCoach: true });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    invalidateIdentity();
    await resolveIdentity(true);
    expect(demoModelFlags()).toEqual(NO_DEMO_MODEL_FLAGS);
  });
});

describe('the demo stage\'s early fetch (demoWarm) asks for the file the spawn loads', () => {
  it('no `demo`: exactly demoBodyUrl, for every body and tier', () => {
    for (const body of ['scan', 'kit-male', 'kit-female', undefined] as const)
      for (const tier of ['desktop', 'mobile']) expect(demoStageBodyUrl(body ? { body } : null, tier)).toBe(demoBodyUrl(body, tier));
  });
  // v2: setting 5 (DEMO_LIBRARY_COACH_ENABLED) and its test removed — each viewer sees their own body in workouts and anatomy
  it('v2: with ALL settings on, a non-owner\'s (or a guest\'s) demo stage fetches their own body file', () => {
    const demo = { ...NO_DEMO_MODEL_FLAGS, coachBody: true, coachBodyMask: true, rivalPrefetch: true, tryGuestCoach: true, crowdForgeFront: true };
    for (const body of ['kit-male', 'kit-female', undefined] as const)
      for (const tier of ['desktop', 'mobile']) expect(demoStageBodyUrl({ body, demo }, tier)).toBe(demoBodyUrl(body, tier));
  });
  it('v2: setting 1 changes only the scan owner\'s own demo body (coach file, its phone file on a phone); unscaledBodyUrl maps it back', () => {
    const demo = { ...NO_DEMO_MODEL_FLAGS, coachBody: true };
    expect(demoStageBodyUrl({ body: 'scan', demo }, 'desktop')).toBe(COACH_BODY_URL);
    expect(demoStageBodyUrl({ body: 'scan', demo }, 'mobile')).toBe(COACH_BODY_MOBILE_URL);
    expect(demoStageBodyUrl({ body: 'kit-female', demo }, 'desktop')).toBe(demoBodyUrl('kit-female', 'desktop'));
    expect(unscaledBodyUrl(COACH_BODY_MOBILE_URL)).toBe(COACH_BODY_URL);
  });
});
