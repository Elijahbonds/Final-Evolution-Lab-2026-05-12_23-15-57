export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { earn } from '@/lib/wallet/wallet-service';

/**
 * POST /api/v1/wallet/earn
 * Body: { idempotency_key, event_type, payload }
 *
 * The client submits a PERFORMANCE EVENT, never an amount. The server resolves
 * the reason code, validates the payload, computes the grant from the editable
 * RewardRule config, applies rate caps, and writes an idempotent ledger row.
 * A replayed idempotency_key returns the ORIGINAL grant (no double-credit).
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
  if (!idempotencyKey || !eventType) {
    return NextResponse.json({ error: 'missing_idempotency_key_or_event_type' }, { status: 400 });
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
  });
}
