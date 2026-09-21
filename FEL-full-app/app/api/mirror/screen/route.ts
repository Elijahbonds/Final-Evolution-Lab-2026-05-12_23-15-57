export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { grantServerReward } from '@/lib/wallet/wallet-service';
import { decideScreenReward } from '@/lib/mirror/screenReward';
import { MIRROR_SCREEN_KIND, scoreScreen, type CheckResult, type ScreenId } from '@/lib/mirror/screen';
import { storedScreen, storedScreenId } from '@/lib/mirror/screenStore';

/**
 * A completed movement screen.
 *
 * The rule the reward module states and this route enforces: A SCREEN THE CAMERA COULD NOT GRADE PAYS NOTHING.
 * The reward is for the measurement, not for standing near a phone — paying for a provisional screen would
 * teach an athlete that the fastest shards come from a bad shot, which is the opposite of what a screening
 * tool wants from them.
 *
 * The score is recomputed here from the checks rather than accepted from the client, and the athlete id in the
 * idempotency key is the SESSION's, never the body's.
 *
 * THE SCREEN IS KEPT NOW (2026-09-21). Until today this route scored a screen, paid for it in shards, returned
 * the summary and threw it away — nothing was written anywhere. So an athlete's screen existed for one render
 * and was gone: no history, no way to see whether the thing they were told to correct got better, and nothing a
 * coach could ever read. lib/coach/mirrorToProgram.ts ("the screen writes the corrective work") could not be
 * connected to anything for exactly this reason, and that module's own header calls this tie the one thing the
 * competition cannot answer quickly.
 *
 * It is stored the same way the dunk log is — WorkoutScan with its own `kind`, numbers only, no video, no
 * keypoints — and a failed write never costs the athlete their reward.
 */

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const athleteId = (session?.user as { id?: string } | undefined)?.id;
  if (!athleteId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const b = body as { screenId?: unknown; screen?: unknown; results?: unknown; provisional?: unknown };
  const screenId = String(b?.screenId ?? '').slice(0, 64).replace(/[^A-Za-z0-9_:-]/g, '');
  const screen: ScreenId = b?.screen === 'full' ? 'full' : 'modified';
  const results = Array.isArray(b?.results) ? (b.results as CheckResult[]) : [];
  if (!screenId) return NextResponse.json({ error: 'missing_screen_id' }, { status: 400 });

  // Recomputed, not trusted. The client renders this summary too, but what gets paid for is what the server works out.
  const summary = scoreScreen(screen, results);

  const decision = decideScreenReward({
    screenId,
    athleteId,
    provisional: Boolean(b?.provisional),
    checksTaken: results.length,
  });

  let awarded = 0;
  if (decision.pay) {
    const granted = await grantServerReward(prisma, {
      playerId: athleteId,
      reasonCode: decision.reasonCode,
      idempotencyKey: decision.idempotencyKey,
      metadata: { screen, screenId, redFlags: summary.redFlags, asymmetries: summary.asymmetries },
    }).catch(() => null);
    awarded = granted?.granted.shards ?? 0;
  }

  // Kept AFTER the reward, and never allowed to break it: a screen the athlete earned is not undone by a write.
  // Deduped on screenId so a retried post is one screen in their history rather than two.
  const already = await prisma.workoutScan.findFirst({
    where: { userId: athleteId, kind: MIRROR_SCREEN_KIND },
    orderBy: { createdAt: 'desc' }, take: 1, select: { metrics: true },
  }).catch(() => null);
  const seen = storedScreenId(already?.metrics ?? null);
  if (seen !== screenId) {
    await prisma.workoutScan.create({
      data: { userId: athleteId, kind: MIRROR_SCREEN_KIND, metrics: storedScreen(screenId, screen, results, summary) as unknown as object },
    }).catch(() => null);
  }

  return NextResponse.json({
    summary,
    paid: decision.pay,
    awarded,
    message: decision.message,
  });
}
