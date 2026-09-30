// TEEN-WRITE-BLOCK-2 (FE PM 23:05 PT), GAP 1 row 1g — FE PM's REQUIRED TEST: POST /api/v1/creator/athlete gates ONLY the
// measured PRQ snapshot. Avatar saves (AvatarLook: the face, its Fine Tune morphs, the jersey, owned wearables) and the
// build (AthleteBuild.build) stay open to ANY signed-in user, a 15-year-old included; for everyone the save gate refuses,
// the answer is 200 with the look and build saved, prq not written (DbNull on a create, the key left out on an update, so
// an older snapshot is neither rewritten nor cleared), and `prqSaved: false` + `prqRefusal` (the 403 scan_save_adults_only
// refusal, carried inside the 200). ADULTS ARE REFUSED THE SNAPSHOT TOO until PRIVACY-CORE/AB-04 adds the opt-in; the
// opted-in adult (the opt-in vi.mocked true) is the positive control. Run for real over the write-spy client; the session,
// the database and the measured axes are stand-ins.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as unknown, prisma: null as any }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
vi.mock('@/lib/creator/athleteAxes-server', () => ({ axesFor: async () => ({ speed: 80, power: 71 }) }));
vi.mock('@/lib/privacy/scanSaveOptIn', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/privacy/scanSaveOptIn')>();
  return { scanSaveOptIn: vi.fn(real.scanSaveOptIn) };
});

