export const dynamic = 'force-dynamic';

// THE HOOPS BUILDER'S ROUTE (lane/hoops-builder, owner 2026-11-12). Thin, like the athlete route beside it: what is legal, what a
// game pays and what a step costs are decided in lib/creator/hoops/hoopsBuild.ts (pure, tested), and the read-and-write in
// lib/creator/hoops/hoopsBuild-server.ts (tested with a fake database). Signed-in only.
//
// GET  — the ratings, the position, the playing height, the points; and it CLAIMS the points every finished hoops game since the
//        last visit earned (the server reads its own run records, never a number the client sends).
// POST — save a position, a height and the upgrade steps. The server re-checks everything: the points cannot go below zero, no
//        rating passes its ceiling (the Creator's PRQ ceiling, read here from the measured axes, never from the request).
//
// TEENS: as the Creator does it. The Creator saves the build (attributes, tendencies …) for every signed-in user and holds back only
// the movement snapshot and the look; the hoops build is build, not a scan and not a look, so it saves for every signed-in user.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isMissingTable, isUnreachable } from '@/lib/db/errors';
import { axesFor } from '@/lib/creator/athleteAxes-server';
import { loadHoops, saveHoops, type HoopsDb } from '@/lib/creator/hoops/hoopsBuild-server';
import { viewOf } from '@/lib/creator/hoops/hoopsBuild';

/** The Prisma client, seen through the few calls the hoops build makes (read at call time, never captured at import). */
const db = (): HoopsDb => prisma as unknown as HoopsDb;

function dbFailure(e: unknown): NextResponse | null {
  if (isMissingTable(e)) return NextResponse.json({ error: 'schema_not_pushed', detail: 'The athlete table is not in the database yet.' }, { status: 503 });
  if (isUnreachable(e)) return NextResponse.json({ error: 'database_unreachable', detail: 'The database did not answer. Nothing was saved.' }, { status: 503 });
  if ((e as Error)?.message === 'hoops_build_busy') return NextResponse.json({ error: 'busy', detail: 'Your ratings were being saved somewhere else. Try again.' }, { status: 409 });
  return null;
}

async function userIdOf(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

/** GET /api/v1/creator/hoops — the hoops build as the screen shows it, with today's points claimed. */
export async function GET() {
  const userId = await userIdOf();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const now = new Date();
    const [load, prq] = await Promise.all([loadHoops(db(), userId, now), axesFor(userId).catch(() => null)]);
    return NextResponse.json({ hoops: viewOf(load.build, prq, now), gained: load.gained, readOnly: load.fromFuture });
  } catch (e) {
    const named = dbFailure(e);
    if (named) return named;
    throw e;
  }
}

/** POST /api/v1/creator/hoops — { position, heightIn, steps: { speed, handle, shooting, finishing, defense } }. */
export async function POST(req: NextRequest) {
  const userId = await userIdOf();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { position?: unknown; heightIn?: unknown; steps?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  try {
    const now = new Date();
    // The ceilings come from the server's own measured axes. A database that will not give them leaves no ceiling — the Creator's
    // rule for a player with no scan — rather than refusing the save.
    const prq = await axesFor(userId).catch(() => null);
    const r = await saveHoops(db(), userId, { position: body.position, heightIn: body.heightIn, steps: body.steps }, prq, now);
    if (!r.ok) return NextResponse.json({ error: r.status === 409 ? 'newer_version' : 'invalid_choice', issues: r.issues }, { status: r.status });
    return NextResponse.json({ saved: true, hoops: viewOf(r.build, prq, now) });
  } catch (e) {
    const named = dbFailure(e);
    if (named) return named;
    throw e;
  }
}
