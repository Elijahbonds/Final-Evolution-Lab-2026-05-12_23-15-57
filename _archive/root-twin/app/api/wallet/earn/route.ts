/**
 * POST /api/wallet/earn  { reason }
 *
 * Server-authoritative LC earn. The client REQUESTS an earn by naming a
 * REASON from a fixed server-side enum; the server owns the amount. A
 * client-supplied `amount` is ignored entirely (anti-mint).
 *
 * Only SELF-VALIDATING reasons are earnable here — currently `daily_streak`,
 * which the server computes and dedupes to once-per-UTC-day. Source-bound
 * reasons (lesson_complete, module_checkpoint, session_win) must originate
 * from their authoritative event route (education/complete, sessions) so the
 * client cannot mint LC by simply asserting the reason; requesting them here
 * is rejected 422 and logged.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { awardCredits, withinEarnVelocity } from '@/lib/economy';

export const dynamic = 'force-dynamic';

// Reasons the client may directly request. Kept deliberately small; every
// other earn flows through its source-of-truth event route.
const CLIENT_EARNABLE = new Set(['daily_streak']);

// Recognized-but-not-client-earnable (rejected 422, not 400, so the client
// gets a clear "wrong channel" signal we can log/monitor).
const SOURCE_BOUND = new Set(['lesson_complete', 'module_checkpoint', 'session_win', 'story_node']);

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const reason = String(body?.reason ?? '');

    if (SOURCE_BOUND.has(reason)) {
      console.warn(`[wallet/earn] rejected source-bound reason "${reason}" for user ${userId}`);
      return NextResponse.json(
        { error: 'This reward is granted by its game/lesson event, not here.' },
        { status: 422 }
      );
    }
    if (!CLIENT_EARNABLE.has(reason)) {
      return NextResponse.json({ error: 'Unknown earn reason' }, { status: 400 });
    }

    if (!(await withinEarnVelocity(prisma, userId))) {
      console.warn(`[wallet/earn] velocity cap hit for user ${userId}`);
      return NextResponse.json({ error: 'Slow down — too many rewards too fast.' }, { status: 429 });
    }

    // Amount is server-owned; any body.amount is ignored by design.
    const result = await awardCredits(prisma, userId, { kind: 'daily_streak' });

    return NextResponse.json({
      ok: true,
      awarded: result.awarded ? result.amount : 0,
      duplicate: result.duplicate,
      balance: result.balance,
      reason,
      meta: result.meta ?? null,
    });
  } catch (e) {
    console.error('wallet/earn error', e);
    return NextResponse.json({ error: 'Earn failed' }, { status: 500 });
  }
}
