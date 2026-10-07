export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rateLimit } from '@/lib/rate-limit';
import { parseAvailabilityInput, todayDay } from '@/lib/coach/availability';
import { availabilityForAthlete, availabilityForCoach, setAvailability, type RawDb } from '@/lib/coach/availabilityServer';

/**
 * COACH-AI Phase 8 (2026-10-07): an athlete's availability — Full / Limited / Out and an optional return day, set by
 * their coach, never a diagnosis (lib/coach/availability.ts has the rules).
 *   GET                → the coach's view: { available, byClient, linked } — statuses for the athletes on their live
 *                        roster, and which athletes a status can be set for.
 *   GET ?as=athlete    → the athlete's own: { available, status, returnBy }.
 *   POST { clientId, status, returnBy? } → coach only, for an athlete on their live roster (a CoachClient row, not
 *                        ended); any other key is refused (400 unexpected_field) so no free text can be stored.
 * Before the pending SQL is applied: GETs say { available: false } (200) and POST answers 503
 * availability_unavailable. Nothing 500s.
 */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const db = prisma as unknown as RawDb;
  const today = todayDay();
  if (req.nextUrl.searchParams.get('as') === 'athlete') return NextResponse.json(await availabilityForAthlete(db, userId, today));
  const map = await availabilityForCoach(db, userId, today);
  if (!map.available) return NextResponse.json(map);
  // the athletes a status can be set for: a live CoachClient row (the table's foreign key). assumption: a client the
  // roster shows only through an older program, with no CoachClient row, gets no picker until they join by invite.
  const links = await prisma.coachClient.findMany({ where: { coachId: userId, endedAt: null }, select: { clientId: true } });
  return NextResponse.json({ ...map, linked: links.map((l) => l.clientId) });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-availability:${userId}`, 60, 60_000).ok) return bad('rate_limited', 429);
  let body: unknown;
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const input = parseAvailabilityInput(body, todayDay());
  if (!input.ok) return bad(input.error);
  const link = await prisma.coachClient.findUnique({ where: { coachId_clientId: { coachId: userId, clientId: input.clientId } }, select: { endedAt: true } });
  if (!link || link.endedAt) return bad('not_your_athlete', 403);
  const saved = await setAvailability(prisma as unknown as RawDb, userId, input.clientId, input.status, input.returnBy);
  if (!saved) return bad('availability_unavailable', 503);
  return NextResponse.json({ saved: true, status: input.status, returnBy: input.returnBy });
}
