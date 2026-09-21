export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { MIRROR_SCREEN_KIND } from '@/lib/mirror/screen';
import { readStoredScreen } from '@/lib/mirror/screenStore';
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

  const scan = await prisma.workoutScan.findFirst({
    where: { userId: clientId, kind: MIRROR_SCREEN_KIND },
    orderBy: { createdAt: 'desc' },
    select: { metrics: true, createdAt: true },
  });
  if (!scan) return NextResponse.json({ screenAt: null, prescriptions: [], reason: 'no_screen' });

  const stored = readStoredScreen(scan.metrics);
  if (!stored) return NextResponse.json({ screenAt: scan.createdAt, prescriptions: [], reason: 'unreadable_screen' });
  const { results, summary } = stored;

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
  return NextResponse.json({ screenAt: scan.createdAt, headline: summary.headline, prescriptions });
}
