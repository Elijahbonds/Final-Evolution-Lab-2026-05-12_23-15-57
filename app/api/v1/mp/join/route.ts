import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rateLimit, clientKeyFromHeaders } from '@/lib/rate-limit';
import { joinAndSettle } from '@/lib/mp/service';
import { readWallet } from '@/lib/wallet/wallet-service';
import { isValidMatchCode, resolveOutcome } from '@/lib/mp/match-core';

export const dynamic = 'force-dynamic';

/** POST /api/v1/mp/join { code } — accept a challenge with your best score; settles. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const key = clientKeyFromHeaders(req.headers);
  const rl = rateLimit(`mp-join:${userId}:${key}`, 30, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });

  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? '').toUpperCase();
  if (!isValidMatchCode(code)) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });

  const guestName = (session?.user as any)?.name ?? 'Athlete';
  const result = await joinAndSettle(prisma, { code, guestId: userId, guestName });
  if ('error' in result) {
    const status = result.error === 'not_found' ? 404 : result.error === 'cannot_join_own' ? 400 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  const m = result.match;
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
