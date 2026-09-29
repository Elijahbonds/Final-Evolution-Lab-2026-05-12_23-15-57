export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { coachDraft, type CatalogueExercise } from '@/lib/coach/mirrorToProgram';
import { builderAction, loadProgram, type BuilderDb } from '@/lib/coach/builderServer';
import { builderMemoryDb, createProgram, newBuilderStore, type BuilderStore } from '@/lib/coach/builderMemoryDb';
import { COACH, FIXTURE_CATALOGUE, FIXTURE_PROGRAM, fixtureScreens, isDevCase, type DevCase } from '../fixture';
import { p3ScreenRows } from '../../mirror-coach-p3-screen/store';
import { storedScreenId } from '@/lib/mirror/screenStore';
import type { ScreenId } from '@/lib/mirror/screen';
import type { StationGrade } from '@/lib/mirror/stationGraders';

/**
 * /dev/coach-prescribe/api — MIRROR-COACH P3 live proof (2026-09-26). Development only: a hard 404 outside `next dev`.
 *
 * The lane's dev server runs with its database offline and no session, so GET /api/coach/prescribe and POST
 * /api/coach/programs/:id/exercises answer 401 here. This route runs the SAME library code those handlers run, with only
 * the session (a fixture coach) and the database (the stored screens from ../fixture, and lib/coach/builderMemoryDb for
 * the program) replaced:
 *
 *   GET  ?op=draft&case=…  → app/api/coach/prescribe: coachDraft(the client's screens, newest first; the coach's catalogue)
 *   GET  ?op=load&case=…   → the program tree (lib/coach/builderServer.ts loadProgram), the sessions to add into, and the
 *                            phone's own grades for the athlete's view (components/mirror/screen-next-steps.tsx)
 *   GET  ?op=reset&case=…  → a fresh program for the case
 *   POST ?op=add&case=…    → app/api/coach/programs/[id]/exercises: builderAction(…, body) — the builder's own add path
 *
 * ?case=live (MIRROR-COACH P3 live proof, 2026-09-26): the client's screen is not a fixture but the row
 * /dev/mirror-coach-p3-screen stored from the served harness's own POST (../../mirror-coach-p3-screen/store.ts) — the
 * one named by &screenId=, else the newest — so the panel drafts from the screen that just ran in the browser. The
 * athlete's side then shows the SERVER's grades from that row (its camera evidence), not the phone's.
 */
const devOnly = () => (process.env.NODE_ENV !== 'development' ? NextResponse.json({ error: 'not_found' }, { status: 404 }) : null);

type HarnessCase = DevCase | 'live';
const g = globalThis as unknown as { __felCoachPrescribe?: Partial<Record<HarnessCase, { store: BuilderStore; programId: string }>> };
function world(c: HarnessCase, fresh = false) {
  const all = (g.__felCoachPrescribe ??= {});
  if (fresh || !all[c]) {
    const store = newBuilderStore();
    store.fac = [{ userId: COACH, certificationStatus: 'certified' }];
    store.pe = FIXTURE_CATALOGUE.map((e) => ({ ...e, coachId: COACH, primaryCues: [], equipment: [] }));
    const p = createProgram(store, FIXTURE_PROGRAM);
    all[c] = { store, programId: p.id };
  }
  return all[c]!;
}
const caseOf = (req: NextRequest): HarnessCase => { const c = req.nextUrl.searchParams.get('case'); return c === 'live' ? 'live' : isDevCase(c) ? c : 'flags'; };

/** The case's screens, newest first, as GET /api/coach/prescribe reads them, and the grades the athlete's side shows. */
function screensFor(c: HarnessCase, screenId: string | null): { rows: { metrics: unknown; createdAt: string }[]; grades: StationGrade[]; screen: ScreenId } | null {
  if (c !== 'live') return fixtureScreens(c);
  const all = p3ScreenRows();
  const row = screenId ? [...all].reverse().find((r) => storedScreenId(r.metrics) === screenId) : all[all.length - 1];
  if (!row) return null;
  const m = row.metrics as { screen?: unknown; camera?: unknown };
  return {
    rows: [{ metrics: row.metrics, createdAt: row.at ?? new Date().toISOString() }],
    grades: Array.isArray(m.camera) ? m.camera as StationGrade[] : [],
    screen: m.screen === 'full' ? 'full' : 'modified',
  };
}

export async function GET(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  const c = caseOf(req);
  const op = req.nextUrl.searchParams.get('op');
  const w = world(c, op === 'reset');
  const f = screensFor(c, req.nextUrl.searchParams.get('screenId'));
  if (!f) return NextResponse.json({ error: 'no_live_screen', note: 'run the screen first: /dev/mirror-coach-p3-screen stores it' }, { status: 404 });
  if (op === 'draft') {
    const catalogue: CatalogueExercise[] = w.store.pe.filter((e) => e.coachId === COACH)
      .map((e) => ({ id: e.id, name: e.name, category: e.category, pattern: e.pattern, skillLayer: e.skillLayer, defaultTempo: e.defaultTempo }));
    return NextResponse.json(coachDraft(f.rows, catalogue));
  }
  const loaded = await loadProgram(builderMemoryDb(w.store) as unknown as BuilderDb, COACH, w.programId);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { tree } = loaded.program;
  return NextResponse.json({
    case: c, tree,
    sessions: tree.blocks.flatMap((b) => b.sessions.map((s) => ({ id: s.id, label: `${b.label} · ${s.label}` }))),
    screen: f.screen, grades: f.grades,
  });
}

export async function POST(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  if (req.nextUrl.searchParams.get('op') !== 'add') return NextResponse.json({ error: 'unknown_op' }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const w = world(caseOf(req));
  // — app/api/coach/programs/[id]/exercises/route.ts, from the body onwards —
  const r = await builderAction(builderMemoryDb(w.store) as unknown as BuilderDb, COACH, w.programId, body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ tree: r.tree });
}
