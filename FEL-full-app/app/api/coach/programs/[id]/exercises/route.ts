export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { builderAction } from '@/lib/coach/builderServer';

/**
 * POST /api/coach/programs/:id/exercises — the program builder (lane 1 C1). Coach of the program, certified.
 *  { action: 'add', sessionId, exerciseId, sets?, reps?, load?, tempo?, restSeconds?, coachNote?, ...structure }
 *  { action: 'update', sessionExerciseId, ...only the fields that change }
 *  { action: 'move', sessionExerciseId, direction: 'up' | 'down' }       (within its own section)
 *  { action: 'remove', sessionExerciseId }
 * structure = section, isKeySet, supersetGroup, workSeconds, holdSeconds, setupCues, effortBand (lib/coach/structure.ts).
 * Returns the program tree after the change; GET /api/coach/programs/:id loads it.
 *
 * MIRROR-COACH P2 (2026-09-25) — the logic moved to lib/coach/builderServer.ts (so the dev harness runs the same
 * code over an in-memory store), and four things this route got wrong are fixed there:
 *   1. 'add' loaded the catalogue row's coachId and never compared it to the caller, so a coach could prescribe
 *      ANOTHER coach's private exercise by id (crossref: programs/[id]/exercises/route.ts:41-42). It answers
 *      exercise_not_found now, the same as a row that does not exist.
 *   2. 'update' ran the body alone through the validator, so an update that sent `sets: 4` also reset reps, load,
 *      tempo and rest to their defaults and wiped the coach note. It merges the body over the stored row now.
 *   3. 'remove' on an exercise the client had already logged hit ExerciseLog's onDelete: Restrict and 500'd. It says
 *      so instead (409 exercise_logged): the log is the client's work and the coach's review of it.
 *   4. A session could end up with two key sets. Marking one clears the others in the same session.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('invalid_json');
  const r = await builderAction(prisma, userId, id, body);
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ tree: r.tree });
}
