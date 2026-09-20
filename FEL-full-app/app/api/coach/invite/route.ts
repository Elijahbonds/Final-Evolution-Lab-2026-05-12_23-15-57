import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { randomBytes } from 'node:crypto';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { INVITE_TTL_MS, MAX_LIVE_INVITES_PER_COACH, type InviteUse } from '@/lib/coach/invite';

export const dynamic = 'force-dynamic';

/** 192 bits, the same as a share token, because the URL is the whole access control. */
const newInviteToken = () => randomBytes(24).toString('base64url');

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

  const invite = await prisma.coachInvite.create({
    data: {
      token: newInviteToken(), coachId, use,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS[use]),
    },
    select: { token: true, use: true, expiresAt: true, joined: true, createdAt: true },
  });
  return NextResponse.json({ invite }, { status: 201 });
}
