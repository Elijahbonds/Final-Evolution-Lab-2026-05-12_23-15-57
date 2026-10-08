export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rampStatus, startRamp } from '@/lib/breath/rampServer';
import { canWriteHealthData, refuseHealthWrite } from '@/lib/privacy/healthWriteGate';

/**
 * MIRROR-COACH P7 (2026-09-29): app/api/breath/ramp — the adults-only Dial-Up Breath before a session's flagged key set.
 *
 * THE SERVER DECIDES, THE CLIENT ASKS. Every gate (age, consent, intake, today's pain and readiness, FEL's weekly limit,
 * the set itself) lives in lib/breath/rampGate.ts and is assembled from the athlete's own rows in lib/breath/rampServer.ts;
 * this file is auth and request shape only, thin on purpose so lib/breath/ramp-route.test.ts runs it for real over a
 * fake client (vitest does not collect app/).
 *
 * GET  ?sessionExerciseId=… — the verdict for that set: { eligible, reasons, usesLeft, limit, pacer }.
 *      Today's key-set card renders the option only when `eligible` is true. Reads only; writes nothing.
 * POST { sessionExerciseId } — start one: the gate runs again on fresh rows, one BreathLog use is written, and
 *      the pacer comes back. 412 without a live health_data consent, 403 with reasons for any other gate.
 *
 * Nothing here scores, pays, ranks or keeps a streak (phase rule (e)); the response carries no points, coins or score.
 */

/** GET /api/breath/ramp — may this athlete dial up before this set right now? */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const out = await rampStatus(prisma, userId, { sessionExerciseId: req.nextUrl.searchParams.get('sessionExerciseId') });
  return out.ok ? NextResponse.json(out.body) : NextResponse.json({ error: out.error, reasons: out.reasons }, { status: out.status });
}

/** POST /api/breath/ramp — start one Dial-Up Breath (logged against the weekly limit). */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  // TEEN-WRITE-BLOCK's rule (lib/privacy/healthWriteGate.ts): a BreathLog use is health data, written only for a verified
  // 18+ account (the DB's User.dobYear). rampGate already refuses minors; this keeps the write on the one shared gate.
  if (!(await canWriteHealthData(prisma, userId))) return refuseHealthWrite();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('invalid_json');
  }
  // the exercise id is the only thing read from the body — an `eligible` or `reasons` a client adds is never looked at
  const out = await startRamp(prisma, userId, { sessionExerciseId: body?.sessionExerciseId });
  return out.ok ? NextResponse.json(out.body) : NextResponse.json({ error: out.error, reasons: out.reasons }, { status: out.status });
}
