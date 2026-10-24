import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { invitePath } from '@/lib/coach/invite';
import { CODE_LOOKUP_RATE, codeTokenPrefix, normalizeCode } from '@/lib/coach/inviteCode';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/coach/invite/code/[code] — a typed invite code (coach-loop P1, lib/coach/inviteCode.ts) to the invite it
 * belongs to. Answers the landing page's path, and nothing about the coach or the athlete: the landing page says
 * whose roster it is, and joining still happens there, behind sign-in and the teen gate.
 *
 * A malformed code, an unknown one, an expired one and a closed one answer the same 404 — the rule the token route and
 * ShareLink already hold. Rate-limited per client address.
 */
export async function GET(req: Request, { params }: { params: { code: string } }) {
  const rl = rateLimit(`invite-code:${clientKeyFromHeaders(req.headers)}`, CODE_LOOKUP_RATE.limit, CODE_LOOKUP_RATE.windowMs);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } });
  const code = normalizeCode(decodeURIComponent(String(params?.code ?? '')));
  if (!code) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const row = await prisma.coachInvite.findFirst({
    where: { token: { startsWith: codeTokenPrefix(code) }, closedAt: null, expiresAt: { gt: new Date() } },
    select: { token: true },
  });
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ path: invitePath(row.token) });
}
