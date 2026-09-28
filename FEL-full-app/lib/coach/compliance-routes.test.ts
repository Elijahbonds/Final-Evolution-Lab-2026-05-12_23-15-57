// The coach's boards, through their REAL routes (MIRROR-COACH P2, compliance-and-roster lane, 2026-09-25).
//
// GET /api/coach/attention and GET /api/coach/roster run as written; only the session and the database are stand-ins
// (the same tiny in-memory Prisma lib/coach/loop-baseline.test.ts uses). The roster here is built so each P2 rule has
// one client that proves it:
//   · Cole  — coached sessions, no games                → steady, not stalled; triage says nothing
//   · Gia   — games every other day, no coached work     → stalled on the program, games named; not gone quiet
//   · Lou   — sets logged on a session never completed   → not stalled (they trained)
//   · Otto  — coached work only in ANOTHER coach's program → stalled for this coach (compliance is this coach's work)
//   · Mira  — games + an UNGRADED Mirror screen yesterday → still "ask for a System Scan" (P2 review: not data yet);
//             with a GRADED one instead                     → no "ask for a System Scan" (F7)
// and a program tagged squat/push/hinge/pull plus one untagged exercise for the six-pattern strip.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const m = vi.hoisted(() => ({ session: { user: { id: 'coach-1' } } as unknown, db: {} as Record<string, Row[]> }));

// a tiny in-memory Prisma (the loop-baseline one, plus string orderBy): equality / in / gte / gt / not / OR filters, nested
// to-one relation filters, `some` / `none` over a to-many list (P2 review: the attention route's LOGGED_WORK_WHERE),
// include + select projection, orderBy, take
const RELATIONS = new Set(['block', 'blocks', 'sessions', 'exercises', 'exercise', 'clientSessions', 'exerciseLogs', 'sessionExercise', 'program', 'session', 'clientSession', 'exerciseLog']);
function matches(row: Row | undefined, where: Row | undefined): boolean {
  if (!where) return true;
  if (!row) return false;
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    const v = row[k];
    if (cond === null) return v === null || v === undefined;
    if (cond instanceof Date) return v instanceof Date && v.getTime() === cond.getTime();
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const c = cond as Row;
      if ('in' in c) return (c.in as unknown[]).includes(v);
      if ('some' in c) return Array.isArray(v) && v.some((r) => matches(r as Row, c.some as Row));
      if ('none' in c) return !Array.isArray(v) || !v.some((r) => matches(r as Row, c.none as Row));
      if ('gt' in c) return typeof v === 'number' && v > (c.gt as number);
      if ('gte' in c) return v instanceof Date && v.getTime() >= (c.gte as Date).getTime();
      if ('not' in c) return c.not === null ? v !== null && v !== undefined : v !== c.not;
      if (RELATIONS.has(k)) return matches(v as Row, c);
      return false;
    }
    return v === cond;
  });
}
function sortBy(rows: Row[], orderBy: unknown): Row[] {
  if (!orderBy || typeof orderBy !== 'object') return rows;
  const [[k, dir]] = Object.entries(orderBy as Row);
  const val = (r: Row) => { const v = r[k]; return v instanceof Date ? v.getTime() : v; };
  const cmp = (a: unknown, b: unknown) => (typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : (a as number) - (b as number));
  return [...rows].sort((a, b) => cmp(val(a), val(b)) * (dir === 'desc' ? -1 : 1));
}
function pick(row: Row, select: Row): Row {
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => {
    const spec = select[k], v = row[k];
    if (spec === true || !v || typeof v !== 'object' || v instanceof Date) return [k, v];
    const s = spec as Row, one = (r: Row) => project(r, s.include as Row | undefined, s.select as Row | undefined);
    return [k, Array.isArray(v) ? sortBy(v.filter((r) => matches(r as Row, s.where as Row)) as Row[], s.orderBy).map(one) : one(v as Row)];
  }));
}
function project(row: Row, include?: Row, select?: Row): Row {
  if (select) return pick(row, select);
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (!RELATIONS.has(k)) out[k] = v;
  for (const [k, spec] of Object.entries(include ?? {})) {
    const v = row[k];
    const s = spec === true ? {} : (spec as Row);
    const one = (r: Row) => project(r, s.include as Row | undefined, s.select as Row | undefined);
    if (Array.isArray(v)) out[k] = sortBy(v.filter((r) => matches(r as Row, s.where as Row)) as Row[], s.orderBy).map(one);
    else out[k] = v ? one(v as Row) : v;
  }
  return out;
}
function model(name: string) {
  const run = (args: Row = {}) => {
    let r = sortBy((m.db[name] ?? []).filter((x) => matches(x, args.where as Row)), args.orderBy);
    if (typeof args.take === 'number') r = r.slice(0, args.take);
    return r.map((x) => project(x, args.include as Row | undefined, args.select as Row | undefined));
  };
  return {
    findMany: async (a?: Row) => run(a), findUnique: async (a?: Row) => run(a)[0] ?? null,
    findFirst: async (a?: Row) => run(a)[0] ?? null, count: async (a?: Row) => run(a).length,
  };
}
vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : model(String(prop))) }) }));

import { writeFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { GET as attentionGET } from '@/app/api/coach/attention/route';
import { GET as rosterGET } from '@/app/api/coach/roster/route';
import { GET as programsGET } from '@/app/api/coach/programs/route';
import { GET as catalogueGET } from '@/app/api/coach/programs/exercises/route';
import { GET as inboxGET } from '@/app/api/coach/inbox/route';
import { GET as inviteGET } from '@/app/api/coach/invite/route';
import { GET as prescribeGET } from '@/app/api/coach/prescribe/route';
import { MIRROR_SCREEN_KIND, scoreScreen } from '@/lib/mirror/screen';
import { storedScreen } from '@/lib/mirror/screenStore';

const DAY = 86_400_000;
const NOW = Date.now();
const ago = (d: number) => new Date(NOW - d * DAY);

const PE = {
  goblet: { id: 'pe-goblet', pattern: 'squat' }, bench: { id: 'pe-bench', pattern: 'push' },
  rdl: { id: 'pe-rdl', pattern: 'hinge' }, row: { id: 'pe-row', pattern: 'pull' }, mystery: { id: 'pe-mystery', pattern: null },
};
const sx = (sessionId: string, pe: { id: string; pattern: string | null }, sets = 3, section = 'key') => ({ id: `${sessionId}-${pe.id}`, sessionId, exerciseId: pe.id, sets, section, exercise: pe });
const program = (id: string, clientId: string, coachId = 'coach-1') => ({
  id, coachId, clientId, name: `Block ${id}`, isActive: true, startDate: ago(30), createdAt: ago(30),
  blocks: [{ sessions: [
    { id: `${id}-s1`, exercises: [sx(`${id}-s1`, PE.goblet), sx(`${id}-s1`, PE.bench)] },
    { id: `${id}-s2`, exercises: [sx(`${id}-s2`, PE.rdl), sx(`${id}-s2`, PE.row)] },
    { id: `${id}-s3`, exercises: [sx(`${id}-s3`, PE.mystery)] },
  ] }],
});
const done = (programId: string, clientId: string, sessionId: string, daysAgo: number | null) => ({
  id: `cs-${programId}-${sessionId}-${daysAgo}`, programId, clientId, sessionId, completedAt: daysAgo == null ? null : ago(daysAgo), createdAt: ago(daysAgo ?? 1),
});
const log = (cs: { id: string; clientId: string; programId: string }, daysAgo: number) => ({
  id: `log-${cs.id}`, clientSessionId: cs.id, createdAt: ago(daysAgo), clientSession: { clientId: cs.clientId, programId: cs.programId },
});

function seed() {
  const clients = ['cole', 'gia', 'lou', 'otto', 'mira'];
  const louOpen = done('p-lou', 'lou', 'p-lou-s1', null);   // Lou's session: sets logged, never completed
  const otherCoach = done('p-otto-x', 'otto', 'p-otto-x-s1', 1);
  const clientSession = [
    done('p-cole', 'cole', 'p-cole-s1', 1), done('p-cole', 'cole', 'p-cole-s2', 3), done('p-cole', 'cole', 'p-cole-s3', 9),
    louOpen, otherCoach,
  ];
  m.db = {
    coachingProgram: [...clients.map((c) => program(`p-${c}`, c)), program('p-otto-x', 'otto', 'coach-2')],
    coachClient: clients.map((c) => ({ id: `cc-${c}`, coachId: 'coach-1', clientId: c, endedAt: null, createdAt: ago(40), via: 'invite' })),
    user: clients.map((c) => ({ id: c, name: c[0].toUpperCase() + c.slice(1), email: `${c}@fixture.test` })),
    gameSession: [
      ...[0.5, 2, 4, 6, 8].map((d, i) => ({ id: `g-gia-${i}`, userId: 'gia', createdAt: ago(d), mode: 'onevone', won: false, score: 1 })),
      { id: 'g-mira', userId: 'mira', createdAt: ago(2), mode: 'dunk', won: true, score: 9 },
    ],
    clientSession,
    exerciseLog: [log(louOpen, 2), log(otherCoach, 1)],
    setLog: [{ id: 'set-lou-0', exerciseLogId: `log-${louOpen.id}`, setIndex: 0, reps: 8, createdAt: ago(2), exerciseLog: { clientSession: { clientId: 'lou', programId: 'p-lou' } } }],
    workoutScan: [{ id: 'scan-mira', userId: 'mira', kind: MIRROR_SCREEN_KIND, createdAt: ago(1), metrics: {} }],
    prqEntry: [], creatorCard: [], credential: [],
  };
}

type Drift = { clientId: string; state: string; games: number; recent: number; daysSince: number | null; note: string };
type Board = { drift: Drift[]; headline: string | null; triage: { flags: { clientId: string; kind: string; observed: string }[] } };
async function get<T>(fn: unknown): Promise<T> { return (await (await (fn as () => Promise<Response>)()).json()) as T; }

beforeEach(() => { m.session = { user: { id: 'coach-1' } }; seed(); });

describe('GET /api/coach/attention — coached work counts, games are a separate signal', () => {
  it('a client with coached sessions and no games is not stalled, and triage says nothing about them', async () => {
    const b = await get<Board>(attentionGET);
    const cole = b.drift.find((d) => d.clientId === 'cole')!;
    expect(cole).toMatchObject({ state: 'steady', recent: 3, games: 0, daysSince: 1, note: '3 coached sessions in the last two weeks.' });
    expect(b.triage.flags.find((f) => f.clientId === 'cole')).toBeUndefined();
  });

  it('a client who only plays games is stalled on the program, with the games named — and is not gone quiet', async () => {
    const b = await get<Board>(attentionGET);
    const gia = b.drift.find((d) => d.clientId === 'gia')!;
    expect(gia).toMatchObject({ state: 'stalled', games: 5, recent: 0, daysSince: null });
    expect(gia.note).toBe('Has never completed a coached session. Still playing: 5 games in the last two weeks.');
    const flag = b.triage.flags.find((f) => f.clientId === 'gia')!;
    expect(flag.kind).toBe('stale-scan');
    expect(flag.observed).toBe('No PRQ System Scan on file; no graded Mirror screen; no coached work logged.');
  });

  it('sets logged on a session never marked complete keep a client off stalled', async () => {
    const b = await get<Board>(attentionGET);
    expect(b.drift.find((d) => d.clientId === 'lou')).toMatchObject({ state: 'steady', recent: 0, daysSince: 2 });
    expect(b.triage.flags.find((f) => f.clientId === 'lou')).toBeUndefined();   // logged work is current data
  });

  it("another coach's program is not this coach's coached work", async () => {
    const b = await get<Board>(attentionGET);
    expect(b.drift.find((d) => d.clientId === 'otto')).toMatchObject({ state: 'stalled', daysSince: null });
  });

  // MIRROR-COACH P2 review (2026-09-26): P2 counted ANY stored screen as current data, and every screen stored until P3
  // is ungraded (app/api/mirror/screen/route.ts) — so the coach lost "nothing current to program from" the day a client
  // ran one, while the prescriptions panel said it was not graded. An ungraded screen is not data.
  it('an UNGRADED Mirror screen yesterday is not current data: triage still asks for a System Scan', async () => {
    const b = await get<Board>(attentionGET);
    const flag = b.triage.flags.find((f) => f.clientId === 'mira')!;
    expect(flag.kind).toBe('stale-scan');
    expect(flag.observed).toBe('No PRQ System Scan on file; no graded Mirror screen; no coached work logged.');
    expect(b.drift.find((d) => d.clientId === 'mira')).toMatchObject({ state: 'stalled', games: 1 });
    // none of the three stalled clients has ever logged coached work: the headline does not say "10+ days" of them
    expect(b.headline).toBe('3 athletes have not logged any coached work yet.');
  });

  it('control: a GRADED Mirror screen yesterday is current data (F7): no "ask for a System Scan"', async () => {
    const results = [{ checkId: 'heelLine', grade: 'stable', source: 'camera' }] as Parameters<typeof scoreScreen>[1];
    m.db.workoutScan = [{ id: 'scan-mira', userId: 'mira', kind: MIRROR_SCREEN_KIND, createdAt: ago(1), metrics: storedScreen('g1', 'modified', results, scoreScreen('modified', results)) as unknown as Row }];
    const b = await get<Board>(attentionGET);
    expect(b.triage.flags.find((f) => f.clientId === 'mira')).toBeUndefined();
  });

  // MIRROR-COACH P2 review (2026-09-26): Today's Save wrote an EMPTY ExerciseLog for every untouched exercise, and this
  // board counted each one as logged coached work.
  it('an EMPTY log (or a note-only one) is not coached work: a stalled client stays stalled', async () => {
    const cs = done('p-gia', 'gia', 'p-gia-s1', null);
    m.db.clientSession.push(cs);
    m.db.exerciseLog.push(
      { ...log(cs, 0), id: 'log-gia-empty', actualSets: null, actualReps: null, actualLoad: null, rpe: null, clientNote: null, setLogs: [] },
      { ...log(cs, 0), id: 'log-gia-note', actualSets: null, actualReps: null, actualLoad: null, rpe: null, clientNote: 'knee felt odd', setLogs: [] },
    );
    const b = await get<Board>(attentionGET);
    expect(b.drift.find((d) => d.clientId === 'gia')).toMatchObject({ state: 'stalled', daysSince: null });
    // the same log with a typed number IS work
    m.db.exerciseLog.push({ ...log(cs, 0), id: 'log-gia-typed', actualSets: 3, actualReps: '8,8,8', actualLoad: null, rpe: null, setLogs: [] });
    const after = await get<Board>(attentionGET);
    expect(after.drift.find((d) => d.clientId === 'gia')).toMatchObject({ state: 'steady', daysSince: 0 });
  });

  // MIRROR-COACH P2 review (2026-09-26): a client on this coach's roster ONLY through a program (no CoachClient row) had
  // no join date, so no grace: given a program today, "stalled" at once.
  it('a client added only through a program assigned today is "new", not stalled', async () => {
    m.db.coachingProgram.push({ ...program('p-pat', 'pat'), createdAt: ago(0.2) });
    m.db.user.push({ id: 'pat', name: 'Pat', email: 'pat@fixture.test' });
    const b = await get<Board>(attentionGET);
    expect(b.drift.find((d) => d.clientId === 'pat')).toMatchObject({ state: 'new' });
  });
});

type RosterRow = { clientId: string; coachedSessions: number; games: number; sessions: number; coverage: { cells: { pattern: string; state: string }[]; sessionsDone: number; untaggedProgrammed: number } | null };

describe('GET /api/coach/roster — two numbers and the six-pattern strip', () => {
  it('coached sessions and games are two numbers', async () => {
    const { roster } = await get<{ roster: RosterRow[] }>(rosterGET);
    expect(roster.find((r) => r.clientId === 'cole')).toMatchObject({ coachedSessions: 3, games: 0 });
    expect(roster.find((r) => r.clientId === 'gia')).toMatchObject({ coachedSessions: 0, games: 5, sessions: 5 });
    // Lou's session is open, and Otto's completed one is another coach's
    expect(roster.find((r) => r.clientId === 'lou')).toMatchObject({ coachedSessions: 0 });
    expect(roster.find((r) => r.clientId === 'otto')).toMatchObject({ coachedSessions: 0 });
  });

  it('tagged / untagged / missing: done this week, in the program but not done, and untagged — never "missed"', async () => {
    const { roster } = await get<{ roster: RosterRow[] }>(rosterGET);
    const cov = (id: string) => Object.fromEntries(roster.find((r) => r.clientId === id)!.coverage!.cells.map((c) => [c.pattern, c.state]));
    // Cole finished s1 (squat + push) and s2 (hinge + pull) this week; s3 (untagged) 9 days ago, outside the window.
    // Lunge and carry are not tagged anywhere, and the program HAS an untagged exercise: can't tell, so untagged.
    expect(cov('cole')).toEqual({ squat: 'done', hinge: 'done', lunge: 'untagged', push: 'done', pull: 'done', carry: 'untagged' });
    // Gia did nothing coached: the tagged patterns are open, the rest untagged
    expect(cov('gia')).toEqual({ squat: 'open', hinge: 'open', lunge: 'untagged', push: 'open', pull: 'open', carry: 'untagged' });
    const cole = roster.find((r) => r.clientId === 'cole')!;
    expect(cole.coverage).toMatchObject({ sessionsDone: 2, untaggedProgrammed: 1 });
    expect(JSON.stringify(roster)).not.toMatch(/missed/i);
  });

  it('once the untagged exercise is tagged, the program\'s gaps read "not in the program"', async () => {
    (PE.mystery as { pattern: string | null }).pattern = 'rotation';
    try {
      const { roster } = await get<{ roster: RosterRow[] }>(rosterGET);
      const cells = Object.fromEntries(roster.find((r) => r.clientId === 'cole')!.coverage!.cells.map((c) => [c.pattern, c.state]));
      expect(cells).toMatchObject({ lunge: 'notProgrammed', carry: 'notProgrammed' });
    } finally { (PE.mystery as { pattern: string | null }).pattern = null; }
  });
});

// ── the live-proof fixture ──────────────────────────────────────────────────────────────────────────────────────────
// COMPLIANCE_PROOF_OUT=<file.json> runs every route the coach's Clients tab calls on a small, realistic roster and
// writes what they answer; scripts/probes/_coach-compliance-p2.mts serves that to the REAL page on the lane's dev server
// (/dev/mirror-shots, whose database is offline on purpose) and takes the frames. Skipped otherwise.
function seedProof() {
  const pe = (id: string, name: string, pattern: string | null, category = 'general') => ({
    id, coachId: 'coach-1', name, category, pattern, braceMode: null, skillLayer: null, demoVideoUrl: null, primaryCues: [], commonFaults: null,
    equipment: [], defaultTempo: '3-1-1-0', progressionOfId: null, regressionOfId: null, createdAt: ago(60), updatedAt: ago(60),
  });
  const CAT = {
    goblet: pe('pe-goblet', 'Goblet Squat', 'squat', 'lower-body'), rdl: pe('pe-rdl', 'Romanian Deadlift', 'hinge', 'lower-body'),
    split: pe('pe-split', 'Split Squat', 'lunge', 'lower-body'), bench: pe('pe-bench', 'DB Bench Press', 'push', 'upper-push'),
    dip: pe('pe-dip', 'Ring Dip', 'push', 'upper-push'), pushup: pe('pe-pushup', 'Push-up', 'push', 'upper-push'),
    row: pe('pe-row', 'One-arm Row', 'pull', 'upper-pull'), pullup: pe('pe-pullup', 'Pull-up', 'pull', 'upper-pull'),
    carry: pe('pe-carry', 'Suitcase Carry', 'carry', 'conditioning'), croc: pe('pe-croc', 'Crocodile Breathing', 'breath', 'breath'),
    landmine: pe('pe-landmine', 'Landmine Rotation', null, 'core'),
  };
  type Spec = [keyof typeof CAT, number, string, { key?: boolean; note?: string }?];
  let seq = 0;
  const programOf = (id: string, clientId: string, name: string, days: [string, Spec[]][]) => {
    const block: Row = { id: `${id}-b1`, programId: id, order: 1, label: 'Week 1', targetDate: null };
    block.sessions = days.map(([label, specs], d) => ({
      id: `${id}-d${d + 1}`, blockId: block.id, order: d + 1, label, block,
      exercises: specs.map(([k, sets, section, o], i) => ({
        id: `se-${++seq}`, sessionId: `${id}-d${d + 1}`, exerciseId: CAT[k].id, order: i + 1, sets, reps: section === 'finish' ? '40 m' : '8', load: 'RPE7', tempo: '3-1-1-0',
        restSeconds: 90, coachNote: o?.note ?? null, section, isKeySet: !!o?.key, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: 'drive',
        exercise: CAT[k],
      })),
    }));
    return { id, coachId: 'coach-1', clientId, name, isActive: true, startDate: ago(9), durationWeeks: 4, createdAt: ago(9), updatedAt: ago(1), blocks: [block], clientSessions: [] as Row[] };
  };
  const cole = programOf('p-cole', 'cole', 'Base block', [
    ['Day 1 · lower', [['goblet', 4, 'key', { key: true }], ['rdl', 3, 'assist'], ['carry', 2, 'finish'], ['croc', 1, 'cooldown']]],
    ['Day 2 · upper', [['bench', 4, 'key', { key: true }], ['dip', 3, 'assist'], ['pushup', 3, 'assist'], ['row', 3, 'assist'], ['landmine', 2, 'finish']]],
    ['Day 3 · full', [['split', 3, 'key', { key: true }], ['pullup', 3, 'assist']]],
  ]);
  const tagged = (id: string, clientId: string, note?: string) => programOf(id, clientId, 'Strength base', [
    ['Day 1 · lower', [['goblet', 3, 'key', { key: true }], ['rdl', 3, 'assist']]],
    ['Day 2 · upper', [['bench', 3, 'key', { key: true, note }], ['pushup', 3, 'assist'], ['row', 3, 'assist'], ['pullup', 3, 'assist'], ['carry', 2, 'finish']]],
  ]);
  const rae = tagged('p-rae', 'rae', 'Keep the shoulder blades tucked on the way down.');
  const gia = tagged('p-gia', 'gia');
  const lou = tagged('p-lou', 'lou');
  const programs = [cole, rae, gia, lou];
  const sessionOf = (p: typeof cole, sid: string) => (p.blocks[0].sessions as Row[]).find((x) => x.id === sid)!;
  const clientSession: Row[] = [];
  const exerciseLog: Row[] = [];
  const complete = (p: typeof cole, sid: string, daysAgo: number | null, withLogs = true) => {
    const s = sessionOf(p, sid);
    const cs: Row = { id: `cs-${sid}`, programId: p.id, sessionId: sid, clientId: p.clientId, completedAt: daysAgo == null ? null : ago(daysAgo), createdAt: ago(daysAgo ?? 2), updatedAt: ago(daysAgo ?? 2), program: p, session: s };
    cs.exerciseLogs = withLogs ? (s.exercises as Row[]).map((e) => ({
      id: `log-${e.id}`, clientSessionId: cs.id, sessionExerciseId: e.id, actualSets: e.sets, actualReps: '8,8,8', actualLoad: '20kg', rpe: 7,
      clientNote: null, videoUrl: null, completedAt: cs.completedAt, coachComment: null, coachCommentAt: null, createdAt: ago(daysAgo ?? 2),
      clientSession: { clientId: p.clientId, programId: p.id }, sessionExercise: e,
    })) : [];
    clientSession.push(cs); exerciseLog.push(...(cs.exerciseLogs as Row[]));
    if (cs.completedAt) p.clientSessions.push(cs);
  };
  complete(cole, 'p-cole-d1', 2); complete(cole, 'p-cole-d2', 1);
  complete(rae, 'p-rae-d1', 3);
  complete(lou, 'p-lou-d1', null);             // sets logged two days ago, never marked complete
  const people = [['coach-1', 'Coach Fixture'], ['cole', 'Cole Steady'], ['rae', 'Rae Tagged'], ['gia', 'Gia Games'], ['lou', 'Lou Logged'], ['nia', 'Nia New']];
  m.db = {
    coachingProgram: programs,
    coachClient: people.slice(1).map(([id]) => ({ id: `cc-${id}`, coachId: 'coach-1', clientId: id, endedAt: null, createdAt: id === 'nia' ? ago(1) : ago(20), via: 'invite' })),
    user: people.map(([id, name]) => ({ id, name, email: `${id}@fixture.test` })),
    facilitatorProfile: [{ userId: 'coach-1', certificationStatus: 'certified', revokedAt: null }],
    gameSession: [
      ...[0.5, 2, 4, 6, 8].map((d, i) => ({ id: `g-gia-${i}`, userId: 'gia', createdAt: ago(d), mode: 'onevone', won: i % 2 === 0, score: 11 })),
      ...[3, 5].map((d, i) => ({ id: `g-cole-${i}`, userId: 'cole', createdAt: ago(d), mode: 'dunk', won: true, score: 9 })),
    ],
    clientSession, exerciseLog,
    setLog: exerciseLog.filter((l) => l.clientSession && (l.clientSession as Row).clientId === 'lou').map((l, k) => ({ id: `set-${k}`, exerciseLogId: l.id, setIndex: 0, reps: 8, createdAt: ago(2), exerciseLog: { clientSession: l.clientSession } })),
    workoutScan: [{ id: 'scan-gia', userId: 'gia', kind: MIRROR_SCREEN_KIND, createdAt: ago(3), metrics: { graded: false, results: [] } }],
    programExercise: Object.values(CAT), prqEntry: [], creatorCard: [], credential: [], goalPlan: [], coachInvite: [], playerProfile: [],
  };
}

describe.runIf(!!process.env.COMPLIANCE_PROOF_OUT)('the live-proof fixture (COMPLIANCE_PROOF_OUT)', () => {
  it('writes what every route the Clients tab calls answers', async () => {
    seedProof();
    const json = async (fn: unknown, url?: string) => { const f = fn as (r?: unknown) => Promise<Response>; return (await (url ? f(new NextRequest(`http://fel.test${url}`)) : f())).json(); };
    const out: Record<string, unknown> = {
      '/api/coach/programs': await json(programsGET),
      '/api/coach/programs/exercises': await json(catalogueGET),
      '/api/coach/inbox': await json(inboxGET),
      '/api/coach/roster': await json(rosterGET),
      '/api/coach/attention': await json(attentionGET),
      '/api/coach/invite': await json(inviteGET),
    };
    for (const c of ['cole', 'rae', 'gia', 'lou']) out[`/api/coach/prescribe?clientId=${c}`] = await json(prescribeGET, `/api/coach/prescribe?clientId=${c}`);
    writeFileSync(process.env.COMPLIANCE_PROOF_OUT!, JSON.stringify(out, null, 1));
    // the fixture says what it is meant to say before any frame is taken
    const board = out['/api/coach/attention'] as Board;
    expect(board.drift.find((d) => d.clientId === 'gia')).toMatchObject({ state: 'stalled', games: 5 });
    expect(board.drift.find((d) => d.clientId === 'lou')).toMatchObject({ state: 'steady', recent: 0 });
    // Nia, who joined yesterday with nothing logged: triage's gone-quiet does not read the join date (pre-existing;
    // compliance calls her "waiting on you", which is the row the panel leads with). And Gia: her only screen is
    // UNGRADED, which the P2 review made "not current data" (the F7 flip in the attention tests above), so triage asks
    // her coach for a scan. MIRROR-COACH P2 live proof (2026-09-26): this env-gated fixture still expected Nia alone —
    // it runs only with COMPLIANCE_PROOF_OUT, so the review's flip never reached it; the live proof's run caught it.
    expect(board.triage.flags.map((f) => `${f.clientId}:${f.kind}`)).toEqual(['nia:gone-quiet', 'gia:stale-scan']);
    const roster = (out['/api/coach/roster'] as { roster: RosterRow[] }).roster;
    expect(roster.find((r) => r.clientId === 'cole')).toMatchObject({ coachedSessions: 2, games: 2 });
    expect((out['/api/coach/programs'] as { programs: unknown[] }).programs).toHaveLength(4);
  });
});
