export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { MIRROR_SCREEN_KIND } from '@/lib/mirror/screen';
import { readStoredScreen } from '@/lib/mirror/screenStore';
import { coachDraft, type CatalogueExercise } from '@/lib/coach/mirrorToProgram';
import { youthGateFor } from '@/lib/mirror/screenCorrectives';

/**
 * GET /api/coach/prescribe?clientId=… — a DRAFT of corrective work from this client's last movement screen.
 *
 * The judgement is lib/coach/mirrorToProgram.ts, which prescribes only from the coach's OWN catalogue and returns
 * the finding with no exercise rather than inventing a movement name. This route fetches and authorises.
 *
 * AUTHORISATION IS THE WHOLE RISK HERE. A movement screen is health-adjacent data about somebody's body, and the
 * client id arrives in a query string. Coaching this athlete is checked against an ACTIVE CoachClient link before a
 * single row is read — not after, never inferred from the caller having the id, and (since the MIRROR-COACH P3 review)
 * never from a CoachingProgram row alone, which a coach can create without the client.
 */
/** How many of a client's newest screens the route reads to find the newest graded one. */
const SCREENS_READ = 20;

export async function GET(req: NextRequest) {
  const coachId = await currentUserId();
  if (!coachId) return bad('unauthorized', 401);

  const clientId = (req.nextUrl.searchParams.get('clientId') ?? '').slice(0, 64);
  if (!clientId) return bad('missing_client', 400);

  // AN ACTIVE LINK THE CLIENT MADE, and nothing else (MIRROR-COACH P3 review, 2026-09-26). This used to accept a
  // CoachingProgram row too — and any certified coach can create one for any user found by email, with no invite or
  // acceptance (app/api/coach/programs/route.ts POST), and a coach whose link had ENDED kept one. P3 widened what this
  // answers (per-check camera values, retest reasons, the breath questions), so: a CoachClient row, which only the
  // client's own acceptance of an invite creates (app/api/coach/invite/[token]), and not ended. A program alone is 403.
  const link = await prisma.coachClient.findFirst({ where: { coachId, clientId, endedAt: null }, select: { id: true } });
  // Same answer whether the athlete exists and is somebody else's or does not exist at all.
  if (!link) return bad('not_your_client', 403);

  // The newest screens, not only the newest one. MIRROR-COACH P1 (2026-09-25): every run is stored now, ungraded ones
  // included (app/api/mirror/screen), so reading only the newest row let a run that graded nothing hide the graded
  // screen before it — the coach's draft would vanish the day the athlete re-ran a screen that stalled.
  const scans = await prisma.workoutScan.findMany({
    where: { userId: clientId, kind: MIRROR_SCREEN_KIND },
    orderBy: { createdAt: 'desc' },
    take: SCREENS_READ,
    select: { metrics: true, createdAt: true },
  });

  // ProgramExercise, not Exercise: the first is what THIS coach built, the second is the global Blueprint
  // library. The module's own rule is that it prescribes from what the coach actually has — a coach who opens
  // their program and finds a movement they have never heard of stops trusting the tool.
  // MIRROR-COACH P3 (2026-09-26): with the P2 tags (pattern, skill layer) the draft matches on, and the row's own tempo.
  // Read only when there is a graded screen to draft from.
  const catalogue: CatalogueExercise[] = scans.some((s) => readStoredScreen(s.metrics))
    ? await prisma.programExercise
      .findMany({ where: { coachId }, select: { id: true, name: true, category: true, pattern: true, skillLayer: true, defaultTempo: true } })
      .catch(() => [])
    : [];

  // MIRROR-COACH P3 (2026-09-26): the whole answer is lib/coach/mirrorToProgram.ts coachDraft — the LAST GRADED screen
  // (a newer run that graded nothing is named, not allowed to hide it), each flagged camera check with its value, FIX
  // line, corrective block and catalogue match; unreadable checks as 'retest', never clear; and the three groups the
  // coach reads (camera, the athlete's own answers, the hands-on checks). 'clear_screen' only for a complete screen
  // with no flag and no retest (P1's rule, kept).
  // YOUTH RULES (P3 review; owner decisions #6, #20, PLAN item 9): under 18 or no birth year on file → no written blocks,
  // no pin rows offered. A read that fails is no birth year: youth rules, the conservative side.
  const client = await readClient(clientId);
  // OWNER DECISION #4 (P3 review): the breath answers reach a coach only with the client's consent, which is phase 5's
  // step — until it exists they are withheld (lib/coach/mirrorToProgram.ts ANSWERS_WITHHELD).
  return NextResponse.json(coachDraft(scans, catalogue, { youth: youthGateFor(client?.dobYear), answersShared: false }));
}

async function readClient(clientId: string): Promise<{ dobYear: number | null } | null> {
  try {
    return await prisma.user.findUnique({ where: { id: clientId }, select: { dobYear: true } });
  } catch {
    return null;
  }
}
