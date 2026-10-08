export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { earn } from '@/lib/wallet/wallet-service';
import { DAILY_EVENT_TYPES } from '@/lib/wallet/reward-rules';
import { isTestAccount } from '@/lib/sessions/runEligibility';

/**
 * POST /api/v1/wallet/earn
 * Body: { idempotency_key, event_type, payload }
 *
 * The client submits a PERFORMANCE EVENT, never an amount. The server resolves
 * the reason code, validates the payload, computes the grant from the editable
 * RewardRule config, applies rate caps, and writes an idempotent ledger row.
 * A replayed idempotency_key returns the ORIGINAL grant (no double-credit).
 *
 * DAILY-KEY-HOTFIX (2026-09-28):
 *   - A daily event (DAILY_EVENT_TYPES) is keyed by the server, once per player per America/Los_Angeles day, and its
 *     idempotency_key is ignored, so it may be left out. Every other event still needs one (400).
 *   - A test account (isTestAccount: a test User.role, or its id / email in FEL_TEST_ACCOUNTS) is paid nothing here,
 *     for any event, as its session runs are paid nothing (app/api/sessions/start). The account is read from the
 *     DATABASE, never the session token's copy. It gets a 200 with granted 0 and rejected 'test_account', and earn()
 *     never runs, so no ledger row or event is written. The eye's production run at 3a0f4edf: the wallet chip paid a
 *     test account +100 at sign-in, and a forged key paid +100 more.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.id as string | undefined;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const idempotencyKey = typeof body?.idempotency_key === 'string' ? body.idempotency_key : '';
  const eventType = typeof body?.event_type === 'string' ? body.event_type : '';
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
  if (!eventType || (!idempotencyKey && !DAILY_EVENT_TYPES.has(eventType))) {
    return NextResponse.json({ error: 'missing_idempotency_key_or_event_type' }, { status: 400 });
  }

  const account = await prisma.user.findUnique({ where: { id: playerId }, select: { id: true, email: true, role: true } });
  if (isTestAccount(account)) {
    // a read, never a create: the answer writes nothing (readWallet could file a dead-buy refund)
    const w = await prisma.wallet.findUnique({ where: { playerId }, select: { coins: true, shards: true, lc: true } });
    return NextResponse.json({
      granted: { coins: 0, shards: 0 },
      balances: { coins: Number(w?.coins ?? 0), shards: Number(w?.shards ?? 0), lc: Number(w?.lc ?? 0) },
      entry_id: null, capped: false, rejected: 'test_account', reason: 'TEST_ACCOUNT', replayed: false, already_claimed: false,
    });
  }

  // NOTE: any client-supplied amount/currency fields inside payload are ignored
  // by the server — computeGrant derives the value from RewardRule alone.
  const result = await earn(prisma, { playerId, idempotencyKey, eventType, payload });
  return NextResponse.json({
    granted: result.granted,
    balances: result.balances,
    entry_id: result.entry_id,
    capped: result.capped,
    rejected: result.rejected ?? null,
    // ECONOMY-SESSIONS-HARDEN: true when this key was already in the ledger — `granted` is the original grant and
    // nothing was credited now (the display shows nothing new; lib/wallet/client.ts)
    replayed: result.replayed === true,
    // the daily reward was already claimed today (any key, forged or not): granted is 0 and this says why
    already_claimed: result.alreadyClaimed === true,
  });
}
