export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/v1/camp/consent — request guardian consent for a minor mentee.
 *  { menteeId?, guardianName, guardianEmail, menteeBirthYear }. A facilitator
 *  may request for a mentee; a mentee may request for themselves. Returns the
 *  acceptance token — delivery is the caller's job (email), never this route's. */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  let body: { menteeId?: string; guardianName?: string; guardianEmail?: string; menteeBirthYear?: number };
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const menteeId = typeof body.menteeId === 'string' && body.menteeId ? body.menteeId : userId;
  const guardianName = String(body.guardianName ?? '').trim().slice(0, 80);
  const guardianEmail = String(body.guardianEmail ?? '').trim().toLowerCase();
  const menteeBirthYear = Number(body.menteeBirthYear);
  if (!guardianName || !EMAIL.test(guardianEmail)) return bad('guardian_required');
  if (!Number.isInteger(menteeBirthYear) || menteeBirthYear < 1900 || menteeBirthYear > new Date().getFullYear()) return bad('birth_year_invalid');
  if (menteeId !== userId) {
    const fac = await prisma.facilitatorProfile.findUnique({ where: { userId } });
    if (fac?.certificationStatus !== 'certified') return bad('facilitator_not_certified', 403);
  }
  const token = randomBytes(24).toString('base64url');
  const consent = await prisma.guardianConsent.create({ data: { menteeId, guardianName, guardianEmail, menteeBirthYear, token } });
  return NextResponse.json({ id: consent.id, token, requestedAt: consent.requestedAt });
}

/**
 * GET /api/v1/camp/consent?token=… — the guardian accepts. No login: the token is the credential.
 *
 * MIRROR-COACH P5 FIX (2026-09-29, code review) — Finding "Guardian-consent gate is self-bypassable by the minor it
 * restricts": app/play/mirror/_components/guardian-consent-gate.tsx shows the mentee this exact accept URL on their
 * own screen (FEL sends no email — owner decision #21), and until this fix nothing here stopped the SAME signed-in
 * account from opening it and tapping Accept, defeating the entire youth-mode gate with no adult involved.
 *
 * THE FIX: refuse the accept when the caller is signed in as the mentee this request is FOR. A genuine guardian has
 * no FEL account and no session at all — "the token is the credential" a line below is exactly for them — so this
 * check costs a real guardian nothing. It only ever blocks one caller: the mentee's own signed-in session.
 *
 * THIS IS A NARROW FIX, NOT A COMPLETE ONE, and is reported as such rather than claimed otherwise: a minor who
 * signs out (or opens the link in a different browser/private window) before tapping Accept is not caught — this
 * route has no email/SMS delivery step to prove a DIFFERENT human is on the other end at all (owner decision #21:
 * no email service). Closing that fully needs real out-of-band delivery, an adult-verification step, or reworking
 * this feature away from "the token is the credential" — each bigger than this fix; flagged for the owner rather
 * than silently declared solved.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token) return bad('token_required');
  const consent = await prisma.guardianConsent.findUnique({ where: { token } });
  if (!consent || consent.revokedAt) return bad('not_found', 404);
  if (consent.acceptedAt) return NextResponse.json({ accepted: true, acceptedAt: consent.acceptedAt, already: true });

  const callerId = await currentUserId();
  if (callerId && callerId === consent.menteeId) return bad('self_accept_blocked', 403);

  const updated = await prisma.guardianConsent.update({ where: { token }, data: { acceptedAt: new Date() } });
  return NextResponse.json({ accepted: true, acceptedAt: updated.acceptedAt });
}
