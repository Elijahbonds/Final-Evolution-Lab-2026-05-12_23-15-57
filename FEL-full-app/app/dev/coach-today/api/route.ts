export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { loadToday, saveClientLog, type TodayDb } from '@/lib/coach/todayServer';
import { catalogueRow, newTodayStore, seedProgram, todayMemoryDb, type TodayStore } from '@/lib/coach/todayMemoryDb';

/**
 * /dev/coach-today/api — the client's Today, server half, for the dev harness (MIRROR-COACH P2, 2026-09-25).
 * Development only: a hard 404 outside `next dev`.
 *
 * This lane's dev server runs with its database offline on purpose and no session, so the real routes answer 401
 * here before they do anything. This runs the SAME functions GET /api/coach/me/today and POST /api/coach/me/log call
 * (lib/coach/todayServer.ts loadToday / saveClientLog) over the in-memory store the route tests use
 * (lib/coach/todayMemoryDb.ts), as a fixed dev client. The only code here is the routes' status mapping and the seed.
 *
 *   GET  ?op=today   → the Today payload                  (GET /api/coach/me/today)
 *   POST ?op=log     → { clientSession } or { error, … }  (POST /api/coach/me/log)
 *   GET  ?op=store   → the stored logs + set logs, raw     (what a probe compares the screen with)
 *   GET  ?op=reset   → a fresh seed
 *
 * The seed is one coach's two-session week. Day 1 is done and carries a log saved BEFORE per-set logging (free-text
 * "24kg", RPE 7) with a coach comment; Day 2 is today, in every section, with a key set, a superset, timed items and a
 * catalogue written out in full — and an open log on the split squat saved the old way, so the old row's display is
 * on screen. The split squat's easier-version link points at ANOTHER coach's row, which must not be named.
 */
const COACH = 'dev-coach', CLIENT = 'dev-client';
const g = globalThis as unknown as { __felTodayDev?: TodayStore };

