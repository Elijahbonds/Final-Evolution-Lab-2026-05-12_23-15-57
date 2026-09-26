export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { builderAction, loadProgram, type BuilderDb } from '@/lib/coach/builderServer';
import { builderMemoryDb, createProgram, newBuilderStore, type BuilderStore } from '@/lib/coach/builderMemoryDb';

/**
 * /dev/program-builder/api — the program builder's server half for the dev harness (MIRROR-COACH P2, 2026-09-25).
 * Development only: a hard 404 outside `next dev`.
 *
 * This lane's dev server runs with its database offline on purpose and no session, so the real builder routes answer
 * 401 here before they do anything. This runs the SAME functions those routes call (lib/coach/builderServer.ts
 * builderAction / loadProgram) over the in-memory store the route tests use (lib/coach/builderMemoryDb.ts), as a
 * fixed certified dev coach. The only code here is the routes' own status mapping and the seed.
 *
 *   GET  ?op=load         → { program, warnings }     (GET /api/coach/programs/:id)
 *   GET  ?op=catalogue    → the dev coach's catalogue (GET /api/coach/programs/exercises)
 *   POST ?op=action       → { tree }                  (POST /api/coach/programs/:id/exercises)
 *   GET  ?op=reset        → a fresh seed
 *
 * The seed has one catalogue row owned by ANOTHER coach ('pe-theirs'): prescribing it proves the ownership fix live.
 */
const DEV_COACH = 'dev-coach';
const g = globalThis as unknown as { __felBuilderDev?: { store: BuilderStore; programId: string } };

function seed(): { store: BuilderStore; programId: string } {
  const store = newBuilderStore();
  store.fac.push({ userId: DEV_COACH, certificationStatus: 'certified' });
  const pe = (id: string, name: string, category: string, pattern: string | null, coachId = DEV_COACH) => ({ id, coachId, name, category, pattern });
  store.pe.push(
    pe('pe-flow', '90/90 hip switch', 'mobility', 'mobility'),
    pe('pe-pogo', 'Pogo hops', 'plyometric', 'locomotion'),
    pe('pe-tbdl', 'Trap-bar deadlift', 'lower-body', 'hinge'),
    pe('pe-split', 'Split squat', 'lower-body', 'lunge'),
    pe('pe-row', 'Half-kneeling row', 'upper-pull', 'pull'),
    pe('pe-carry', 'Suitcase carry', 'conditioning', 'carry'),
    pe('pe-breath', 'Crocodile breathing', 'breath', 'breath'),
    pe('pe-theirs', 'Another coach\'s private drill', 'general', null, 'dev-other-coach'),
  );
  const p = createProgram(store, {
    coachId: DEV_COACH, clientId: 'dev-client', name: 'Dev: base block', startDate: new Date('2026-09-28T00:00:00Z'), durationWeeks: 1,
    blocks: { create: [{ order: 1, label: 'Week 1', sessions: { create: [{ order: 1, label: 'Day 1 — lower' }, { order: 2, label: 'Day 2 — upper' }] } }] },
  });
  return { store, programId: p.id };
}

const state = (reset = false) => { if (!g.__felBuilderDev || reset) g.__felBuilderDev = seed(); return g.__felBuilderDev; };
const db = () => builderMemoryDb(state().store) as unknown as BuilderDb;
const devOnly = () => (process.env.NODE_ENV !== 'development' ? NextResponse.json({ error: 'not_found' }, { status: 404 }) : null);

export async function GET(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  const op = req.nextUrl.searchParams.get('op');
  if (op === 'reset') { state(true); return NextResponse.json({ ok: true, programId: state().programId }); }
  if (op === 'catalogue') return NextResponse.json(state().store.pe.filter((r) => r.coachId === DEV_COACH));
  if (op === 'load') {
    const r = await loadProgram(db(), DEV_COACH, state().programId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ program: r.program, warnings: r.warnings });
  }
  return NextResponse.json({ error: 'unknown_op' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  if (req.nextUrl.searchParams.get('op') !== 'action') return NextResponse.json({ error: 'unknown_op' }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  const r = await builderAction(db(), DEV_COACH, state().programId, body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ tree: r.tree });
}
