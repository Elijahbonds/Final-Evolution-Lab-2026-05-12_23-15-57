// OWNER-APPROVALS (2026-10-27): the owner approved all four signature programs as drafted (in chat: "You do it. I
// approve."; cards C20/C21). The approval is a default in lib/signature/access.ts statusOf, and it must never reach past
// the pending-schema seam (lib/coach/pendingSchema.ts): on a database WITHOUT the signature tables every athlete path
// reads "coming soon", nothing is started or saved, and no route answers 500. Measured here on the real server code and
// the real route handlers, over a stand-in database that answers like Postgres does without the tables (42P01).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const h = vi.hoisted(() => ({ session: { user: { id: 'adult' } } as { user: { id: string; role?: string } } | null, deps: null as unknown }));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => { if (p === 'then') return undefined; throw new Error('the real database is not used here'); } }) }));
vi.mock('@/lib/signature/server', async (orig) => ({ ...(await orig<object>()), defaultDeps: () => h.deps }));

import { loadLibraryFiles } from '@/lib/library/files';
import { FALLBACK_WARMUP_CONTEXT } from '@/lib/coach/warmup';
import {
  completeSession, programPage, programsOverview, reviewAct, signatureViewer, startProgram, stopProgram, trainLine, type SignatureDeps,
} from '@/lib/signature/server';
import { NO_ROWS } from '@/lib/signature/facts';
import { SQL } from '@/lib/signature/store';
import { NOT_READY_LINE } from '@/lib/signature/copy';
import { ProgramList } from '@/components/signature/program-list';
import { GET as listGet } from '@/app/api/signature-programs/route';
import { GET as oneGet, POST as onePost } from '@/app/api/signature-programs/[id]/route';
import { fakeSignatureDb, type FakeSignatureDb } from '@/tests/helpers/fakeSignatureDb';

const LIB = new Map(loadLibraryFiles().map((e) => [e.id, e]));
const NOW = new Date('2026-10-27T18:00:00Z');
let db: FakeSignatureDb;

function deps(): SignatureDeps {
  return {
    raw: db,
    dobYear: async (u) => (u === 'teen' ? 2011 : 1990),
    isPro: async () => true,
    warmup: async () => ({ ...FALLBACK_WARMUP_CONTEXT, isYouth: false, unavailable: undefined, jumpGate: { closed: false, why: '', href: null } }),
    library: async () => (id) => LIB.get(id) ?? null,
    retestRows: async () => NO_ROWS,
    readinessToday: async () => ({ low: false }),
    reward: async () => { throw new Error('nothing is rewarded without the tables'); },
    purchasesOpen: () => false,
  };
}
const viewer = (id: string, role?: string) => signatureViewer(id, role, deps());
const post = (body: unknown) => new Request('https://fel.test/api/signature-programs/vertical-jump', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const params = { params: { id: 'vertical-jump' } };

beforeEach(() => {
  db = fakeSignatureDb(false); // the tables are NOT there
  h.deps = deps();
  h.session = { user: { id: 'adult' } };
});

describe('approved, but the signature tables are absent: every path fails closed to "coming soon"', () => {
  it('the server half: no program listed, none opened, started, marked or stopped; the Train line is empty', async () => {
    for (const id of ['adult', 'teen']) {
      const v = await viewer(id);
      expect(await programsOverview(v, deps(), NOW)).toMatchObject({ ready: false, programs: [] });
      expect(await programPage(v, 'vertical-jump', deps(), NOW)).toBeNull();
      expect((await startProgram(v, 'vertical-jump', deps(), NOW)).status).toBe(503);
      expect((await completeSession(v, 'vertical-jump', 'w1:A', deps(), NOW)).status).toBe(503);
      expect((await stopProgram(v, 'vertical-jump', deps(), NOW)).status).toBe(503);
      expect(await trainLine(v, deps(), NOW)).toBeNull();
    }
    // the admin still previews them, as drafts: the approval is not applied without the review table
    const admin = await programsOverview(await viewer('admin', 'admin'), deps(), NOW);
    expect(admin.programs.every((p) => p.status === 'draft' && p.draft)).toBe(true);
    expect((await reviewAct('admin', { action: 'approve', id: 'vertical-jump' }, deps(), NOW)).status).toBe(503);
    expect(db.writes).toEqual([]);
  });

  it('the list page says "coming soon" (NOT_READY_LINE), not that the owner is reviewing', async () => {
    const o = await programsOverview(await viewer('adult'), deps(), NOW);
    const html = renderToStaticMarkup(createElement(ProgramList, o));
    expect(html).toContain(NOT_READY_LINE.replace(/'/g, '&#x27;'));
    expect(NOT_READY_LINE).toMatch(/coming soon/);
    expect(html).not.toMatch(/with the owner|owner approves/);
    expect(html).not.toContain('data-program=');
  });

  it('the routes answer 200 / 404 / 503 — never 500', async () => {
    const list = await listGet();
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ ready: false, programs: [] });
    expect((await oneGet(new Request('https://fel.test/x'), params)).status).toBe(404);
    for (const action of ['start', 'stop']) expect((await onePost(post({ action }), params)).status).toBe(503);
    expect((await onePost(post({ action: 'done', sessionId: 'w1:A' }), params)).status).toBe(503);
  });

  it('a half-applied schema (the probe table there, the review table missing) still fails closed, no throw', async () => {
    db = fakeSignatureDb(true);
    const q = db.$queryRawUnsafe.bind(db);
    db.$queryRawUnsafe = (async (sql: string, ...v: unknown[]) => {
      if (sql === SQL.reviews) throw Object.assign(new Error('relation "SignatureProgramReview" does not exist'), { code: '42P01' });
      return q(sql, ...v);
    }) as typeof db.$queryRawUnsafe;
    h.deps = deps();
    const o = await programsOverview(await viewer('adult'), deps(), NOW);
    expect(o).toMatchObject({ ready: false, programs: [] });
    expect((await startProgram(await viewer('adult'), 'vertical-jump', deps(), NOW)).status).toBe(503);
    expect((await listGet()).status).toBe(200);
  });

  it('control: the same routes with the tables applied open the approved programs (the probe reads the switch)', async () => {
    db = fakeSignatureDb(true);
    h.deps = deps();
    const list = await (await listGet()).json();
    expect(list.ready).toBe(true);
    expect(list.programs.map((p: { id: string }) => p.id)).toEqual(['vertical-jump', 'basketball-skills', 'athletic-foundation', 'pain-free']);
    expect((await oneGet(new Request('https://fel.test/x'), params)).status).toBe(200);
    expect((await onePost(post({ action: 'start' }), params)).status).toBe(200);
  });
});
