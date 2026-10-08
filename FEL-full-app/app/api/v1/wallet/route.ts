export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readWallet } from '@/lib/wallet/wallet-service';
import { refundNotesFor } from '@/lib/wallet/dead-buy-refunds';

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

/**
 * LOGIN-LOOP-FIX (2026-10-04): a session whose user id no longer resolves to a Player row (deleted between the
 * token being minted and this read, or a stale/partial session cookie from the sign-in/sign-out bounce) made
 * getOrCreateWallet's `wallet.create` throw a foreign-key violation (P2003) instead of answering unauthorized.
 * Under the sign-in redirect loop that fired this route thousands of times a minute, that surfaced as 500s a
 * logged-out browser kept receiving. A real database outage still throws something else and stays a 500.
 */
function isUnknownPlayerError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === 'P2003' || code === 'P2025';
}

/**
 * GET /api/v1/wallet
 * Returns the caller's authoritative balance. The player id is ALWAYS taken
 * from the session — never from a query/body param.
 * `refund_notes` (owner decision 2026-09-24): why the balance went up when a purchase that delivered nothing was paid
 * back, one { id, text, at } per refund from the last two weeks. The wallet chip shows each once per device.
 *
 * LOGIN-LOOP-FIX: every logged-out / no-valid-user case below answers 401, never 500 — including
 * getServerSession itself throwing (a malformed or mid-rotation session cookie) and a session whose user id no
 * longer resolves to a real player. A real failure for a valid, signed-in user (database unreachable, etc.)
 * still surfaces as a 500.
 */
export async function GET() {
  let session;
  try {
    session = await getServerSession(authOptions);
  } catch (err) {
    console.error('[wallet] getServerSession threw; treating the caller as logged out', err);
    return unauthorized();
  }
  const playerId = (session?.user as any)?.id as string | undefined;
  if (!playerId) return unauthorized();

  let view;
  try {
    view = await readWallet(prisma, playerId);
  } catch (err) {
    if (isUnknownPlayerError(err)) return unauthorized();
    throw err;
  }
  return NextResponse.json({
    coins: view.coins,
    shards: view.shards,
    lc: view.lc,
    version: view.version,
    updated_at: view.updated_at,
    refund_notes: refundNotesFor(prisma, playerId),   // read after readWallet, which refunds and remembers the notes
  });
}
