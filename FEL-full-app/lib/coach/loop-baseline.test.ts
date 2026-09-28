// The coaching loop as it stands — BASELINE (MIRROR-COACH P1, 2026-09-25).
//
// Three numbers phase 2 (coach-loop plumbing) proves itself against, measured on the REAL routes, not on a
// re-implementation of them. Only the session and the database are stand-ins, and the database records every table a
// route touches, so "the attention board never reads a coached session" is a measurement, not a reading of the code.
//
//   1. THE CATALOGUE. Can a coach add an exercise to the prescribable catalogue (ProgramExercise) from any page the app
//      serves? The only code that POSTs to /api/coach/programs/exercises is found by pattern, and a declaration-level
//      import walk (scripts/probes/_import-graph.ts) asks whether any served page's component reaches it.
//   2. THE ATTENTION BOARD. What GET /api/coach/attention says about a client who did every coached session in the last
//      two weeks and played no games.
//   3. TODAY. Which fields of a prescribed exercise GET /api/coach/me/today hands the client, and which of those the
//      Today card renders — when the coach's catalogue row HAS cues, common faults, a demo video, equipment and a
//      regression.
//
// These assert TODAY'S behaviour, faults included, on purpose: a phase that fixes one of them must change the matching
// expectation here, so the before and after are both on the record (BASELINE.md in the outbox keeps the before).
// Set MIRROR_BASELINE_OUT=<file.json> to also write what was measured (scripts/probes/_mirror-baseline.mts does).
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Row = Record<string, unknown>;
const m = vi.hoisted(() => ({
  session: { user: { id: 'coach-1' } } as unknown,
  db: {} as Record<string, Row[]>,
  touched: new Set<string>(),
  calls: [] as { model: string; op: string; args: unknown }[],
}));

// ── a tiny in-memory Prisma: equality / in / gte / not-null filters, include + select projection, orderBy, take ──
// 'exerciseLog' (MIRROR-COACH P2 compliance lane): the attention route reads SetLog through exerciseLog.clientSession
const RELATIONS = new Set(['block', 'blocks', 'sessions', 'exercises', 'exercise', 'clientSessions', 'exerciseLogs', 'sessionExercise', 'program', 'session', 'clientSession', 'sessionExercises', 'exerciseLog']);
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
  const val = (r: Row) => { const v = r[k]; return v instanceof Date ? v.getTime() : (v as number); };
  return [...rows].sort((a, b) => (val(a) - val(b)) * (dir === 'desc' ? -1 : 1));
}
function pick(row: Row, select: Row): Row {
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => {
    const spec = select[k], v = row[k];
    if (spec === true || !v || typeof v !== 'object' || v instanceof Date) return [k, v];
    const s = spec as Row, one = (r: Row) => project(r, s.include as Row | undefined, s.select as Row | undefined);
    return [k, Array.isArray(v) ? v.map((r) => one(r as Row)) : one(v as Row)];
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
  const rows = () => m.db[name] ?? [];
  const run = (op: string, args: Row = {}) => {
    m.calls.push({ model: name, op, args });
    let r = sortBy(rows().filter((x) => matches(x, args.where as Row)), args.orderBy);
    if (typeof args.take === 'number') r = r.slice(0, args.take);
    return r.map((x) => project(x, args.include as Row | undefined, args.select as Row | undefined));
  };
  return {
    findMany: async (a?: Row) => run('findMany', a),
    findFirst: async (a?: Row) => run('findFirst', a)[0] ?? null,
    findUnique: async (a?: Row) => run('findUnique', a)[0] ?? null,
    count: async (a?: Row) => run('count', a).length,
  };
}

vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      m.touched.add(String(prop));
      return model(String(prop));
    },
  }),
}));

