// /api/studio/projects and /api/studio/projects/[id], the real route files, against the repo's Prisma stand-in
// (tests/helpers/writeSpyDb.ts) and a stand-in session. vitest does not collect app/, so the route tests live here (as
// lib/account/account-routes.test.ts does). The flags are the real lib/flags.ts reading process.env.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as { user?: { id?: string } } | null, db: null as any, sessionReads: 0 }));
vi.mock('next-auth', () => ({ getServerSession: async () => { h.sessionReads++; return h.session; } }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', async () => {
  const { spyPrisma } = await import('@/tests/helpers/writeSpyDb');
  return { prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : spyPrisma(h.db)[p]) }) };
});

import { GET as listGET } from '@/app/api/studio/projects/route';
import { DELETE as oneDELETE, GET as oneGET, PUT as onePUT } from '@/app/api/studio/projects/[id]/route';
import { newSpyDb, seedUser, writesOf, THIS_YEAR } from '@/tests/helpers/writeSpyDb';
import { everyKindProject } from '@/tests/helpers/nexusStudio';
import type { StudioProject } from './doc';

const ENV = ['NEXUS_STUDIO_ENABLED', 'STUDIO_CLOUD_SAVE_ENABLED'] as const;
const saved: Record<string, string | undefined> = {};
let n = 0;
let uid = '';

