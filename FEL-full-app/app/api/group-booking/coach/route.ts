export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { coachAct, coachBoard, coachRoster, type GroupDb } from '@/lib/group-booking/server';

/**
 * GROUP-BOOKING: the coach's groups (the business owner, or one of their active trainers for the groups they run).
 *   GET              → the board: one line per group (people, waitlist, under-6), sessions, make-up slots, 1:1s, gyms, trainers
 *   GET ?slot=<key>  → that session's roster
 *   POST { action: 'create_group' | 'open_at_gym' | 'move_gym' | 'decide' | 'mark' | 'paid' | 'message' | 'set_address' |
 *          'invite_trainer' | 'update_trainer' | 'remove_trainer' | 'mark_1on1' | 'paid_1on1', … }
 */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const slot = req.nextUrl.searchParams.get('slot');
  const db = prisma as unknown as GroupDb;
  const r = slot ? await coachRoster(db, userId, slot) : await coachBoard(db, userId);
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await coachAct(prisma as unknown as GroupDb, userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