import { NextRequest } from 'next/server';
import { GET as attentionGET } from '@/app/api/coach/attention/route';
import { GET as todayGET } from '@/app/api/coach/me/today/route';
import { GET as programsGET } from '@/app/api/coach/programs/route';
import { GET as catalogueGET } from '@/app/api/coach/programs/exercises/route';
import { GET as inboxGET } from '@/app/api/coach/inbox/route';
import { GET as rosterGET } from '@/app/api/coach/roster/route';
import { GET as prescribeGET } from '@/app/api/coach/prescribe/route';
import { GET as inviteGET } from '@/app/api/coach/invite/route';
import { CATALOGUE_POST, filesMatching, whoMounts } from '@/scripts/probes/_import-graph';
import { MIRROR_SCREEN_KIND, scoreScreen } from '@/lib/mirror/screen';
import { storedScreen } from '@/lib/mirror/screenStore';

const ROOT = resolve(process.cwd());   // vitest runs from the app root (FEL-full-app)
const DAY = 86_400_000;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * DAY);
const measured: Record<string, unknown> = {};

// ── the fixture roster: one coach, one client, a 2-week block of 8 sessions of which 6 are done ──────────────────
const CATALOGUE = {
  // A catalogue row with EVERYTHING filled in, so what reaches the client is decided by the route, not by empty data.
  box: { id: 'pe-box', coachId: 'coach-1', name: 'Box Squat', category: 'lower-body', demoVideoUrl: null, primaryCues: ['Sit back to the box'], commonFaults: null, equipment: ['box'], defaultTempo: '3-1-1-0', progressionOfId: 'pe-goblet', regressionOfId: null },
  split: { id: 'pe-split', coachId: 'coach-1', name: 'Split Squat', category: 'lower-body', demoVideoUrl: null, primaryCues: [], commonFaults: null, equipment: [], defaultTempo: '3-1-1-0', progressionOfId: null, regressionOfId: null },
  goblet: {
    id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat', category: 'lower-body',
    demoVideoUrl: 'https://video.example/goblet-squat.mp4',
    primaryCues: ['Elbows inside the knees', 'Spread the floor', 'Chest proud'],
    commonFaults: [{ fault: 'Knees drift in', correctionCue: 'Push the knees out over the toes' }],
    equipment: ['kettlebell'], defaultTempo: '3-1-1-0', progressionOfId: null, regressionOfId: 'pe-box',
  },
};

