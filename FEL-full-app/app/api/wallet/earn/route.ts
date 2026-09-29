/**
 * POST /api/wallet/earn  { reason }
 *
 * Server-authoritative LC earn. The client REQUESTS an earn by naming a
 * REASON from a fixed server-side enum; the server owns the amount. A
 * client-supplied `amount` is ignored entirely (anti-mint).
 *
 * Only SELF-VALIDATING reasons are earnable here — currently `daily_streak`,
 * which the server computes and dedupes to once per America/Los_Angeles day
 * (DAILY-KEY-HOTFIX, 2026-09-28; it was the UTC day). Source-bound
 * reasons (lesson_complete, module_checkpoint, session_win) must originate
 * from their authoritative event route (education/complete, sessions) so the
 * client cannot mint LC by simply asserting the reason; requesting them here
 * is rejected 422 and logged.
 *
 * DAILY-KEY-HOTFIX (2026-09-28):
 *   - The streak's key is built here from the SERVER's clock (lib/economy.ts buildDedupeKey → `streak:<PT day>`).
 *     Only `reason` is read from the body, and it must match exactly. A dedupeKey, idempotency_key, day, now or
 *     amount field in the body reaches nothing.
 *   - A streak row already written in this PT day under any key answers duplicate. That covers the rows filed
 *     under the UTC key before this fix: after 5 pm Pacific (PDT) that key named tomorrow's UTC date.
 *   - A test account (isTestAccount, read from the DATABASE, as the session start does) is awarded 0 and no
 *     CreditLedger row is written.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { LEDGER_REASONS, awardCredits, getBalance, withinEarnVelocity } from '@/lib/economy';
import { isTestAccount } from '@/lib/sessions/runEligibility';
import { ptDayBounds } from '@/lib/wallet/dailyKey';

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

    const account = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } });
    if (isTestAccount(account)) {
      return NextResponse.json({
        ok: true, awarded: 0, duplicate: false, balance: await getBalance(prisma, userId), reason, rejected: 'test_account', meta: null,
      });
    }

    if (!(await withinEarnVelocity(prisma, userId))) {
      console.warn(`[wallet/earn] velocity cap hit for user ${userId}`);
      return NextResponse.json({ error: 'Slow down — too many rewards too fast.' }, { status: 429 });
    }

    // The server's clock, and nothing from the body: the day, and the key built from it, are the server's.
    const now = new Date();
    const { start, end } = ptDayBounds(now);
    const today = await prisma.creditLedger.findFirst({
      where: { userId, reason: LEDGER_REASONS.DAILY_STREAK, createdAt: { gte: start, lt: end } }, select: { id: true },
    });
    if (today) {
      return NextResponse.json({ ok: true, awarded: 0, duplicate: true, balance: await getBalance(prisma, userId), reason, meta: null });
    }

    // Amount is server-owned; any body.amount is ignored by design.
    let result: Awaited<ReturnType<typeof awardCredits>>;
    try {
      result = await awardCredits(prisma, userId, { kind: 'daily_streak', now });
    } catch (e) {
      // A claim sent with this one wrote today's key first. awardCredits answers that duplicate itself, but it
      // recognises the refusal by instanceof, which misses under next dev (a second copy of the Prisma client
      // module): the losing claim was a 500 on :3100. Read by its code here, it is the duplicate it is.
      if ((e as { code?: unknown } | null)?.code !== 'P2002') throw e;
      return NextResponse.json({ ok: true, awarded: 0, duplicate: true, balance: await getBalance(prisma, userId), reason, meta: null });
    }

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
