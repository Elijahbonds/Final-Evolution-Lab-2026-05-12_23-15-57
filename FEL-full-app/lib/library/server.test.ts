// EXERCISE-LIBRARY (2026-10-25): the server half against an in-memory stand-in for the pending tables — the seam
// (nothing 500s and writes say not-ready before the SQL), the overlay (owner decisions replace file entries), review,
// moderation, the catalogue copy and its link, and who sees drafts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SQL } from './store';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  ready: false,
  library: new Map<string, Record<string, unknown>>(),
  subs: new Map<string, Record<string, unknown>>(),
  programRows: [] as Record<string, unknown>[],
  links: new Map<string, string>(),
  user: { role: 'player', dobYear: 1990 as number | null },
}));

const COLS = (SQL.upsert.match(/\(([^)]*)\) VALUES/)![1]).split(', ').map((c) => c.replace(/"/g, ''));

vi.mock('@/lib/db', () => {
  const prisma = {
    async $queryRawUnsafe(sql: string, ...v: unknown[]) {
      if (sql.includes('information_schema')) return h.ready ? [{ ok: 1 }] : [];
      if (!h.ready) throw Object.assign(new Error('relation "LibraryExercise" does not exist'), { code: '42P01' });
      if (sql === SQL.version) return [{ n: h.library.size, at: new Date(1000 + h.library.size) }];
      if (sql === SQL.overlay) return [...h.library.values()].map((r) => ({ ...r, updatedAt: new Date(1000) }));
      if (sql === SQL.pendingForExercise) return [...h.subs.values()].filter((s) => s.programExerciseId === v[0] && s.status === 'pending').map((s) => ({ id: s.id }));
      if (sql === SQL.queue) return [...h.subs.values()].filter((s) => s.status === 'pending').map((s) => ({ ...s, coachName: 'Coach' }));
      if (sql === SQL.submissionById) return [...h.subs.values()].filter((s) => s.id === v[0]);
      if (sql === SQL.mySubmissions) return [...h.subs.values()].filter((s) => s.coachId === v[0]);
      if (sql === SQL.links) return [...h.links].map(([id, libraryExerciseId]) => ({ id, libraryExerciseId }));
      throw new Error(`unexpected query ${sql.slice(0, 60)}`);
    },
    async $executeRawUnsafe(sql: string, ...v: unknown[]) {
      if (!h.ready) throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      if (sql === SQL.upsert) { const r: Row = {}; COLS.forEach((c, i) => { r[c] = v[i]; }); h.library.set(String(r.id), r); return 1; }
      if (sql === SQL.insertSubmission) { h.subs.set(String(v[0]), { id: v[0], coachId: v[1], programExerciseId: v[2], payload: v[3], status: 'pending' }); return 1; }
      if (sql === SQL.decide) { const s = h.subs.get(String(v[0])); if (!s || s.status !== 'pending') return 0; Object.assign(s, { status: v[1], moderatorId: v[2], moderatorNote: v[3], libraryExerciseId: v[4] }); return 1; }
      if (sql === SQL.withdraw) { const s = h.subs.get(String(v[0])); if (!s || s.coachId !== v[1] || s.status !== 'pending') return 0; s.status = 'withdrawn'; return 1; }
      if (sql === SQL.link) { const row = h.programRows.find((r) => r.id === v[1] && r.coachId === v[2]); if (!row) return 0; h.links.set(String(v[1]), String(v[0])); return 1; }
      throw new Error(`unexpected exec ${sql.slice(0, 60)}`);
    },
    user: { findUnique: async () => h.user },
    coachClient: { count: async () => 0 },
    programExercise: {
      count: async ({ where }: { where: { coachId: string } }) => h.programRows.filter((r) => r.coachId === where.coachId).length,
      findMany: async ({ where }: { where: { coachId: string } }) => h.programRows.filter((r) => r.coachId === where.coachId),
      findUnique: async ({ where }: { where: { id: string } }) => h.programRows.find((r) => r.id === where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `pe-${h.programRows.length + 1}`, ...data }; h.programRows.push(row); return row; },
    },
    sessionExercise: { count: async () => 0 },
    exercise: { findUnique: async () => null },
  };
  return { prisma };
});
vi.mock('@/lib/coach/server', () => ({ isCertifiedCoach: async () => false }));

const server = await import('./server');
const store = await import('./store');
const { loadLibraryFiles } = await import('./files');
const FILES = loadLibraryFiles();
// The owner's 2026-10-25 decision approves the public-domain seed in the data files; FEL-authored batches stay drafts.
const SEED_APPROVED = FILES.filter((e) => e.review.status === 'approved').length;
const coach = { userId: 'coach-1', isAdmin: false, isCoach: true, youth: false };
const athlete = { userId: 'athlete-1', isAdmin: false, isCoach: false, youth: false };
const teen = { userId: 'teen-1', isAdmin: false, isCoach: false, youth: true };

beforeEach(() => {
  h.ready = false; h.library.clear(); h.subs.clear(); h.programRows = []; h.links.clear();
  store.resetLibraryProbe(); server.resetLibraryCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('before the pending SQL (the seam)', () => {
  it('searches the data files: coaches can see drafts, athletes see approved only (the seed, by the owner\'s decision)', async () => {
    const forCoach = await server.searchLibrary(coach, new URLSearchParams('q=goblet squat&drafts=1'));
    expect(forCoach.total).toBeGreaterThan(0);
    expect(forCoach.library).toMatchObject({ total: FILES.length, approved: SEED_APPROVED, ready: false });
    const forAthlete = await server.searchLibrary(athlete, new URLSearchParams('q=goblet squat&drafts=1'));
    expect(forAthlete.hits.every((e) => e.review.status === 'approved')).toBe(true);
    expect(forAthlete.hits.some((e) => e.review.batch.startsWith('authored-'))).toBe(false);
    expect(forAthlete.viewer.drafts).toBe(false);
  });
  it('every write answers library_not_ready; nothing throws', async () => {
    expect(await server.reviewAct('owner', { action: 'approve-batch', batch: 'seed-strength' })).toMatchObject({ status: 503, error: 'library_not_ready' });
    h.programRows.push({ id: 'pe-x', coachId: 'coach-1', name: 'My Squat', category: 'lower-body', pattern: 'squat', braceMode: null, skillLayer: null, primaryCues: ['Push the floor away.'], commonFaults: [], equipment: [], defaultTempo: '3-1-1-0', demoVideoUrl: null });
    expect(await server.submitToLibrary(coach, 'pe-x')).toMatchObject({ status: 503, error: 'library_not_ready' });
  });
  it('"add to my catalogue" still copies the entry, unlinked', async () => {
    const r = await server.addLibraryToCatalogue(coach, 'goblet-squat');
    expect(r).toMatchObject({ ok: true, status: 201, already: false, linked: false });
    expect(h.programRows[0]).toMatchObject({ coachId: 'coach-1', name: 'Goblet Squat', pattern: 'squat' });
    expect(await server.addLibraryToCatalogue(coach, 'goblet-squat')).toMatchObject({ ok: true, status: 200, already: true });
    expect(h.programRows).toHaveLength(1);
  });
});

describe('after the pending SQL', () => {
  beforeEach(() => { h.ready = true; });

  it('approving a batch makes it visible to athletes; the overlay replaces the file entries', async () => {
    const batch = 'authored-b1-plyometrics';
    const n = FILES.filter((e) => e.review.batch === batch).length;
    const r = await server.reviewAct('owner', { action: 'approve-batch', batch });
    expect(r).toMatchObject({ ok: true, written: n });
    const seen = await server.searchLibrary(athlete, new URLSearchParams('q=pogo'));
    expect(seen.total).toBeGreaterThan(0);
    expect(seen.hits.every((e) => e.review.status === 'approved')).toBe(true);
    expect(seen.hits.filter((e) => e.review.batch === batch).every((e) => e.review.reviewer === 'owner')).toBe(true);
    expect(seen.hits.some((e) => e.review.batch === batch)).toBe(true);
    expect(seen.library.approved).toBe(SEED_APPROVED + n);
  });
  it('a rejected entry is gone for everyone, coaches with drafts on included', async () => {
    await server.reviewAct('owner', { action: 'reject', ids: ['pogo-hop'] });
    const r = await server.searchLibrary(coach, new URLSearchParams('q=pogo hop&drafts=1'));
    expect(r.hits.some((e) => e.id === 'pogo-hop')).toBe(false);
  });
  it('an edit is validated: a muscle-squeeze cue is refused with the issue, a clean edit is written', async () => {
    const base = FILES.find((e) => e.id === 'goblet-squat')!;
    const bad = await server.reviewAct('owner', { action: 'edit', entry: { ...base, cues: ['Squeeze your glutes at the top.'] } });
    expect(bad).toMatchObject({ status: 422, error: 'invalid_entry' });
    const good = await server.reviewAct('owner', { action: 'edit', entry: { ...base, cues: ['Push the floor away to stand tall.'] }, approve: true });
    expect(good).toMatchObject({ ok: true, written: 1 });
    const r = await server.libraryEntry(athlete, 'goblet-squat');
    expect(r?.entry.cues).toEqual(['Push the floor away to stand tall.']);
  });
  it('submit → queue → approve makes a coach-submitted entry; the coach\'s own row stays theirs', async () => {
    h.programRows.push({ id: 'pe-1', coachId: 'coach-1', name: 'Coach Bonds Wall Drill', category: 'lower-body', pattern: 'squat', braceMode: 'set', skillLayer: 'strength', primaryCues: ['Push the floor away.', 'Sit back toward the wall behind you.'], commonFaults: [{ fault: 'Heels lift', correctionCue: 'Press the heels into the floor.' }], equipment: ['wall'], defaultTempo: '3-1-1-0', demoVideoUrl: null });
    const s = await server.submitToLibrary(coach, 'pe-1');
    expect(s).toMatchObject({ ok: true, status: 201 });
    expect(await server.submitToLibrary(coach, 'pe-1')).toMatchObject({ ok: true, status: 200 });   // one pending at a time
    expect(await server.submitToLibrary({ ...coach, userId: 'someone-else' }, 'pe-1')).toMatchObject({ status: 404 });
    const overview = await server.reviewOverview(new URLSearchParams());
    expect(overview.queue).toHaveLength(1);
    const id = (s as { submission: { id: string } }).submission.id;
    const done = await server.reviewAct('owner', { action: 'moderate', submissionId: id, decision: 'approved' });
    expect(done).toMatchObject({ ok: true, written: 1 });
    const found = await server.searchLibrary(athlete, new URLSearchParams('q=wall drill'));
    expect(found.hits[0]).toMatchObject({ name: 'Coach Bonds Wall Drill', source: { kind: 'coach-submitted' }, review: { status: 'approved' } });
    expect(await server.reviewAct('owner', { action: 'moderate', submissionId: id, decision: 'approved' })).toMatchObject({ status: 404 });
  });
  it('a submission whose cues break the policy is sent back with the issue, not published', async () => {
    h.programRows.push({ id: 'pe-2', coachId: 'coach-1', name: 'Glute Squeeze Thing', category: 'lower-body', pattern: 'hinge', braceMode: null, skillLayer: null, primaryCues: ['Squeeze your glutes hard.'], commonFaults: [], equipment: [], defaultTempo: '3-1-1-0', demoVideoUrl: null });
    const s = await server.submitToLibrary(coach, 'pe-2');
    expect((s as { notes: string[] }).notes.join(' ')).toMatch(/muscle|squeeze/);
    const id = (s as { submission: { id: string } }).submission.id;
    expect(await server.reviewAct('owner', { action: 'moderate', submissionId: id, decision: 'approved' })).toMatchObject({ status: 422, error: 'invalid_entry' });
    expect(await server.reviewAct('owner', { action: 'moderate', submissionId: id, decision: 'rejected', note: 'Reword the cue around the floor.' })).toMatchObject({ ok: true });
  });
  it('"add to my catalogue" keeps the link once the column exists', async () => {
    const r = await server.addLibraryToCatalogue(coach, 'pogo-hop');
    expect(r).toMatchObject({ ok: true, linked: true });
    expect(await server.myLibraryLinks(coach)).toEqual({ [h.programRows[0].id as string]: 'pogo-hop' });
  });
  it('youth: an adults-only entry is not found for a teen, by search or by id', async () => {
    const adult = FILES.find((e) => !e.youthOk)!;
    await server.reviewAct('owner', { action: 'approve', ids: [adult.id] });
    expect(await server.libraryEntry(teen, adult.id)).toBeNull();
    expect(await server.libraryEntry(athlete, adult.id)).not.toBeNull();
  });
});