// `coachedDaysBack` (MIRROR-COACH P2 compliance lane) moves every coached session and log that many days further back,
// so a board can be read with the coached work outside the two-week window and the games / screen inside it.
function seed(opts: { games: number; screenYesterday?: boolean; gradedScreenYesterday?: boolean; coachedDaysBack?: number }) {
  const back = opts.coachedDaysBack ?? 0;
  const block = { id: 'b1', programId: 'p1', order: 1, label: 'Week 1-2', targetDate: null, sessions: [] as Row[] };
  const sessions = Array.from({ length: 8 }, (_, i) => ({
    id: `s${i + 1}`, blockId: 'b1', order: i + 1, label: `Session ${i + 1}`, block,
    exercises: i === 6 ? [{
      id: 'se-7-1', sessionId: 's7', exerciseId: 'pe-goblet', order: 1, sets: 3, reps: '8-10', load: 'RPE7', tempo: '3-1-1-0',
      restSeconds: 90, coachNote: 'Own the bottom.', exercise: CATALOGUE.goblet,
    }] : [{
      id: `se-${i + 1}-1`, sessionId: `s${i + 1}`, exerciseId: 'pe-split', order: 1, sets: 3, reps: '8 ea', load: 'RPE6', tempo: '3-1-1-0',
      restSeconds: 90, coachNote: null, exercise: CATALOGUE.split,
    }],
  }));
  block.sessions = sessions;
  const program: Row = {
    id: 'p1', coachId: 'coach-1', clientId: 'client-1', name: 'Base block', isActive: true, startDate: ago(14), createdAt: ago(14), updatedAt: ago(1),
    blocks: [block],
  };
  // six coached sessions done, one every two days, the last one yesterday — every one with a logged set
  const clientSessions = Array.from({ length: 6 }, (_, i) => ({
    id: `cs${i + 1}`, programId: 'p1', sessionId: `s${i + 1}`, clientId: 'client-1',
    completedAt: ago(11 - 2 * i + back), createdAt: ago(11 - 2 * i + back), updatedAt: ago(11 - 2 * i + back),
    program, session: sessions[i],
    exerciseLogs: [{
      id: `log${i + 1}`, clientSessionId: `cs${i + 1}`, sessionExerciseId: `se-${i + 1}-1`, actualSets: 3, actualReps: '8,8,8', actualLoad: '24kg',
      rpe: 7, clientNote: null, videoUrl: null, completedAt: ago(11 - 2 * i + back), coachComment: null, coachCommentAt: null,
      // createdAt + a shallow clientSession (MIRROR-COACH P2): the attention route reads logged work by these
      createdAt: ago(11 - 2 * i + back), clientSession: { clientId: 'client-1', programId: 'p1' },
      sessionExercise: sessions[i].exercises[0],
    }],
  }));
  program.clientSessions = clientSessions;
  // a Mirror screen that ran yesterday and graded nothing — the row app/api/mirror/screen stores for every screen today
  // …and, as a control (MIRROR-COACH P2 review, 2026-09-26), one that graded a check — what P3's graders will store
  const gradedResults = [{ checkId: 'heelLine', grade: 'stable', source: 'camera' }] as Parameters<typeof scoreScreen>[1];
  const screen = opts.screenYesterday
    ? [{ id: 'scan1', userId: 'client-1', kind: MIRROR_SCREEN_KIND, createdAt: ago(1), metrics: storedScreen('screen-1', 'modified', [], scoreScreen('modified', [])) }]
    : opts.gradedScreenYesterday
      ? [{ id: 'scan1', userId: 'client-1', kind: MIRROR_SCREEN_KIND, createdAt: ago(1), metrics: storedScreen('screen-1', 'modified', gradedResults, scoreScreen('modified', gradedResults)) }]
      : [];
  m.db = {
    coachingProgram: [program],
    coachClient: [{ id: 'cc1', coachId: 'coach-1', clientId: 'client-1', endedAt: null, createdAt: ago(30), via: 'invite' }],
    user: [{ id: 'client-1', name: 'Sam Fixture', email: 'sam@fixture.test' }, { id: 'coach-1', name: 'Coach Fixture', email: 'coach@fixture.test' }],
    gameSession: Array.from({ length: opts.games }, (_, i) => ({ id: `g${i}`, userId: 'client-1', createdAt: ago(11 - 2 * i), mode: 'onevone', score: 10, won: false })),
    prqEntry: [],
    workoutScan: screen,
    // the coached work: in the database, and in the tables a board could read
    clientSession: clientSessions,
    exerciseLog: clientSessions.flatMap((c) => c.exerciseLogs),
    // three sets per log, saved with the log (MIRROR-COACH P2 SetLog)
    setLog: clientSessions.flatMap((c) => c.exerciseLogs.flatMap((l) => [0, 1, 2].map((k) => ({
      id: `${l.id}-set${k}`, exerciseLogId: l.id, setIndex: k, reps: 8, weightKg: 24, rir: 3, effort: 7, workSeconds: null, note: null,
      createdAt: l.createdAt, exerciseLog: { clientSession: l.clientSession },
    })))),
    programExercise: [CATALOGUE.box, CATALOGUE.goblet, CATALOGUE.split],
  };
}

/** Call a GET route as `user`, and return its JSON. */
async function call(get: unknown, user: string, url?: string): Promise<Row> {
  const was = m.session;
  m.session = { user: { id: user } };
  try {
    const fn = get as (r?: unknown) => Promise<Response>;
    const res = await (url ? fn(new NextRequest(`http://fel.test${url}`)) : fn());
    return await res.json() as Row;
  } finally { m.session = was; }
}

