export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { GUEST_COOKIE } from '@/lib/guest';
import { rateLimit } from '@/lib/rate-limit';
import { publicCardWhere } from '@/lib/creator/creative-card-review';
import { isFelSongId } from '@/lib/babylon/dance/felSongs';
import { listenerOf, utcDayStart, PLAY_THRESHOLD_SEC } from '@/lib/soundtrack/playCount';
import { parseTrackId } from '@/lib/soundtrack/types';

const PLAY_RATE = { limit: 60, windowMs: 60 * 60_000 };

/**
 * POST /api/v1/soundtrack/[id]/play  { heardSec }  — CREATOR SOUNDTRACK piece L.
 *
 * Counts one play of a soundtrack track: at least 30 s heard (the player measures it, lib/soundtrack/playCount.ts), at
 * most once per listener (account, else guest token; nobody else is counted), per track, per UTC day, through an
 * AnalyticsEvent lookup (name 'soundtrack_play'). A card track's count lands atomically in CreativeCard.stats.plays
 * (jsonb_set; no schema change) and only for a card the public may hear. House tracks are recorded, not counted on a card.
 * Answers {counted} — never an error a listener would notice.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const track = parseTrackId(decodeURIComponent(params.id));
  if (!track) return NextResponse.json({ error: 'bad track id' }, { status: 400 });
  let body: { heardSec?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const heard = typeof body.heardSec === 'number' && Number.isFinite(body.heardSec) ? body.heardSec : 0;
  if (heard < PLAY_THRESHOLD_SEC) return NextResponse.json({ counted: false, reason: 'short' });

  const session = await getServerSession(authOptions);
  const listener = listenerOf((session?.user as { id?: string } | undefined)?.id, cookies().get(GUEST_COOKIE)?.value);
  if (!listener) return NextResponse.json({ counted: false, reason: 'anonymous' });
  const key = 'userId' in listener ? `u:${listener.userId}` : `g:${listener.guestId}`;
  if (!rateLimit(`soundtrack-play:${key}`, PLAY_RATE.limit, PLAY_RATE.windowMs).ok) return NextResponse.json({ counted: false, reason: 'rate' });

  const trackId = `${track.source}:${track.ref}`;
  if (track.source === 'house' ? !isFelSongId(track.ref)
    : !(await prisma.creativeCard.findFirst({ where: { id: track.ref, primary: 'music', ...publicCardWhere() }, select: { id: true } }))) {
    return NextResponse.json({ counted: false, reason: 'unknown' }, { status: 404 });
  }

  const now = new Date();
  const seen = await prisma.analyticsEvent.findFirst({
    where: { name: 'soundtrack_play', ...listener, createdAt: { gte: utcDayStart(now) }, props: { path: ['trackId'], equals: trackId } },
    select: { id: true },
  });
  if (seen) return NextResponse.json({ counted: false, reason: 'today' });

  await prisma.analyticsEvent.create({ data: { name: 'soundtrack_play', props: { trackId, heardSec: Math.round(heard) }, ...listener, ts: now } });
  if (track.source === 'card') {
    await prisma.$executeRaw`UPDATE "CreativeCard" SET "stats" = jsonb_set(COALESCE("stats", '{}'::jsonb), '{plays}', to_jsonb(COALESCE(("stats"->>'plays')::int, 0) + 1)) WHERE "id" = ${track.ref}`;
  }
  return NextResponse.json({ counted: true });
}