import { NextRequest } from 'next/server';
import { Prisma } from '@/public/_prisma/client';
import { POST as athletePOST } from '@/app/api/v1/creator/athlete/route';
import { scanSaveOptIn } from '@/lib/privacy/scanSaveOptIn';
import { OPTED_IN_ADULT, REFUSED_SCAN_CASES, argsOf, callsOn, newSpyDb, spyPrisma, writesOf, type AgeCase, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-creator-1';
const AXES = { speed: 80, power: 71 };
const OLD_PRQ = { speed: 63, power: 91 };   // a snapshot an earlier Finalize stored
const optIn = vi.mocked(scanSaveOptIn);
const realOptIn = optIn.getMockImplementation()!;
const PRQ_REFUSAL = { status: 403, error: 'scan_save_adults_only', saved: false };
let db: SpyDb;

/**
 * A changed look and a changed build: a new hairstyle, the Face Length Fine Tune morph at 40%, jersey 23 / ACE, the
 * Evolution Hi-Tops (owned, not a starter), a Mid-Range rating of 70 and a changed stance.
 */
const BUILD = {
  values: {
    appearance: { hairStyle: 'Locs', faceLong: 40 },
    vitals: { jerseyNumber: 23 },
    gear: { shoes: 'Evolution Hi-Tops' },
    attributes: { midRange: 70 },
    body: { stance: 'compact' },
  },
  plate: 'ACE',
};

/** The user as the case seeds them, who owns the Evolution Hi-Tops; `existing` also seeds last save's rows. */
function as(c: AgeCase, o: { optedIn?: boolean; existing?: boolean } = {}) {
  db = newSpyDb();
  c.seed(db, UID);
  db.tables.ownedWearable = [{ id: 'ow1', userId: UID, itemId: 'shoes_evo' }];
  if (o.existing) {
    db.tables.avatarLook = [{ id: 'al1', userId: UID, face: { hairStyle: 'Fade' }, equipped: { shoes: 'shoes_flight' }, jersey: { number: 0, name: '' } }];
    db.tables.athleteBuild = [{ id: 'ab1', userId: UID, build: { attributes: {} }, prq: OLD_PRQ, finalizedAt: new Date('2026-09-01T00:00:00Z') }];
  }
  h.prisma = spyPrisma(db);
  optIn.mockImplementation(o.optedIn ? async () => true : realOptIn);
}
async function post(body: unknown) {
  const req = new NextRequest('http://fel.test/api/v1/creator/athlete', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
  const res = await athletePOST(req);
  return { status: res.status, json: await res.json() };
}
const CASES = REFUSED_SCAN_CASES.map((c) => [c.id, c] as const);
const ALL = [...REFUSED_SCAN_CASES, OPTED_IN_ADULT].map((c) => [c.id, c] as const);
const by = (id: string) => REFUSED_SCAN_CASES.find((c) => c.id === id)!;

/** What every account's save must write for the look and the build, whoever they are. */
function expectLookAndBuildSaved() {
  const look = argsOf(db, 'avatarLook.upsert')[0];
  for (const half of [look.update, look.create]) {
    expect(half.face).toMatchObject({ hairStyle: 'Locs', sliders: { faceLong: 0.4 } });
    expect(half.jersey).toEqual({ number: 23, name: 'ACE' });
    expect(half.equipped).toMatchObject({ shoes: 'shoes_evo' });
  }
  const build = argsOf(db, 'athleteBuild.upsert')[0];
  for (const half of [build.update, build.create]) {
    expect(half.build.attributes).toEqual({ midRange: 70 });
    expect(half.build.frame).toMatchObject({ stance: 'compact' });
    expect(half.finalizedAt).toBeInstanceOf(Date);
  }
  return build;
}

beforeEach(() => { h.session = { user: { id: UID } }; });

describe('1g POST /api/v1/creator/athlete — the look and the build save for everyone; only the PRQ snapshot is gated', () => {
  it('REQUIRED: a 15-year-old saves their avatar and their manual look changes; their PRQ write gets the 403 refusal', async () => {
    as(by('15'));
    const r = await post(BUILD);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ saved: true, refused: [], prqSaved: false, prqRefusal: PRQ_REFUSAL });
    expect(writesOf(db)).toEqual(['avatarLook.upsert', 'athleteBuild.upsert', '$transaction']);
    const build = expectLookAndBuildSaved();
    expect(build.create.prq).toBe(Prisma.DbNull);
    expect('prq' in build.update).toBe(false);
    // what is on file now: the new look and build, and no measured numbers
    expect(db.tables.avatarLook[0].face).toMatchObject({ hairStyle: 'Locs', sliders: { faceLong: 0.4 } });
    expect(db.tables.athleteBuild[0].prq).toBe(Prisma.DbNull);
    expect(db.tables.athleteBuild[0].build.attributes).toEqual({ midRange: 70 });
  });

  it.each(CASES)('%s (first save): 200, look + build written, prq DbNull on the create, prqSaved false + prqRefusal', async (_id, c) => {
    as(c);
    const r = await post(BUILD);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ saved: true, refused: [], prqSaved: false, prqRefusal: PRQ_REFUSAL });
    expect(Object.keys(r.json).sort()).toEqual(['finalizedAt', 'prqRefusal', 'prqSaved', 'refused', 'saved']);
    const build = expectLookAndBuildSaved();
    expect(build.create.prq).toBe(Prisma.DbNull);
    expect(db.tables.athleteBuild[0].prq).toBe(Prisma.DbNull);
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
  });

  it.each(CASES)('%s (a later save): the look and build are updated; the prq key is left out, so the older snapshot is neither rewritten nor cleared', async (_id, c) => {
    as(c, { existing: true });
    const r = await post(BUILD);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ saved: true, prqSaved: false, prqRefusal: PRQ_REFUSAL });
    const build = expectLookAndBuildSaved();
    expect('prq' in build.update).toBe(false);
    expect(db.tables.athleteBuild[0].prq).toEqual(OLD_PRQ);
    expect(db.tables.athleteBuild[0].build.attributes).toEqual({ midRange: 70 });
    expect(db.tables.avatarLook[0].jersey).toEqual({ number: 23, name: 'ACE' });
  });

  it('18+ OPTED IN (positive control): exactly today\'s upserts, prq included, and no prqSaved / prqRefusal keys', async () => {
    as(OPTED_IN_ADULT, { optedIn: true, existing: true });
    const r = await post(BUILD);
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(['finalizedAt', 'refused', 'saved']);
    const build = expectLookAndBuildSaved();
    expect(build.update.prq).toEqual(AXES);
    expect(build.create.prq).toEqual(AXES);
    expect(db.tables.athleteBuild[0].prq).toEqual(AXES);
  });

  it.each(ALL)('%s: an illegal build is still a 422, and bad JSON a 400, nothing written', async (_id, c) => {
    as(c, { optedIn: c === OPTED_IN_ADULT });
    // power 71 + 22 headroom = a Standing Dunk ceiling of 93
    const r = await post({ values: { attributes: { standingDunk: 99 } }, plate: '' });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe('invalid_build');
    expect(await post('{nope')).toEqual({ status: 400, json: { error: 'invalid_json' } });
    expect(writesOf(db)).toEqual([]);
  });

  it('signed out: 401, and the gate reads nothing', async () => {
    as(by('15'));
    h.session = null;
    expect(await post(BUILD)).toEqual({ status: 401, json: { error: 'unauthorized' } });
    expect(db.calls).toEqual([]);
  });
});
