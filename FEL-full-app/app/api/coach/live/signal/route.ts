export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rateLimit } from '@/lib/rate-limit';
import { getSignalStore } from '@/lib/controller-link/signalStore';
import { parseRoomId } from '@/lib/coach/live/gate';
import { checkSignal, coachLiveEnabled, pollSignals, pushSignal, readLiveGate, type LiveDb } from '@/lib/coach/live/server';

/**
 * COACH-LIVE (2026-10-25): the live room's signals, through Controller Link's signal store (lib/coach/live/server.ts).
 *   GET  ?room=&after=<seq>  → { messages: [{ seq, data }] } addressed to the caller's role.
 *   POST { room, data }      → { seq }. data.kind: offer | answer | ice | bye, or — only when the direct path failed —
 *                              ctl | pose (the relay). The server sets from (the caller's role) and to (the other).
 * Every call goes through the room's door (cached a minute). The poll runs at 4 a second while connecting or relaying.
 */
async function door(userId: string, room: unknown) {
  const ref = parseRoomId(room);
  if (!ref) return { error: bad('not_found', 404) } as const;
  const d = await readLiveGate(prisma as unknown as LiveDb, userId, ref);
  if (!d.ok) return { error: bad(d.error, d.status) } as const;
  return { ref, role: d.role } as const;
}

export async function GET(req: NextRequest) {
  if (!coachLiveEnabled()) return bad('not_found', 404);
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-live:poll:${userId}`, 600, 60_000).ok) return bad('rate_limited', 429);
  const d = await door(userId, req.nextUrl.searchParams.get('room'));
  if ('error' in d) return d.error;
  const after = Number(req.nextUrl.searchParams.get('after') ?? '0');
  return NextResponse.json({ messages: await pollSignals(getSignalStore(), d.ref, d.role, Number.isFinite(after) ? after : 0) });
}

export async function POST(req: NextRequest) {
  if (!coachLiveEnabled()) return bad('not_found', 404);
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-live:signal:${userId}`, 600, 60_000).ok) return bad('rate_limited', 429);
  let body: { room?: unknown; data?: unknown };
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const d = await door(userId, body.room);
  if ('error' in d) return d.error;
  const ok = checkSignal(body.data);
  if (!ok.ok) return bad(ok.error, ok.error === 'too_big' ? 413 : 400);
  const seq = await pushSignal(getSignalStore(), d.ref, d.role, body.data);
  return NextResponse.json({ seq });
}
