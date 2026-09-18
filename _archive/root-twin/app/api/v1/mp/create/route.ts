import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rateLimit, clientKeyFromHeaders } from '@/lib/rate-limit';
import { createOnlineChallenge } from '@/lib/mp/service';
import { isValidMpMode } from '@/lib/mp/match-core';

export const dynamic = 'force-dynamic';

/** POST /api/v1/mp/create { mode } — host an async challenge (uses your best score). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const key = clientKeyFromHeaders(req.headers);
  const rl = rateLimit(`mp-create:${userId}:${key}`, 20, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });

  const body = await req.json().catch(() => ({}));
  const mode = String(body?.mode ?? '');
  if (!isValidMpMode(mode)) return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });

  const hostName = (session?.user as any)?.name ?? 'Athlete';
  const match = await createOnlineChallenge(prisma, { hostId: userId, hostName, mode });
  return NextResponse.json({
    ok: true,
    code: match.code,
    mode: match.mode,
    hostScore: match.hostScore,
    status: match.status,
  });
}