beforeEach(() => {
  for (const k of ENV) { saved[k] = process.env[k]; process.env[k] = '1'; }
  h.db = newSpyDb();
  h.sessionReads = 0;
  uid = `user-${++n}`;   // the rate limiter is per process: a fresh account per test
  h.session = { user: { id: uid } };
  seedUser(h.db, uid, THIS_YEAR - 30);
});
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const CODE = 'FEL2.' + 'Ab9_-'.repeat(20) + '.abc1234';
function project(): StudioProject {
  const p = everyKindProject();
  p.characters = [{ id: 'char_a', name: 'Nova', lookCode: CODE }];
  return p;
}
const put = (id: string, body: unknown) => onePUT(new Request(`http://x/api/studio/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) }), { params: { id } });
const json = async (r: Response) => JSON.parse(await r.text());

describe('the switch (owner Q9: STUDIO_CLOUD_SAVE_ENABLED on top of NEXUS_STUDIO_ENABLED, off by default)', () => {
  it('either flag off: a PUT is a 404 before the session or the database is touched', async () => {
    for (const off of ENV) {
      process.env[off] = '';
      h.sessionReads = 0;
      const r = await put('proj_x', { baseRev: 0, project: project() });
      expect(r.status).toBe(404);
      expect(await json(r)).toEqual({ error: 'not_found' });
      expect(h.sessionReads).toBe(0);
      expect(h.db.calls).toEqual([]);
      process.env[off] = '1';
    }
  });

  it('switched off, what was saved can still be listed, read and deleted, and the list says saving is off', async () => {
    const p = project();
    expect((await put(p.id, { baseRev: 0, project: p })).status).toBe(200);
    process.env.STUDIO_CLOUD_SAVE_ENABLED = '';
    const l = await json(await listGET());
    expect(l).toMatchObject({ saving: { enabled: false, allowed: false }, projects: [{ projectId: p.id, rev: 1 }] });
    expect((await oneGET(new Request('http://x'), { params: { id: p.id } })).status).toBe(200);
    expect(await json(await oneDELETE(new Request('http://x'), { params: { id: p.id } }))).toEqual({ deleted: true });
  });
});

describe('who may save (owner Q1: teens 13+ and adults; under 13 and unknown refused) — the age from the database', () => {
  const cases: [string, number | null | 'no row', number][] = [
    ['an adult', THIS_YEAR - 30, 200],
    ['17', THIS_YEAR - 17, 200],
    ['14 by year (certainly 13)', THIS_YEAR - 14, 200],
    ['13 by year (may still be 12)', THIS_YEAR - 13, 403],
    ['12', THIS_YEAR - 12, 403],
    ['unknown (no birth year)', null, 403],
    ['no user row', 'no row', 403],
  ];
  for (const [label, year, status] of cases) {
    it(`${label}: ${status}`, async () => {
      h.db = newSpyDb();
      if (year !== 'no row') seedUser(h.db, uid, year);
      const p = project();
      const r = await put(p.id, { baseRev: 0, project: p });
      expect(r.status).toBe(status);
      if (status === 403) {
        expect(await json(r)).toEqual({ error: 'studio_save_unavailable' });
        expect(writesOf(h.db)).toEqual([]);
        expect((await json(await listGET())).saving).toEqual({ enabled: true, allowed: false });
      } else {
        expect((await json(await listGET())).saving).toEqual({ enabled: true, allowed: true });
      }
    });
  }

  it('a body naming another age changes nothing: the age is the database\'s', async () => {
    h.db = newSpyDb();
    seedUser(h.db, uid, THIS_YEAR - 10);
    const p = project();
    const r = await put(p.id, { baseRev: 0, project: p, dobYear: THIS_YEAR - 40, age: 40 });
    expect(r.status).toBe(403);
  });
});

describe('the round trip through the real routes', () => {
  it('save, list, read back without look codes, update at the right rev, 409 at a stale one, delete', async () => {
    const p = project();
    const created = await json(await put(p.id, { baseRev: 0, project: p }));
    expect(created).toMatchObject({ projectId: p.id, rev: 1, stripped: 1 });
    const stored = h.db.tables.studioProjectSave[0];
    expect(stored).toMatchObject({ userId: uid, projectId: p.id, rev: 1 });
    expect(JSON.stringify(stored.doc)).not.toContain('FEL2.');

    const l = await listGET();
    expect(l.headers.get('Cache-Control')).toBe('no-store');
    const list = await json(l);
    expect(list.projects).toHaveLength(1);
    expect(list.quota).toMatchObject({ projects: 1, maxProjects: 20, maxBytes: 8 * 1_048_576, maxProjectBytes: 1_048_576 });
    expect(typeof list.account).toBe('string');
    expect(list.account).not.toContain(uid);

    const back = await json(await oneGET(new Request('http://x'), { params: { id: p.id } }));
    expect(back.project.characters).toEqual([{ id: 'char_a', name: 'Nova' }]);

    expect(await json(await put(p.id, { baseRev: 1, project: { ...p, name: 'Two' } }))).toMatchObject({ rev: 2, name: 'Two' });
    const stale = await put(p.id, { baseRev: 1, project: { ...p, name: 'Stale' } });
    expect(stale.status).toBe(409);
    expect(await json(stale)).toMatchObject({ error: 'conflict', current: { rev: 2, name: 'Two' } });

    expect(await json(await oneDELETE(new Request('http://x'), { params: { id: p.id } }))).toEqual({ deleted: true });
    expect(h.db.tables.studioProjectSave).toEqual([]);
  });

  it('a guest gets 401 everywhere', async () => {
    h.session = null;
    expect((await listGET()).status).toBe(401);
    expect((await oneGET(new Request('http://x'), { params: { id: 'p' } })).status).toBe(401);
    expect((await put('p', { baseRev: 0, project: project() })).status).toBe(401);
    expect((await oneDELETE(new Request('http://x'), { params: { id: 'p' } })).status).toBe(401);
  });

  it('another account\'s project is not found, and its delete removes nothing', async () => {
    const p = project();
    await put(p.id, { baseRev: 0, project: p });
    h.session = { user: { id: 'someone-else' } };
    expect((await oneGET(new Request('http://x'), { params: { id: p.id } })).status).toBe(404);
    expect(await json(await oneDELETE(new Request('http://x'), { params: { id: p.id } }))).toEqual({ deleted: false });
    expect(h.db.tables.studioProjectSave).toHaveLength(1);
  });

  it('the table not there yet (SQL not applied): 503 save_unavailable, never a 500', async () => {
    const missing = Object.assign(new Error('The table `public.StudioProjectSave` does not exist'), { code: 'P2021' });
    const real = h.db;
    h.db = new Proxy(real, { get: (t, k) => (k === 'tables' ? new Proxy(t.tables, { get: (tt, kk) => { if (kk === 'studioProjectSave') throw missing; return tt[kk]; } }) : t[k]) });
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await listGET();
    expect(r.status).toBe(503);
    expect(await json(r)).toEqual({ error: 'save_unavailable' });
    expect(spy.mock.calls.flat().join(' ')).not.toContain(uid);
    spy.mockRestore();
  });
});

// FAIL-SAFE BEFORE THE SQL (owner 2026-10-24, "land it": merged and deployed first, the SQL applied after, by db-guard or
// the runbook). With BOTH switches on and the table missing, every Studio-save route answers a clean "not available" —
// never a 500 — and writes nothing. The error is the one Prisma really throws for a missing table (P2021).
describe('switched ON before prisma/pending/2026-10-17-studio-project-save.sql is applied', () => {
  it('list, read, save and delete all answer 503 save_unavailable; no 500, nothing written, no user id in the log', async () => {
    const { Prisma } = await import('@/public/_prisma/client');
    const missing = new Prisma.PrismaClientKnownRequestError('The table `public.StudioProjectSave` does not exist in the current database.', { code: 'P2021', clientVersion: Prisma.prismaVersion.client, meta: { modelName: 'StudioProjectSave', table: 'public.StudioProjectSave' } });
    const real = h.db;
    h.db = new Proxy(real, { get: (t, k) => (k === 'tables' ? new Proxy(t.tables, { get: (tt, kk) => { if (kk === 'studioProjectSave') throw missing; return tt[kk]; } }) : t[k]) });
    expect(process.env.NEXUS_STUDIO_ENABLED).toBe('1');
    expect(process.env.STUDIO_CLOUD_SAVE_ENABLED).toBe('1');
    const logs = (['log', 'info', 'warn', 'error'] as const).map((l) => vi.spyOn(console, l).mockImplementation(() => {}));
    try {
      const p = project();
      const answers: [string, Response][] = [
        ['list', await listGET()],
        ['get', await oneGET(new Request('http://x'), { params: { id: p.id } })],
        ['put new', await put(p.id, { baseRev: 0, project: p })],
        ['put update', await put(p.id, { baseRev: 3, project: p })],
        ['delete', await oneDELETE(new Request('http://x'), { params: { id: p.id } })],
      ];
      for (const [what, r] of answers) {
        expect([what, r.status]).toEqual([what, 503]);
        expect([what, await json(r)]).toEqual([what, { error: 'save_unavailable' }]);
        expect([what, r.headers.get('Cache-Control')]).toEqual([what, 'no-store']);
      }
      // the spy records the calls that were attempted (and threw); what matters is that no row landed anywhere
      expect(real.tables.studioProjectSave ?? []).toEqual([]);
      expect(writesOf(real).filter((op) => op !== '$transaction' && !op.startsWith('studioProjectSave.'))).toEqual([]);
      const logged = logs.flatMap((s) => s.mock.calls.flat()).map(String).join(' ');
      expect(logged).not.toContain(uid);
      expect(logged).not.toContain(p.name);
    } finally { logs.forEach((s) => s.mockRestore()); }
  });

  it('control: the same routes with the table present answer 200 (the stand-in really is what failed above)', async () => {
    const p = project();
    expect((await put(p.id, { baseRev: 0, project: p })).status).toBe(200);
    expect((await listGET()).status).toBe(200);
    expect((await oneGET(new Request('http://x'), { params: { id: p.id } })).status).toBe(200);
    expect((await oneDELETE(new Request('http://x'), { params: { id: p.id } })).status).toBe(200);
  });
});
