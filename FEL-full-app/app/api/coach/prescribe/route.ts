export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { MIRROR_SCREEN_KIND } from '@/lib/mirror/screen';
import { isUngradedStoredScreen, readStoredScreen } from '@/lib/mirror/screenStore';
import { prescribeFromScreen, type CatalogueExercise } from '@/lib/coach/mirrorToProgram';

/**
 * GET /api/coach/prescribe?clientId=… — a DRAFT of corrective work from this client's last movement screen.
 *
 * The judgement is lib/coach/mirrorToProgram.ts, which prescribes only from the coach's OWN catalogue and returns
 * the finding with no exercise rather than inventing a movement name. This route fetches and authorises.
 *
 * AUTHORISATION IS THE WHOLE RISK HERE. A movement screen is health-adjacent data about somebody's body, and the
 * client id arrives in a query string. Coaching this athlete is checked against CoachClient/CoachingProgram before
 * a single row is read — not after, and never inferred from the caller having the id.
 */
/** How many of a client's newest screens the route reads to find the newest graded one. */
const SCREENS_READ = 20;

export async function GET(req: NextRequest) {
  const coachId = await currentUserId();
  if (!coachId) return bad('unauthorized', 401);

  const clientId = (req.nextUrl.searchParams.get('clientId') ?? '').slice(0, 64);
  if (!clientId) return bad('missing_client', 400);

  const [link, program] = await Promise.all([
    prisma.coachClient.findFirst({ where: { coachId, clientId, endedAt: null }, select: { id: true } }),
    prisma.coachingProgram.findFirst({ where: { coachId, clientId }, select: { id: true } }),
  ]);
  // Same answer whether the athlete exists and is somebody else's or does not exist at all.
  if (!link && !program) return bad('not_your_client', 403);

  // The newest screens, not only the newest one. MIRROR-COACH P1 (2026-09-25): every run is stored now, ungraded ones
  // included (app/api/mirror/screen), so reading only the newest row let a run that graded nothing hide the graded
  // screen before it — the coach's draft would vanish the day the athlete re-ran a screen that stalled.
  const scans = await prisma.workoutScan.findMany({
    where: { userId: clientId, kind: MIRROR_SCREEN_KIND },
    orderBy: { createdAt: 'desc' },
    take: SCREENS_READ,
    select: { metrics: true, createdAt: true },
  });
  if (!scans.length) return NextResponse.json({ screenAt: null, prescriptions: [], reason: 'no_screen' });

  // MIRROR-COACH P1 (2026-09-25): a screen that ran with nothing graded — every screen stored so far, since no grader
  // has run yet — is 'ungraded_screen', not 'unreadable_screen', and neither is "clear" (the panel said "came back
  // clear" for any reason but no_screen, components/coach/screen-prescriptions.tsx).
  const newest = scans[0];
  const graded = scans.map((s) => ({ scan: s, stored: readStoredScreen(s.metrics) })).find((x) => x.stored);
  if (!graded) {
    const reason = isUngradedStoredScreen(newest.metrics) ? 'ungraded_screen' : 'unreadable_screen';
    return NextResponse.json({ screenAt: newest.createdAt, prescriptions: [], reason });
  }
  const { results, summary } = graded.stored!;
  // a newer run than the graded one, which graded nothing (or could not be read): said, not hidden
  const newerRun = graded.scan === newest ? {} : { newerRunAt: newest.createdAt };

  // ProgramExercise, not Exercise: the first is what THIS coach built, the second is the global Blueprint
  // library. The module's own rule is that it prescribes from what the coach actually has — a coach who opens
  // their program and finds a movement they have never heard of stops trusting the tool.
  const catalogue: CatalogueExercise[] = await prisma.programExercise
    .findMany({ where: { coachId }, select: { id: true, name: true, category: true } })
    .catch(() => []);

  const prescriptions = prescribeFromScreen(
    { meaning: summary.meaning, suggestions: summary.suggestions, findings: results },
    catalogue,
  );
  // Nothing to draft is 'clear' ONLY for a complete screen (every check came back, none flagged). A partly graded one
  // says so: one stable check out of eight used to reach the coach as "Their last screen came back clear."
  const reason = prescriptions.length ? {} : { reason: summary.ranAll ? 'clear_screen' : 'partial_screen' };
  return NextResponse.json({
    screenAt: graded.scan.createdAt, headline: summary.headline, complete: summary.ranAll, prescriptions, ...reason, ...newerRun,
  });
}
