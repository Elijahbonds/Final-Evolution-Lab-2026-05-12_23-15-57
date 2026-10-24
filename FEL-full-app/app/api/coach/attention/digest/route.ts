export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { alertDigest, type CoachAlert } from '@/lib/coach/alerts';
import { mailLinkOrigin, sendMail } from '@/lib/mail';
import { rateLimit } from '@/lib/rate-limit';
import { GET as attentionGET } from '../route';

/**
 * POST /api/coach/attention/digest — email me my compliance alerts (coach-loop P1, 2026-10-20).
 *
 * The board is read exactly as the panel reads it (GET /api/coach/attention, same session), and only its `alerts` —
 * names and one line each (lib/coach/alerts.ts) — go into the email. Pain flags, readiness and every health field on
 * that board stay out. It goes to the signed-in coach's OWN account address, never one from the request. Behind
 * EMAIL_ENABLED (lib/mail): with email off the answer says so and nothing is sent. A few a day at most.
 *
 * assumption: on demand only. A daily automatic digest needs a scheduler (none runs FEL jobs today); that is next.
 */
export async function POST() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`attention-digest:${userId}`, 5, 24 * 60 * 60 * 1000).ok) return bad('rate_limited', 429);

  const res = await attentionGET();
  if (!res.ok) return bad('board_unavailable', 502);
  const board = await res.json() as { alerts?: CoachAlert[] };
  const alerts = board.alerts ?? [];
  const origin = mailLinkOrigin();
  const digest = alertDigest(alerts, origin ? `${origin}/coach` : null);
  if (!digest) return NextResponse.json({ status: 'nothing_to_send', count: 0 });

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!me?.email) return NextResponse.json({ status: 'no_address', count: alerts.length });
  const r = await sendMail({ to: me.email, ...digest });
  return NextResponse.json({ status: r.status === 'sent' ? 'sent' : r.status === 'disabled' ? 'email_off' : 'failed', count: alerts.length });
}
