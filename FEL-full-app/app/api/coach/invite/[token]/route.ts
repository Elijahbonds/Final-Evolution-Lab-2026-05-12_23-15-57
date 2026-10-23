import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { inviteState, joinWithInvite, type CoachInvite } from '@/lib/coach/invite';
import { teenGateRefusal } from '@/lib/coach/teenGateServer';

export const dynamic = 'force-dynamic';

/** Load the row and shape it the way the pure module expects. */
async function load(token: string): Promise<CoachInvite | null> {
  const row = await prisma.coachInvite.findUnique({
    where: { token },
    select: {
      token: true, coachId: true, use: true, closedAt: true, expiresAt: true, joined: true, createdAt: true,
      coach: { select: { name: true } },
    },
  });
  if (!row) return null;
  return {
    token: row.token, coachId: row.coachId, coachName: row.coach?.name ?? 'your coach',
    use: row.use === 'many' ? 'many' : 'once',
    createdAtMs: row.createdAt.getTime(), expiresAtMs: row.expiresAt.getTime(),
    closedAtMs: row.closedAt ? row.closedAt.getTime() : undefined, joined: row.joined,
  };
}

/**
 * GET /api/coach/invite/[token] — what the landing page shows BEFORE anyone signs in: whose roster this is.
 * A dead link and a link that never existed answer identically, the same rule ShareLink holds.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const invite = await load(String(params?.token ?? ''));
  if (!invite || inviteState(invite, Date.now()) !== 'open') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ coachName: invite.coachName, use: invite.use, expiresAt: invite.expiresAtMs });
}

/** POST /api/coach/invite/[token] — accept it. Auth required: this is the moment a client joins a roster. */
export async function POST(_req: Request, { params }: { params: { token: string } }) {
  const session = await getServerSession(authOptions);
  const clientId = (session?.user as { id?: string } | undefined)?.id;
  if (!clientId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const token = String(params?.token ?? '');
  const invite = await load(token);
  const already = invite
    ? !!(await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: invite.coachId, clientId } },
        select: { id: true },
      }))
    : false;

  const outcome = joinWithInvite(invite, clientId, Date.now(), already);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.result, message: outcome.message }, { status: 400 });
  }

  if (outcome.result === 'joined') {
    // COACH-LOOP P1 (2026-10-20): joining a roster is the moment a coach starts holding a teen's training, so the teen
    // gate runs here (lib/coach/teenGate.ts): guardian consent for 13–17, never under 13, a blank year asked first.
    // Only on a NEW join — a dead invite still answers 400 as before, and someone already on the roster writes nothing.
    const refused = await teenGateRefusal(prisma, clientId);
    if (refused) return refused;
    await prisma.coachClient.create({ data: { coachId: invite!.coachId, clientId, via: 'invite' } });
    await prisma.coachInvite.update({
      where: { token },
      data: { joined: { increment: 1 }, ...(outcome.closeInvite ? { closedAt: new Date() } : {}) },
    });
  }
  return NextResponse.json({ result: outcome.result, message: outcome.message, coachName: invite!.coachName });
}

/** DELETE /api/coach/invite/[token] — revoke. The coach's own link only. */
export async function DELETE(_req: Request, { params }: { params: { token: string } }) {
  const session = await getServerSession(authOptions);
  const coachId = (session?.user as { id?: string } | undefined)?.id;
  if (!coachId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const row = await prisma.coachInvite.findUnique({ where: { token: String(params?.token ?? '') }, select: { coachId: true } });
  if (!row || row.coachId !== coachId) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await prisma.coachInvite.update({ where: { token: String(params.token) }, data: { closedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
