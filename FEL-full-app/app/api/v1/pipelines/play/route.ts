export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { GUEST_COOKIE } from '@/lib/guest';
import { rateLimit } from '@/lib/rate-limit';
import { publicCardWhere } from '@/lib/creator/creative-card-review';
import { listenerOf, utcDayStart } from '@/lib/soundtrack/playCount';
import { PLAYABLE_DISCIPLINES, isPlayableDiscipline } from '@/lib/pipelines/plays';

const PLAY_RATE = { limit: 60, windowMs: 60 * 60_000 };

/**
 * POST /api/v1/pipelines/play  { cardId }  — PIPELINES (owner, 2026-10-06): a community Spot the Scene pack or Dance
 * routine was played. Counted at most once per player (account, else guest token), per card, per UTC day, through an
 * AnalyticsEvent lookup (name 'community_play'), only for an approved, public card by an adult in one of
 * PLAYABLE_DISCIPLINES, and landed atomically in CreativeCard.stats.plays (jsonb_set; no schema change) — the same
 * method and the same "plays, never a score" rule as the soundtrack's play count. Never an error a player would notice.
 */
export async function POST(req: NextRequest) {
  let body: { cardId?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const cardId = typeof body.cardId === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(body.cardId) ? body.cardId : null;
  if (!cardId) return NextResponse.json({ error: 'bad card id' }, { status: 400 });

  const session = await getServerSession(authOptions);
  const listener = listenerOf((session?.user as { id?: string } | undefined)?.id, cookies().get(GUEST_COOKIE)?.value);
  if (!listener) return NextResponse.json({ counted: false, reason: 'anonymous' });
  const key = 'userId' in listener ? `u:${listener.userId}` : `g:${listener.guestId}`;
  if (!rateLimit(`community-play:${key}`, PLAY_RATE.limit, PLAY_RATE.windowMs).ok) return NextResponse.json({ counted: false, reason: 'rate' });

  const card = await prisma.creativeCard.findFirst({
    where: { id: cardId, primary: { in: [...PLAYABLE_DISCIPLINES] }, ...publicCardWhere() }, select: { id: true, primary: true },
  });
  if (!card || !isPlayableDiscipline(card.primary)) return NextResponse.json({ counted: false, reason: 'unknown' }, { status: 404 });

  const now = new Date();
  const seen = await prisma.analyticsEvent.findFirst({
    where: { name: 'community_play', ...listener, createdAt: { gte: utcDayStart(now) }, props: { path: ['cardId'], equals: cardId } },
    select: { id: true },
  });
  if (seen) return NextResponse.json({ counted: false, reason: 'today' });

  await prisma.analyticsEvent.create({ data: { name: 'community_play', props: { cardId, discipline: card.primary }, ...listener, ts: now } });
  await prisma.$executeRaw`UPDATE "CreativeCard" SET "stats" = jsonb_set(COALESCE("stats", '{}'::jsonb), '{plays}', to_jsonb(COALESCE(("stats"->>'plays')::int, 0) + 1)) WHERE "id" = ${cardId}`;
  return NextResponse.json({ counted: true });
}
