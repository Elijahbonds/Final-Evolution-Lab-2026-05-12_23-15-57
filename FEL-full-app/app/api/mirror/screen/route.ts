export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { grantServerReward } from '@/lib/wallet/wallet-service';
import { decideScreenReward } from '@/lib/mirror/screenReward';
import { scoreScreen, type CheckResult, type ScreenId } from '@/lib/mirror/screen';

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

  return NextResponse.json({
    summary,
    paid: decision.pay,
    awarded,
    message: decision.message,
  });
}