function seed(): TodayStore {
  const s = newTodayStore();
  s.user.push({ id: COACH, name: 'Coach Dev', email: 'coach@dev.test' }, { id: CLIENT, name: 'Sam Dev', email: 'sam@dev.test' });
  s.pe.push(
    catalogueRow({ id: 'pe-flow', coachId: COACH, name: '90/90 hip switch', category: 'mobility', pattern: 'mobility', braceMode: 'none', skillLayer: 'joints',
      primaryCues: ['Both knees stay on the floor', 'Turn from the hips, not the low back'], commonFaults: [{ fault: 'Hands pushing the floor', correctionCue: 'Hands off: let the hips do the turn' }] }),
    catalogueRow({ id: 'pe-pogo', coachId: COACH, name: 'Pogo hops', category: 'plyometric', pattern: 'locomotion', braceMode: 'reflex', skillLayer: 'jump-land',
      demoVideoUrl: 'https://youtu.be/q1HLjLbhS2s', primaryCues: ['Stiff ankles, springy contacts', 'Heels barely leave the floor'],
      commonFaults: [{ fault: 'Long ground contacts', correctionCue: 'Off the floor as fast as it touches' }, { fault: 'Heels sink at contact', correctionCue: 'Stay on the balls of the feet' }] }),
    catalogueRow({ id: 'pe-box', coachId: COACH, name: 'Box squat', category: 'lower-body', pattern: 'squat', braceMode: 'set' }),
    catalogueRow({ id: 'pe-goblet', coachId: COACH, name: 'Goblet squat', category: 'lower-body', pattern: 'squat', braceMode: 'set', skillLayer: 'strength', equipment: ['kettlebell'],
      primaryCues: ['Elbows inside the knees', 'Spread the floor with your feet', 'Chest proud at the bottom'],
      commonFaults: [{ fault: 'Knees drift in on the way up', correctionCue: 'Push the knees out over the toes' }, { fault: 'Heels lift', correctionCue: 'Sit between the heels, weight mid-foot' }],
      regressionOfId: 'pe-box', progressionOfId: 'pe-front' }),
    catalogueRow({ id: 'pe-front', coachId: COACH, name: 'Front squat', category: 'lower-body', pattern: 'squat', braceMode: 'set' }),
    catalogueRow({ id: 'pe-split', coachId: COACH, name: 'Split squat', category: 'lower-body', pattern: 'lunge', braceMode: 'set', demoVideoUrl: 'https://fel.local/v/split-squat.mp4',
      primaryCues: ['Drive the floor down through the front heel'], regressionOfId: 'pe-theirs' }),
    catalogueRow({ id: 'pe-row', coachId: COACH, name: 'Half-kneeling row', category: 'upper-pull', pattern: 'pull', braceMode: 'set', primaryCues: ['Elbow to the back pocket'] }),
    catalogueRow({ id: 'pe-carry', coachId: COACH, name: 'Suitcase carry', category: 'conditioning', pattern: 'carry', braceMode: 'set', equipment: ['kettlebell'], primaryCues: ['Stand tall, bell off the leg'] }),
    catalogueRow({ id: 'pe-croc', coachId: COACH, name: 'Crocodile breathing', category: 'breath', pattern: 'breath', braceMode: 'none', skillLayer: 'cylinder', primaryCues: ['Belly into the floor on the way in'] }),
    catalogueRow({ id: 'pe-theirs', coachId: 'dev-other-coach', name: 'ANOTHER COACH PRIVATE DRILL', category: 'general' }),
  );
  const ids = seedProgram(s, {
    coachId: COACH, clientId: CLIENT, name: 'Dev: base block', blockLabel: 'Week 1',
    sessions: [
      { order: 1, label: 'Day 1 — lower', exercises: [{ exerciseId: 'pe-goblet', sets: 3, reps: '8', load: '24kg' }] },
      { order: 2, label: 'Day 2 — full', exercises: [
        { exerciseId: 'pe-goblet', section: 'key', isKeySet: true, sets: 4, reps: '5', load: 'RPE8', tempo: '3-1-1-0', restSeconds: 150, effortBand: 'surge', setupCues: ['tripod-down', 'light-punch'], coachNote: 'Own the bottom.' },
        { exerciseId: 'pe-split', section: 'assist', supersetGroup: 'A', sets: 3, reps: '8 each', load: 'RPE7', effortBand: 'drive', setupCues: ['front-heel'] },
        { exerciseId: 'pe-row', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10 each', load: 'RPE7', holdSeconds: 2, setupCues: ['elbows-to-pockets'] },
        { exerciseId: 'pe-flow', section: 'prep', sets: 2, reps: '6 each side', load: 'body', holdSeconds: 5, restSeconds: 0, effortBand: 'idle' },
        { exerciseId: 'pe-carry', section: 'finish', sets: 3, reps: '30 s', workSeconds: 30, load: '24kg', restSeconds: 60, setupCues: ['crush-handle', 'grow-tall'] },
        { exerciseId: 'pe-pogo', section: 'prime', sets: 2, reps: '10', load: 'body', restSeconds: 45, effortBand: 'cruise', setupCues: ['quiet-landing'] },
        { exerciseId: 'pe-croc', section: 'cooldown', sets: 1, reps: '90 s', workSeconds: 90, load: 'body', restSeconds: 0, setupCues: ['long-exhale'] },
      ] },
    ],
  });
  // Day 1: done, logged the old way, with the coach's comment
  const at = new Date('2026-09-23T18:00:00Z');
  s.cs.push({ id: 'cs-day1', programId: ids.programId, sessionId: ids.sessionIds[0], clientId: CLIENT, completedAt: at, createdAt: at, updatedAt: at });
  s.log.push({ id: 'log-day1', clientSessionId: 'cs-day1', sessionExerciseId: ids.exerciseIds[0][0], actualSets: 3, actualReps: '8,8,8', actualLoad: '24kg', rpe: 7,
    clientNote: 'Last set slowed down.', videoUrl: null, coachComment: 'Good depth. Same weight next time, slower down.', coachCommentAt: new Date('2026-09-24T08:00:00Z'), completedAt: at, createdAt: at, updatedAt: at });
  // Day 2: started on an old card — one exercise saved as a single free-text row
  const open = new Date('2026-09-25T17:00:00Z');
  s.cs.push({ id: 'cs-day2', programId: ids.programId, sessionId: ids.sessionIds[1], clientId: CLIENT, completedAt: null, createdAt: open, updatedAt: open });
  s.log.push({ id: 'log-day2-split', clientSessionId: 'cs-day2', sessionExerciseId: ids.exerciseIds[1][1], actualSets: 3, actualReps: '8,8,8', actualLoad: '24kg', rpe: 7,
    clientNote: null, videoUrl: null, coachComment: null, coachCommentAt: null, completedAt: null, createdAt: open, updatedAt: open });
  return s;
}

const store = (reset = false) => { if (!g.__felTodayDev || reset) g.__felTodayDev = seed(); return g.__felTodayDev; };
const db = () => todayMemoryDb(store()) as unknown as TodayDb;
const devOnly = () => (process.env.NODE_ENV !== 'development' ? NextResponse.json({ error: 'not_found' }, { status: 404 }) : null);

export async function GET(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  const op = req.nextUrl.searchParams.get('op');
  if (op === 'reset') { store(true); return NextResponse.json({ ok: true }); }
  if (op === 'today') return NextResponse.json(await loadToday(db(), CLIENT));
  if (op === 'store') { const s = store(); return NextResponse.json({ clientSessions: s.cs, logs: s.log, setLogs: s.setLog }); }
  return NextResponse.json({ error: 'unknown_op' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  if (req.nextUrl.searchParams.get('op') !== 'log') return NextResponse.json({ error: 'unknown_op' }, { status: 400 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  const r = await saveClientLog(db(), CLIENT, body as Record<string, unknown>);
  if (!r.ok) { const { ok: _ok, status, ...err } = r; return NextResponse.json(err, { status }); }
  return NextResponse.json({ clientSession: r.clientSession });
}
