import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MAX_LIVE_INVITES_PER_COACH, type InviteUse } from '@/lib/coach/invite';
import { createCodedInvite } from '@/lib/coach/inviteServer';

export const dynamic = 'force-dynamic';

// COACH-LOOP P1 (2026-10-20): every new invite carries a short typed code at the front of its token (lib/coach/
// inviteCode.ts) — `CODE~` + the same 192 random bits the link always had. The panel reads the code off the token.

/** GET /api/coach/invite — my live invites, newest first. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const coachId = (session?.user as { id?: string } | undefined)?.id;
  if (!coachId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const now = new Date();
  const invites = await prisma.coachInvite.findMany({
    where: { coachId, closedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
    select: { token: true, use: true, expiresAt: true, joined: true, createdAt: true },
  });
  return NextResponse.json({ invites });
}

/** POST /api/coach/invite — make a link. Body: { use?: 'once' | 'many' }. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const coachId = (session?.user as { id?: string } | undefined)?.id;
  if (!coachId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const use: InviteUse = body?.use === 'many' ? 'many' : 'once';

  const live = await prisma.coachInvite.count({
    where: { coachId, closedAt: null, expiresAt: { gt: new Date() } },
  });
  if (live >= MAX_LIVE_INVITES_PER_COACH) {
    return NextResponse.json({ error: 'too_many_invites' }, { status: 429 });
  }

  const invite = await createCodedInvite(prisma, coachId, use);
  return NextResponse.json({ invite }, { status: 201 });
}
