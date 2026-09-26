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
const RELATIONS = new Set(['block', 'blocks', 'sessions', 'exercises', 'exercise', 'clientSessions', 'exerciseLogs', 'sessionExercise', 'program', 'session', 'clientSession', 'sessionExercises']);
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

function seed(opts: { games: number; screenYesterday?: boolean }) {
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
    completedAt: ago(11 - 2 * i), createdAt: ago(11 - 2 * i), updatedAt: ago(11 - 2 * i),
    program, session: sessions[i],
    exerciseLogs: [{
      id: `log${i + 1}`, clientSessionId: `cs${i + 1}`, sessionExerciseId: `se-${i + 1}-1`, actualSets: 3, actualReps: '8,8,8', actualLoad: '24kg',
      rpe: 7, clientNote: null, videoUrl: null, completedAt: ago(11 - 2 * i), coachComment: null, coachCommentAt: null,
      sessionExercise: sessions[i].exercises[0],
    }],
  }));
  program.clientSessions = clientSessions;
  // a Mirror screen that ran yesterday and graded nothing — the row app/api/mirror/screen stores for every screen today
  const screen = opts.screenYesterday
    ? [{ id: 'scan1', userId: 'client-1', kind: MIRROR_SCREEN_KIND, createdAt: ago(1), metrics: storedScreen('screen-1', 'modified', [], scoreScreen('modified', [])) }]
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

