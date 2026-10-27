export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { feedIcs, type ScheduleDb } from '@/lib/coach/schedule/server';

/**
 * GET /api/coach/schedule/feed/<token>.ics — COACH-DELIVERY COA-05: a person's coaching calendar as an RFC 5545 feed, for a
 * calendar app to subscribe to. No session (a calendar app has none): the signed link is the access
 * (lib/coach/schedule/feedToken.ts), and resetting it kills every old copy. A bad, reset or switched-off link is a 404.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const ics = await feedIcs(prisma as unknown as ScheduleDb, decodeURIComponent(params.token ?? ''));
  if (!ics) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new NextResponse(ics, { status: 200, headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline; filename="fel-coaching.ics"' } });
}
