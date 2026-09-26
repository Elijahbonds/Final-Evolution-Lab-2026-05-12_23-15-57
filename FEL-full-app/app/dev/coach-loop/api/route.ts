export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { builderAction, loadProgram, type BuilderDb } from '@/lib/coach/builderServer';
import { builderMemoryDb, createProgram, type BuilderStore } from '@/lib/coach/builderMemoryDb';
import { loadToday, saveClientLog, type TodayDb } from '@/lib/coach/todayServer';
import { catalogueRow, newTodayStore, todayMemoryDb, type TodayStore } from '@/lib/coach/todayMemoryDb';

/**
 * /dev/coach-loop/api — ONE store under the coach's builder AND the client's Today (MIRROR-COACH P2 live proof,
 * 2026-09-26). Development only: a hard 404 outside `next dev`.
 *
 * /dev/program-builder and /dev/coach-today each seed their own in-memory store, so neither proves that what a coach
 * builds is what the client is handed. This keeps one store with both shapes (lib/coach/builderMemoryDb.ts +
 * lib/coach/todayMemoryDb.ts, which share the program → block → session → session-exercise → catalogue tables) and
 * runs the SAME server functions the real routes call over it:
 *
 *   GET  ?op=load        → { program, warnings }   the coach's GET /api/coach/programs/:id       (builderServer.loadProgram)
 *   GET  ?op=catalogue   → the coach's catalogue    GET /api/coach/programs/exercises
 *   POST ?op=action      → { tree }                 POST /api/coach/programs/:id/exercises          (builderServer.builderAction)
 *   GET  ?op=today       → the Today payload        the client's GET /api/coach/me/today            (todayServer.loadToday)
 *   POST ?op=log         → { clientSession }        the client's POST /api/coach/me/log             (todayServer.saveClientLog)
 *   GET  ?op=store       → raw session exercises, logs, set logs (what a probe compares a screen with)
 *   GET  ?op=reset       → a fresh seed: an empty two-day week and a catalogue written out in full
 *
 * The seed is catalogue rows only (with cues, faults, demos, easier versions and FEL's pattern tags) and an EMPTY
 * program: every prescription on the Today screen got there through the builder. The lane's database is offline on
 * purpose and the real routes answer 401 without a session; the only code here is their status mapping and the seed.
 * The client has a birth year (1994) so adult rules apply; the youth gate is proven elsewhere (today-route.test.ts).
 */
const COACH = 'dev-coach', CLIENT = 'dev-client';
type LoopStore = TodayStore & BuilderStore;
const g = globalThis as unknown as { __felCoachLoopDev?: { store: LoopStore; programId: string } };

