export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rateLimit } from '@/lib/rate-limit';
import { partyIceServers } from '@/lib/party/social/iceServers';
import { parseRoomId } from '@/lib/coach/live/gate';
import { coachLiveEnabled, readLiveGate, type LiveDb } from '@/lib/coach/live/server';

/**
 * COACH-LIVE (2026-10-25): GET /api/coach/live?room=p_<programId>|b_<bookingId> — join a live session.
 * → { role, clientVideo, clientBand, iceServers, recorded: false }, or the door's refusal (lib/coach/live/gate.ts).
 * The ICE servers are the party's (lib/party/social/iceServers.ts: STUN, plus a TURN relay with short-lived
 * credentials only when PARTY_TURN_URLS and PARTY_TURN_SECRET are set). Off unless NEXT_PUBLIC_COACH_LIVE_ENABLED.
 */
export async function GET(req: NextRequest) {
  if (!coachLiveEnabled()) return bad('not_found', 404);
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-live:join:${userId}`, 30, 60_000).ok) return bad('rate_limited', 429);
  const ref = parseRoomId(req.nextUrl.searchParams.get('room'));
  if (!ref) return bad('not_found', 404);
  const door = await readLiveGate(prisma as unknown as LiveDb, userId, ref);
  if (!door.ok) return bad(door.error, door.status);
  return NextResponse.json({
    role: door.role, clientVideo: door.clientVideo, clientBand: door.clientBand, iceServers: partyIceServers(), recorded: false,
  });
}
