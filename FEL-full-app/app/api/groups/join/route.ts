export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';
import { CODE_LOOKUP_RATE } from '@/lib/coach/inviteCode';
import { joinGroup, previewInvite, type GroupsDb } from '@/lib/groups/server';

/**
 * TEAMS-SQUADS: a group invite — the link (`token`), the typed code (`code`, ABCD-2345) or the QR (the link).
 *   GET ?token= | ?code=  → { kind, name, color, token } before sign-in; a closed invite and none at all answer 404 alike.
 *   POST { token } | { code } → { result: 'joined' | 'already', id, path }. The join gate runs on a new join (a team:
 *                         the coach loop's teen gate, and the athlete joins the coach's roster; a squad: the squad gate).
 * Code lookups are rate-limited per address as the coach code is (CODE_LOOKUP_RATE). 503 before the SQL is applied.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const code = q.get('code');
  if (code && !rateLimit(`groups-code:${clientKeyFromHeaders(req.headers)}`, CODE_LOOKUP_RATE.limit, CODE_LOOKUP_RATE.windowMs).ok) return bad('rate_limited', 429);
  const r = await previewInvite(prisma as unknown as GroupsDb, { token: q.get('token') ?? undefined, code: code ?? undefined });
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`groups-join:${userId}`, CODE_LOOKUP_RATE.limit, CODE_LOOKUP_RATE.windowMs).ok) return bad('rate_limited', 429);
  const body = await req.json().catch(() => null);
  if (!body) return bad('invalid_json');
  const r = await joinGroup(prisma as unknown as GroupsDb, userId, body);
  return NextResponse.json(r.body, { status: r.status });
}
