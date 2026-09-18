import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createLocalMatch } from '@/lib/mp/service';
import { readWallet } from '@/lib/wallet/wallet-service';
import { isValidMpMode, resolveOutcome } from '@/lib/mp/match-core';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/mp/local { mode, hostScore, guestName?, guestScore } —
 * pass-and-play on one device. Both scores are entered on the shared screen.
 * The signed-in account banks coins for playing and shards only if it (host) wins.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode = String(body?.mode ?? '');
  if (!isValidMpMode(mode)) return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });
  const hostScore = Number(body?.hostScore);
  const guestScore = Number(body?.guestScore);
  if (!Number.isFinite(hostScore) || !Number.isFinite(guestScore) || hostScore < 0 || guestScore < 0) {
    return NextResponse.json({ error: 'invalid_scores' }, { status: 400 });
  }
  const guestName = String(body?.guestName ?? 'Player 2').slice(0, 40);
  const hostName = (session?.user as any)?.name ?? 'Athlete';

  const m = await createLocalMatch(prisma, { hostId: userId, hostName, mode, hostScore, guestName, guestScore });
  const outcome = resolveOutcome(m.hostScore ?? 0, m.guestScore ?? 0);
  const bal = await readWallet(prisma, userId).catch(() => null);
  return NextResponse.json({
    ok: true,
    code: m.code, mode: m.mode, status: m.status,
    hostName: m.hostName, hostScore: m.hostScore,
    guestName: m.guestName, guestScore: m.guestScore,
    winnerId: m.winnerId,
    youWon: m.winnerId === userId,
    outcome,
    balances: bal ? { coins: bal.coins, shards: bal.shards } : null,
  });
}