function seed(): { store: LoopStore; programId: string } {
  const store = { ...newTodayStore(), fac: [] } as LoopStore;
  store.fac.push({ userId: COACH, certificationStatus: 'certified' });
  store.user.push(
    { id: COACH, name: 'Coach Dev', email: 'coach@dev.test', dobYear: 1988 },
    { id: CLIENT, name: 'Sam Dev', email: 'sam@dev.test', dobYear: 1994 },
  );
  const row = (r: Record<string, unknown>) => catalogueRow({ coachId: COACH, ...r });
  store.pe.push(
    row({ id: 'pe-flow', name: '90/90 hip switch', category: 'mobility', pattern: 'mobility', braceMode: 'none', skillLayer: 'joints',
      primaryCues: ['Both knees stay on the floor', 'Turn from the hips, not the low back'], commonFaults: [{ fault: 'Hands pushing the floor', correctionCue: 'Hands off: let the hips do the turn' }] }),
    row({ id: 'pe-pogo', name: 'Pogo hops', category: 'plyometric', pattern: 'locomotion', braceMode: 'reflex', skillLayer: 'jump-land',
      demoVideoUrl: 'https://youtu.be/q1HLjLbhS2s', primaryCues: ['Stiff ankles, springy contacts'], commonFaults: [{ fault: 'Long ground contacts', correctionCue: 'Off the floor as fast as it touches' }] }),
    row({ id: 'pe-box', name: 'Box squat', category: 'lower-body', pattern: 'squat', braceMode: 'set' }),
    row({ id: 'pe-goblet', name: 'Goblet squat', category: 'lower-body', pattern: 'squat', braceMode: 'set', skillLayer: 'strength', equipment: ['kettlebell'],
      demoVideoUrl: 'https://fel.local/v/goblet-squat.mp4',
      primaryCues: ['Elbows inside the knees', 'Spread the floor with your feet', 'Chest proud at the bottom'],
      commonFaults: [{ fault: 'Knees drift in on the way up', correctionCue: 'Push the knees out over the toes' }, { fault: 'Heels lift', correctionCue: 'Sit between the heels, weight mid-foot' }],
      regressionOfId: 'pe-box' }),
    row({ id: 'pe-split', name: 'Split squat', category: 'lower-body', pattern: 'lunge', braceMode: 'set', primaryCues: ['Drive the floor down through the front heel'] }),
    row({ id: 'pe-row', name: 'Half-kneeling row', category: 'upper-pull', pattern: 'pull', braceMode: 'set', primaryCues: ['Elbow to the back pocket'] }),
    row({ id: 'pe-plank', name: 'Front plank', category: 'core', pattern: 'other', braceMode: 'set', primaryCues: ['Ribs down, squeeze the glutes'] }),
    row({ id: 'pe-carry', name: 'Suitcase carry', category: 'conditioning', pattern: 'carry', braceMode: 'set', equipment: ['kettlebell'], primaryCues: ['Stand tall, bell off the leg'] }),
    row({ id: 'pe-croc', name: 'Crocodile breathing', category: 'breath', pattern: 'breath', braceMode: 'none', skillLayer: 'cylinder', primaryCues: ['Belly into the floor on the way in'] }),
    row({ id: 'pe-pushup', name: 'Push-up', category: 'upper-push', pattern: 'push', braceMode: 'set', primaryCues: ['Screw the hands into the floor'] }),
    row({ id: 'pe-press', name: 'Landmine press', category: 'upper-push', pattern: 'push', braceMode: 'set' }),
    row({ id: 'pe-bench', name: 'DB bench press', category: 'upper-push', pattern: 'push', braceMode: 'set' }),
  );
  const p = createProgram(store, {
    coachId: COACH, clientId: CLIENT, name: 'Dev: loop block', startDate: new Date('2026-09-28T00:00:00Z'), durationWeeks: 1,
    blocks: { create: [{ order: 1, label: 'Week 1', sessions: { create: [{ order: 1, label: 'Day 1 — full' }, { order: 2, label: 'Day 2 — upper' }] } }] },
  });
  return { store, programId: p.id };
}

const state = (reset = false) => { if (!g.__felCoachLoopDev || reset) g.__felCoachLoopDev = seed(); return g.__felCoachLoopDev; };
const bdb = () => builderMemoryDb(state().store) as unknown as BuilderDb;
const tdb = () => todayMemoryDb(state().store) as unknown as TodayDb;
const devOnly = () => (process.env.NODE_ENV !== 'development' ? NextResponse.json({ error: 'not_found' }, { status: 404 }) : null);

export async function GET(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  const op = req.nextUrl.searchParams.get('op');
  if (op === 'reset') { state(true); return NextResponse.json({ ok: true, programId: state().programId }); }
  if (op === 'catalogue') return NextResponse.json(state().store.pe.filter((r) => r.coachId === COACH));
  if (op === 'load') {
    const r = await loadProgram(bdb(), COACH, state().programId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ program: r.program, warnings: r.warnings });
  }
  if (op === 'today') return NextResponse.json(await loadToday(tdb(), CLIENT));
  if (op === 'store') { const s = state().store; return NextResponse.json({ sessionExercises: s.se, clientSessions: s.cs, logs: s.log, setLogs: s.setLog }); }
  return NextResponse.json({ error: 'unknown_op' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  const op = req.nextUrl.searchParams.get('op');
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  if (op === 'action') {
    const r = await builderAction(bdb(), COACH, state().programId, body as Record<string, unknown>);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ tree: r.tree });
  }
  if (op === 'log') {
    const r = await saveClientLog(tdb(), CLIENT, body as Record<string, unknown>);
    if (!r.ok) { const { ok: _ok, status, ...err } = r; return NextResponse.json(err, { status }); }
    return NextResponse.json({ clientSession: r.clientSession });
  }
  return NextResponse.json({ error: 'unknown_op' }, { status: 400 });
}