describe('BASELINE 1: the prescribable catalogue cannot be filled from any page the app serves', () => {
  it('the only POST to /api/coach/programs/exercises is useExerciseLibrary, and no served page mounts it', () => {
    const posters = filesMatching(ROOT, ['app', 'components', 'lib'], CATALOGUE_POST);
    expect(posters.map((p) => p.slice(ROOT.length + 1))).toEqual(['lib/hooks/useExerciseLibrary.ts']);
    const mounts = whoMounts([
      { file: `${ROOT}/lib/hooks/useExerciseLibrary.ts`, name: 'useExerciseLibrary' },
      { file: `${ROOT}/components/training/library/ExerciseLibrary.tsx`, name: 'ExerciseLibrary' },
      { file: `${ROOT}/components/training/TrainingDashboard.tsx`, name: 'TrainingCoachDashboard' },
      // controls: the walker does see what IS mounted — the coach's Clients tab and the client-only training view
      { file: `${ROOT}/app/coach/_components/clients-view.tsx`, name: 'ClientsView' },
      { file: `${ROOT}/components/training/TrainingDashboard.tsx`, name: 'TrainingClientView' },
      // the one exercise-creating UI that IS served writes the Blueprint knowledge base, which the builder cannot prescribe
      { file: `${ROOT}/app/coach/admin/_components/kb-admin.tsx`, name: 'KBAdmin' },
    ], ROOT);
    measured.catalogue = { posters: posters.map((p) => p.slice(ROOT.length + 1)), mounts };
    // phase 2 mounts a catalogue editor: these three become non-empty
    expect(mounts['lib/hooks/useExerciseLibrary.ts#useExerciseLibrary'].served).toEqual([]);
    expect(mounts['components/training/library/ExerciseLibrary.tsx#ExerciseLibrary'].served).toEqual([]);
    expect(mounts['components/training/TrainingDashboard.tsx#TrainingCoachDashboard'].served).toEqual([]);
    expect(mounts['app/coach/_components/clients-view.tsx#ClientsView'].served).toContain('app/coach/page.tsx');
    expect(mounts['components/training/TrainingDashboard.tsx#TrainingClientView'].served).toContain('app/training/page.tsx');
    expect(mounts['app/coach/admin/_components/kb-admin.tsx#KBAdmin'].served).toContain('app/coach/admin/page.tsx');
  });

  it('the builder only takes ProgramExercise ids, so the Blueprint KB the admin page writes cannot be prescribed', () => {
    const src = readFileSync(`${ROOT}/app/api/coach/programs/[id]/exercises/route.ts`, 'utf8');
    expect(src).toMatch(/prisma\.programExercise\.findUnique\(\{ where: \{ id: v\.spec\.exerciseId \}/);
    expect(src).toMatch(/if \(!ex\) return bad\('exercise_not_found', 404\)/);
    const kb = readFileSync(`${ROOT}/app/coach/admin/_components/kb-admin.tsx`, 'utf8');
    expect(kb).toMatch(/fetch\('\/api\/coach\/exercises', \{\s*method: 'POST'/);
  });
});

// FIXED IN THE P1 REVIEW (2026-09-25). The baseline measured this board telling a coach that a client with six coached
// sessions in twelve days and no games was "stalled", "Has never completed a session.", headline "1 athlete has stopped
// training." — it read GameSession only (the before is kept in the outbox baseline, coach-routes.json). The route now
// reads completed ClientSessions too, and these expectations moved with it.
describe('BASELINE 2: the attention board counts coached sessions as well as games', () => {
  it('a client with 6 coached sessions in 12 days and no games reads as steady (was: stalled, "never completed a session")', async () => {
    seed({ games: 0 });
    const board = await call(attentionGET, 'coach-1') as { drift: Row[]; headline: string | null; triage: { flags: { kind: string }[] } };
    measured.attention = { coachedOnly: board, tablesRead: [...m.touched].sort() };
    // what the route reads
    expect(m.touched.has('gameSession')).toBe(true);
    expect(m.touched.has('clientSession')).toBe(true);
    // what the coach is told
    expect(board.drift).toHaveLength(1);
    expect(board.drift[0]).toMatchObject({ clientId: 'client-1', state: 'steady', daysSince: 1, recent: 6, previous: 0, note: '6 sessions in the last two weeks.' });
    expect(JSON.stringify(board)).not.toMatch(/never completed a session|stopped training/i);
    expect(board.headline ?? '').not.toMatch(/stopped training/i);
    expect(board.triage.flags.map((f) => f.kind)).toEqual(['stale-scan']);
  });

  it('…and triage says which scan is missing: the PRQ System Scan, not "scan" (the day after a Mirror screen)', async () => {
    seed({ games: 0, screenYesterday: true });
    const board = await call(attentionGET, 'coach-1') as { drift: Row[]; headline: string | null; triage: { flags: { kind: string; observed: string }[] } };
    (measured.attention as Row).coachedAndScreened = board;
    expect(board.drift[0]).toMatchObject({ state: 'steady' });
    // triage's scan is a PRQ snapshot (lib/coach/triage.ts), so it names it — it used to say "No scan on file." to a
    // coach whose client ran a Mirror screen yesterday
    expect(board.triage.flags).toEqual([expect.objectContaining({ kind: 'stale-scan', observed: 'No PRQ System Scan on file.' })]);
  });

  it('control: games still count beside the coached sessions (6 games + 6 coached sessions = 12 in two weeks)', async () => {
    seed({ games: 6 });
    const board = await call(attentionGET, 'coach-1') as { drift: Row[] };
    (measured.attention as Row).gamesControl = board;
    expect(board.drift[0]).toMatchObject({ state: 'steady', recent: 12 });
  });
});

describe('BASELINE 3: Today hands the client the prescription numbers, not the catalogue\'s coaching', () => {
  it('the route returns name + dose only; cues, faults, demo video, equipment and the regression never leave the server', async () => {
    seed({ games: 0 });
    const today = await call(todayGET, 'client-1') as { today: { index: number; session: { exercises: Row[] } } };
    const ex = today.today.session.exercises[0];
    const text = JSON.stringify(today);
    // the rendered fields: every `e.<field>` the exercise card in today-view.tsx reads
    const view = readFileSync(`${ROOT}/app/coach/_components/today-view.tsx`, 'utf8');
    const card = view.slice(view.indexOf('today.session.exercises.map'), view.indexOf('<div className="flex gap-2">'));
    const rendered = [...new Set([...card.matchAll(/\be\.(\w+)/g)].map((x) => x[1]))].sort();
    // what the client types per exercise: the draft fields the card binds an input to
    const inputs = [...new Set([...card.matchAll(/(?:\bd\.|')(actualSets|actualReps|actualLoad|rpe|clientNote|videoUrl)\b/g)].map((x) => x[1]))].sort();
    measured.today = { exerciseKeys: Object.keys(ex), rendered, inputs };
    expect(today.today.index).toBe(6);                       // session 7 of 8: the first one not completed
    expect(Object.keys(ex).sort()).toEqual(['coachNote', 'id', 'load', 'name', 'order', 'reps', 'restSeconds', 'sets', 'tempo']);
    expect(ex).toMatchObject({ name: 'Goblet Squat', sets: 3, reps: '8-10', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90, coachNote: 'Own the bottom.' });
    // 'Box Squat' is the Goblet Squat's regression (regressionOfId) and is prescribed nowhere in this program
    for (const absent of ['Elbows inside the knees', 'Knees drift in', 'goblet-squat.mp4', 'kettlebell', 'Box Squat', 'primaryCues', 'commonFaults', 'demoVideoUrl', 'regressionOfId']) {
      expect(text).not.toContain(absent);
    }
    // the card renders the name, the dose line and the coach note (phase 2 adds cues, faults, regression, video)
    expect(rendered).toEqual(['coachNote', 'id', 'load', 'name', 'reps', 'restSeconds', 'sets', 'tempo']);
    expect(inputs).toEqual(['actualLoad', 'actualReps', 'actualSets', 'clientNote', 'rpe', 'videoUrl']);
    // the query itself asks the catalogue row for two columns (lib/coach/server.ts TREE_INCLUDE)
    const q = m.calls.find((c) => c.model === 'coachingProgram');
    expect(JSON.stringify(q?.args)).toContain('"exercise":{"select":{"name":true,"category":true}}');
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
    // Clients tab labels it "games" (P1 review; it said "0 sessions" about a client with six coached sessions)
    const roster = (coach['/api/coach/roster'] as { roster: Row[] }).roster;
    expect(roster[0]).toMatchObject({ clientId: 'client-1', sessions: 0, wins: 0 });
    const clientsView = readFileSync(`${ROOT}/app/coach/_components/clients-view.tsx`, 'utf8');
    expect(clientsView).toContain('{r.sessions} games · {r.wins}W');
    expect(clientsView).not.toContain('{r.sessions} sessions');
    // the inbox DOES see the coached work: six completed sessions, all waiting for a comment
    expect(coach['/api/coach/inbox']).toMatchObject({ needsReview: 6 });
    // the ungraded screen reaches the coach's panel as ungraded (the mirror-truth fix), never as clear
    expect(coach['/api/coach/prescribe?clientId=client-1']).toMatchObject({ prescriptions: [], reason: 'ungraded_screen' });
  });
});