beforeEach(() => { m.touched.clear(); m.calls.length = 0; });

afterAll(() => {
  const out = process.env.MIRROR_BASELINE_OUT;
  if (out) writeFileSync(out, JSON.stringify(measured, null, 2));
});

// FIXED IN P2 (MIRROR-COACH P2 catalogue plumbing, 2026-09-25). The baseline measured exactly one poster to
// /api/coach/programs/exercises (lib/hooks/useExerciseLibrary.ts) and no served page mounting it, useExerciseLibrary,
// ExerciseLibrary or TrainingCoachDashboard (the before is kept in the outbox baseline, BASELINE.md). The /coach
// Exercises tab now mounts MyCatalogue (app/coach/_components/my-catalogue.tsx) for coaches, which creates, edits and
// deletes catalogue rows, and every KB exercise has "Add to my catalogue". The retired form stays unmounted on purpose:
// it is superseded, not revived. The route-level proof (two coaches, one name; the bridge; ownership) is in
// lib/coach/catalogue-routes.test.ts.
describe('BASELINE 1: the prescribable catalogue can be filled from a page the app serves (fixed in P2)', () => {
  it('a served page now POSTs to /api/coach/programs/exercises: My catalogue on the /coach Exercises tab', () => {
    const posters = filesMatching(ROOT, ['app', 'components', 'lib'], CATALOGUE_POST);
    expect(posters.map((p) => p.slice(ROOT.length + 1)).sort()).toEqual(['app/coach/_components/my-catalogue.tsx', 'lib/hooks/useExerciseLibrary.ts']);
    const mounts = whoMounts([
      { file: `${ROOT}/app/coach/_components/my-catalogue.tsx`, name: 'MyCatalogue' },
      { file: `${ROOT}/lib/hooks/useExerciseLibrary.ts`, name: 'useExerciseLibrary' },
      { file: `${ROOT}/components/training/library/ExerciseLibrary.tsx`, name: 'ExerciseLibrary' },
      { file: `${ROOT}/components/training/TrainingDashboard.tsx`, name: 'TrainingCoachDashboard' },
      // controls: the walker does see what IS mounted — the coach's Clients tab and the client-only training view
      { file: `${ROOT}/app/coach/_components/clients-view.tsx`, name: 'ClientsView' },
      { file: `${ROOT}/components/training/TrainingDashboard.tsx`, name: 'TrainingClientView' },
      { file: `${ROOT}/app/coach/admin/_components/kb-admin.tsx`, name: 'KBAdmin' },
    ], ROOT);
    measured.catalogue = { posters: posters.map((p) => p.slice(ROOT.length + 1)), mounts };
    expect(mounts['app/coach/_components/my-catalogue.tsx#MyCatalogue'].served).toContain('app/coach/page.tsx');
    // the retired form: still unmounted, superseded by MyCatalogue (removing it is left to a tidy pass)
    expect(mounts['lib/hooks/useExerciseLibrary.ts#useExerciseLibrary'].served).toEqual([]);
    expect(mounts['components/training/library/ExerciseLibrary.tsx#ExerciseLibrary'].served).toEqual([]);
    expect(mounts['components/training/TrainingDashboard.tsx#TrainingCoachDashboard'].served).toEqual([]);
    expect(mounts['app/coach/_components/clients-view.tsx#ClientsView'].served).toContain('app/coach/page.tsx');
    expect(mounts['components/training/TrainingDashboard.tsx#TrainingClientView'].served).toContain('app/training/page.tsx');
    expect(mounts['app/coach/admin/_components/kb-admin.tsx#KBAdmin'].served).toContain('app/coach/admin/page.tsx');
  });

  // The builder itself (still ProgramExercise ids only, and now only the caller's own) is the builder lane's, moved to
  // lib/coach/builderServer.ts and proved through its route in lib/coach/builder-route.test.ts; this checks only the
  // path the KB now has INTO that catalogue.
  it('the Blueprint KB now reaches the prescribable catalogue through "Add to my catalogue"', () => {
    const kb = readFileSync(`${ROOT}/app/coach/admin/_components/kb-admin.tsx`, 'utf8');
    expect(kb).toMatch(/fetch\('\/api\/coach\/exercises', \{\s*method: 'POST'/);   // the admin still writes the KB
    // the bridge: a served page posts a KB id, the route copies it into the caller's ProgramExercise catalogue
    const tab = readFileSync(`${ROOT}/app/coach/_components/exercise-catalogue.tsx`, 'utf8');
    expect(tab).toMatch(/fetch\('\/api\/coach\/programs\/exercises\/from-kb', \{ method: 'POST'/);
    const bridge = readFileSync(`${ROOT}/app/api/coach/programs/exercises/from-kb/route.ts`, 'utf8');
    expect(bridge).toMatch(/copyKbToCatalogue\(session\.user\.id, kbExerciseId\)/);
    const mounts = whoMounts([{ file: `${ROOT}/app/coach/_components/exercise-catalogue.tsx`, name: 'ExerciseCatalogue' }], ROOT);
    expect(mounts['app/coach/_components/exercise-catalogue.tsx#ExerciseCatalogue'].served).toContain('app/coach/page.tsx');
  });
});

// FIXED IN THE P1 REVIEW (2026-09-25). The baseline measured this board telling a coach that a client with six coached
// sessions in twelve days and no games was "stalled", "Has never completed a session.", headline "1 athlete has stopped
// training." — it read GameSession only (the before is kept in the outbox baseline, coach-routes.json). The route now
// reads completed ClientSessions too, and these expectations moved with it.
//
// FLIPPED AGAIN IN P2 (MIRROR-COACH P2 compliance-and-roster lane, 2026-09-25), on purpose, one expectation at a time:
//   · P1 counted games AND coached sessions in one list ("6 games + 6 coached sessions = 12"). Games are now a separate
//     signal: `recent` is coached sessions only, `games` rides beside it, and the note says both. A client who only
//     plays games is "stalled" on the program (lib/coach/compliance.ts STALLED_DAYS = 10 days without coached work).
//   · P1's triage still raised stale-scan ("No PRQ System Scan on file.") on this client — who logged six coached
//     sessions, and, in the second case, ran a Mirror screen the day before (F7 of the P1 baseline). Coached work and a
//     Mirror screen now count as current data (lib/coach/triage.ts dataOnFile), so neither case is flagged; when
//     nothing is current, the flag lists what IS on file.
//   · The route now also reads the logged work (ExerciseLog, SetLog) and tells Mirror screens from other scans.
describe('BASELINE 2: the attention board counts coached work, with games as a separate signal (P2)', () => {
  it('a client with 6 coached sessions in 12 days and no games reads as steady, and triage has nothing to ask for', async () => {
    seed({ games: 0 });
    const board = await call(attentionGET, 'coach-1') as { drift: Row[]; headline: string | null; triage: { flags: { kind: string }[] } };
    measured.attention = { coachedOnly: board, tablesRead: [...m.touched].sort() };
    // what the route reads: coached sessions, the logged work under them, and games — each on its own
    for (const t of ['gameSession', 'clientSession', 'exerciseLog', 'setLog', 'workoutScan']) expect(m.touched.has(t), t).toBe(true);
    // what the coach is told
    expect(board.drift).toHaveLength(1);
    expect(board.drift[0]).toMatchObject({ clientId: 'client-1', state: 'steady', daysSince: 1, recent: 6, previous: 0, games: 0, note: '6 coached sessions in the last two weeks.' });
    expect(JSON.stringify(board)).not.toMatch(/never completed a session|stopped training/i);
    expect(board.headline).toBeNull();
    // P1: ['stale-scan'] ("No PRQ System Scan on file."). P2: six logged coached sessions are something to program from.
    expect(board.triage.flags).toEqual([]);
  });

  // FLIPPED IN THE P2 REVIEW (2026-09-26): P2 counted this fixture's screen — which graded NOTHING, like every screen
  // stored until P3 — as current data, and asserted triage said nothing. An ungraded screen is not something to program
  // from (P1's Mirror-truth fix; /api/coach/prescribe answers it 'ungraded_screen'), so the flag stays, and a GRADED
  // screen is the control that clears it.
  it('the day after an UNGRADED Mirror screen triage still asks for a scan; after a GRADED one it does not (F7)', async () => {
    // the coached work pushed back past the two-week window, so the screen is the only candidate for current data
    seed({ games: 0, screenYesterday: true, coachedDaysBack: 14 });
    const ungraded = await call(attentionGET, 'coach-1') as { drift: Row[]; headline: string | null; triage: { flags: { kind: string; observed: string; action: string }[] } };
    (measured.attention as Row).coachedAndUngradedScreen = ungraded;
    expect(ungraded.triage.flags).toEqual([expect.objectContaining({
      kind: 'stale-scan',
      observed: 'No PRQ System Scan on file; no graded Mirror screen; last coached work 15 days ago.',
      action: 'Ask for a System Scan — there is nothing current to program from.',
    })]);

    seed({ games: 0, gradedScreenYesterday: true, coachedDaysBack: 14 });
    const screened = await call(attentionGET, 'coach-1') as { drift: Row[]; headline: string | null; triage: { flags: { kind: string; observed: string }[] } };
    (measured.attention as Row).coachedAndScreened = screened;
    // P1: [stale-scan "No PRQ System Scan on file."] the day after the screen. P2: a GRADED screen is current data.
    expect(screened.triage.flags).toEqual([]);
    // …while compliance, which is about the coached work, says it has stopped — and what "stopped" means
    expect(screened.drift[0]).toMatchObject({ state: 'stalled', daysSince: 15, games: 0, note: 'No coached session for 15 days.' });
    expect(screened.headline).toBe('1 athlete has had no coached session in 10+ days.');

    // control: no screen, three games in the last fortnight (so not gone quiet) — nothing current, and the flag lists
    // each source instead of naming the one it read
    seed({ games: 3, coachedDaysBack: 14 });
    const unscreened = await call(attentionGET, 'coach-1') as { drift: Row[]; triage: { flags: { kind: string; observed: string; action: string }[] } };
    (measured.attention as Row).coachedLapsedNoScreen = unscreened;
    expect(unscreened.triage.flags).toEqual([expect.objectContaining({
      kind: 'stale-scan',
      observed: 'No PRQ System Scan on file; no graded Mirror screen; last coached work 15 days ago.',
      action: 'Ask for a System Scan — there is nothing current to program from.',
    })]);
    expect(unscreened.drift[0]).toMatchObject({ state: 'stalled', games: 3, note: 'No coached session for 15 days. Still playing: 3 games in the last two weeks.' });
  });

  it('control: games ride beside the coached sessions, never inside them (P1: 6 games + 6 coached = 12)', async () => {
    seed({ games: 6 });
    const board = await call(attentionGET, 'coach-1') as { drift: Row[] };
    (measured.attention as Row).gamesControl = board;
    // P1: { recent: 12 }. P2: six coached sessions, and the six games named beside them
    expect(board.drift[0]).toMatchObject({ state: 'steady', recent: 6, games: 6, note: '6 coached sessions in the last two weeks · 6 games.' });
  });
});

// FLIPPED IN P2 (MIRROR-COACH P2 client-today lane, 2026-09-25). The baseline measured the route handing the client
// name + dose only — the fixture's cues, fault, demo video, equipment and regression never left the server, because
// TREE_INCLUDE selected the catalogue row's name and category — and the card rendering the name, the dose line and the
// coach note, with a free-text load box pre-filled with "RPE7" (the before is kept in the outbox baseline, BASELINE.md,
// and in this file's history). The route now carries the coaching (lib/coach/today.ts), the card renders it, and the
// client logs per set (lib/coach/setLog.ts). The full read/save trip is in lib/coach/today-route.test.ts.
describe('BASELINE 3: Today hands the client the catalogue\'s coaching and logs per set (fixed in P2)', () => {
  it('the route carries cues, faults, the demo, equipment and the easier version by name; the card renders them; the client logs sets', async () => {
    seed({ games: 0 });
    const today = await call(todayGET, 'client-1') as { today: { index: number; session: { exercises: Row[] } } };
    const ex = today.today.session.exercises[0];
    // what the card reads: every `e.<field>` and `c.<coaching field>` in the ExerciseCard of today-view.tsx
    const view = readFileSync(`${ROOT}/app/coach/_components/today-view.tsx`, 'utf8');
    const card = view.slice(view.indexOf('function ExerciseCard('));
    const rendered = [...new Set([...card.matchAll(/\be\.(\w+)/g)].map((x) => x[1]))].sort();
    const coachingRendered = [...new Set([...card.matchAll(/\bc\.(\w+)/g)].map((x) => x[1]))].sort();
    // what the client types: per set (set-logger.tsx binds these), per exercise (the card binds these)
    const logger = readFileSync(`${ROOT}/components/coach/set-logger.tsx`, 'utf8');
    const setInputs = [...new Set([...logger.matchAll(/set\(i, \{ (\w+):/g)].map((x) => x[1]))].sort();
    const cardInputs = [...new Set([...card.matchAll(/value=\{draft\.(\w+)\}/g)].map((x) => x[1]))].sort();
    measured.today = { exerciseKeys: Object.keys(ex), rendered, coachingRendered, setInputs, cardInputs };
    expect(today.today.index).toBe(6);                       // session 7 of 8: the first one not completed
    // + youthRules (P2 review, 2026-09-26): this fixture's client has no birth year, so youth rules apply (decision #20)
    expect(Object.keys(ex).sort()).toEqual(['coachNote', 'coaching', 'dose', 'effortBand', 'exerciseId', 'holdSeconds', 'id', 'isKeySet', 'load', 'name', 'order', 'reps', 'restSeconds', 'section', 'sets', 'setupCues', 'supersetGroup', 'tempo', 'timers', 'workSeconds', 'youthRules']);
    expect(ex).toMatchObject({ name: 'Goblet Squat', sets: 3, reps: '8-10', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90, coachNote: 'Own the bottom.', dose: '3 × 8-10 @ RPE7' });
    // what used to stay on the server now reaches the client — 'Box Squat' by name, from the coach's own catalogue
    expect(ex.coaching).toMatchObject({
      cues: ['Elbows inside the knees', 'Spread the floor', 'Chest proud'],
      faults: [{ fault: 'Knees drift in', fix: 'Push the knees out over the toes' }],
      demo: { kind: 'file', src: 'https://video.example/goblet-squat.mp4' },
      equipment: ['kettlebell'],
      easier: { id: 'pe-box', name: 'Box Squat' },
    });
    // the card renders them, and the old per-exercise load box is gone: sets, not a free-text load
    for (const f of ['coachNote', 'dose', 'isKeySet', 'name', 'coaching', 'timers']) expect(rendered).toContain(f);
    expect(coachingRendered).toEqual(expect.arrayContaining(['band', 'cues', 'demo', 'easier', 'faults', 'setup']));
    expect(setInputs).toEqual(['effort', 'reps', 'rir', 'weight', 'workSeconds']);
    expect(cardInputs).toEqual(['clientNote', 'videoUrl']);
    expect(view).not.toMatch(/actualLoad/);
    // the query asks the catalogue row for its coaching columns (lib/coach/server.ts TREE_INCLUDE)
    const q = m.calls.find((c) => c.model === 'coachingProgram');
    expect(JSON.stringify(q?.args)).toContain('"exercise":{"select":{"name":true,"category":true,"primaryCues":true,"commonFaults":true,"demoVideoUrl":true');
    // …and the easier version's name is read from THIS coach's catalogue only
    const names = m.calls.find((c) => c.model === 'programExercise' && c.op === 'findMany');
    expect(names?.args).toMatchObject({ where: { id: { in: ['pe-box'] }, coachId: 'coach-1' } });
  });
});

describe('BASELINE 4: the coach\'s Clients tab and the client\'s Today tab, as the routes serve them', () => {
  it('every route the two tabs call answers on the fixture database (kept for the baseline frames)', async () => {
    seed({ games: 0, screenYesterday: true });
    const coach = {
      '/api/coach/programs': await call(programsGET, 'coach-1'),
      '/api/coach/programs/exercises': await call(catalogueGET, 'coach-1'),
      '/api/coach/inbox': await call(inboxGET, 'coach-1'),
      '/api/coach/roster': await call(rosterGET, 'coach-1'),
      '/api/coach/attention': await call(attentionGET, 'coach-1'),
      '/api/coach/prescribe?clientId=client-1': await call(prescribeGET, 'coach-1', '/api/coach/prescribe?clientId=client-1'),
      '/api/coach/invite': await call(inviteGET, 'coach-1'),
    };
    const client = {
      '/api/coach/programs': await call(programsGET, 'client-1'),
      '/api/coach/me/today': await call(todayGET, 'client-1'),
    };
    measured.routes = { coach, client };
    // the roster's "sessions" is GameSession (lib/camp/profile.ts composeProfile history.sessions): 0 here — so the
    // Clients tab labels it "games" (P1 review; it said "0 sessions" about a client with six coached sessions).
    // FLIPPED IN P2 (compliance-and-roster lane, 2026-09-25; F8): the row now carries TWO numbers, the coached sessions
    // done for this coach and the games, and the Clients tab shows both ("6 coached · 0 games · 0W"); P1 showed the
    // games alone ('{r.sessions} games · {r.wins}W').
    const roster = (coach['/api/coach/roster'] as { roster: Row[] }).roster;
    expect(roster[0]).toMatchObject({ clientId: 'client-1', sessions: 0, games: 0, gamesAtCap: false, coachedSessions: 6, wins: 0 });
    const clientsView = readFileSync(`${ROOT}/app/coach/_components/clients-view.tsx`, 'utf8');
    expect(clientsView).toContain('· {r.coachedSessions} coached </>}');
    expect(clientsView).toContain(' games · {r.wins}W');
    expect(clientsView).not.toContain('{r.sessions} games · {r.wins}W');
    expect(clientsView).not.toContain('{r.sessions} sessions');
    // …and the six-pattern strip (P2): this fixture's catalogue rows predate the pattern tag, so every cell is
    // "untagged" — never six misses (the absence-vs-zero rule, lib/coach/coverage.ts). Three coached sessions fall in
    // the last 7 days (5, 3 and 1 days ago); two distinct catalogue rows are untagged (Split Squat, Goblet Squat).
    const cov = roster[0].coverage as { cells: { state: string }[]; sessionsDone: number; untaggedDone: number; untaggedProgrammed: number };
    expect(new Set(cov.cells.map((c) => c.state))).toEqual(new Set(['untagged']));
    expect(cov).toMatchObject({ sessionsDone: 3, untaggedDone: 3, untaggedProgrammed: 2 });
    expect(clientsView).toContain('<CoverageStrip strip={r.coverage} />');
    // the inbox DOES see the coached work: six completed sessions, all waiting for a comment
    expect(coach['/api/coach/inbox']).toMatchObject({ needsReview: 6 });
    // the ungraded screen reaches the coach's panel as ungraded (the mirror-truth fix), never as clear
    expect(coach['/api/coach/prescribe?clientId=client-1']).toMatchObject({ prescriptions: [], reason: 'ungraded_screen' });
  });
});
