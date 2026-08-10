import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rateLimit, clientKeyFromHeaders } from '@/lib/rate-limit';
import { getMyCard, upsertMyCard } from '@/lib/creator/card-service';
import { isValidMpMode } from '@/lib/mp/match-core';
import { isValidAccent } from '@/lib/creator/card-core';

export const dynamic = 'force-dynamic';

/** GET /api/v1/card — the caller's own card (creates nothing). */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const card = await getMyCard(prisma, userId);
  return NextResponse.json({ ok: true, card: card ?? null });
}

/** POST /api/v1/card — create/update the caller's card (cosmetic fields only). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const key = clientKeyFromHeaders(req.headers);
  const rl = rateLimit(`card-upsert:${userId}:${key}`, 30, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });

  const body = await req.json().catch(() => ({}));
  // Validate the few fields that have a constrained shape; the service clamps text.
  if (body?.mode != null && !isValidMpMode(String(body.mode))) {
    return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });
  }
  if (body?.accent != null && !isValidAccent(String(body.accent))) {
    return NextResponse.json({ error: 'invalid_accent' }, { status: 400 });
  }

  const userName = (session?.user as any)?.name ?? null;
  const card = await upsertMyCard(prisma, userId, userName, {
    displayName: body?.displayName,
    tagline: body?.tagline,
    mode: body?.mode,
    accent: body?.accent,
    avatarUrl: body?.avatarUrl,
    signatureMove: body?.signatureMove,
  });
  return NextResponse.json({ ok: true, card });
}
