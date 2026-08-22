export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readWallet } from '@/lib/wallet/wallet-service';

/**
 * GET /api/v1/wallet
 * Returns the caller's authoritative balance. The player id is ALWAYS taken
 * from the session — never from a query/body param.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.id as string | undefined;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const view = await readWallet(prisma, playerId);
  return NextResponse.json({
    coins: view.coins,
    shards: view.shards,
    version: view.version,
    updated_at: view.updated_at,
  });
}
