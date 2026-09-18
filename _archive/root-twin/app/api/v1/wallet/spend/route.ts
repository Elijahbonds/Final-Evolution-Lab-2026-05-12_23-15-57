export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { spend, readWallet, WalletError } from '@/lib/wallet/wallet-service';

/**
 * POST /api/v1/wallet/spend
 * Body: { idempotency_key, sku_id, quantity? }
 *
 * Price is SERVER-OWNED (from the catalog). A client-supplied price/currency is
 * ignored. Decrement is a conditional atomic write so a balance can never go
 * negative; insufficient funds is a clean 409. Replayed idempotency_key returns
 * the ORIGINAL result.
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
  const skuId = typeof body?.sku_id === 'string' ? body.sku_id : '';
  const quantity = Number.isFinite(body?.quantity) ? Number(body.quantity) : 1;
  if (!idempotencyKey || !skuId) {
    return NextResponse.json({ error: 'missing_idempotency_key_or_sku_id' }, { status: 400 });
  }

  try {
    const result = await spend(prisma, { playerId, idempotencyKey, skuId, quantity });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof WalletError) {
      if (e.code === 'INSUFFICIENT_FUNDS') {
        const bal = await readWallet(prisma, playerId);
        return NextResponse.json(
          { error: 'insufficient_funds', balances: { coins: bal.coins, shards: bal.shards } },
          { status: 409 },
        );
      }
      if (e.code === 'UNKNOWN_SKU') {
        return NextResponse.json({ error: 'unknown_sku' }, { status: 404 });
      }
      return NextResponse.json({ error: e.code.toLowerCase() }, { status: 400 });
    }
    console.error('[v1/wallet/spend] unexpected error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
