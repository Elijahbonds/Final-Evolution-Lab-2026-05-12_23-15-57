export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { exchangeCoinsForShards, COINS_PER_SHARD } from '@/lib/wallet/exchange';
import { readWallet, WalletError } from '@/lib/wallet/wallet-service';

/**
 * POST /api/v1/wallet/exchange
 * Body: { idempotency_key, shard_amount }
 * Converts coins -> shards at a server-owned rate. Shards are never sold
 * directly; this is the sanctioned demand path (buy coins -> exchange).
 */
export async function GET() {
  return NextResponse.json({ coins_per_shard: COINS_PER_SHARD });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.id as string | undefined;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const idempotencyKey = typeof body?.idempotency_key === 'string' ? body.idempotency_key : '';
  const shardAmount = Number(body?.shard_amount);
  if (!idempotencyKey) return NextResponse.json({ error: 'missing_idempotency_key' }, { status: 400 });

  try {
    const result = await exchangeCoinsForShards(prisma, { playerId, idempotencyKey, shardAmount });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof WalletError) {
      if (e.code === 'INSUFFICIENT_FUNDS') {
        const bal = await readWallet(prisma, playerId);
        return NextResponse.json({ error: 'insufficient_funds', balances: { coins: bal.coins, shards: bal.shards } }, { status: 409 });
      }
      return NextResponse.json({ error: e.code.toLowerCase() }, { status: 400 });
    }
    console.error('[wallet/exchange] error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
