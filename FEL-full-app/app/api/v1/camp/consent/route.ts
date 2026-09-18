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

/** GET /api/v1/camp/consent?token=… — the guardian accepts. No login: the token is the credential. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token) return bad('token_required');
  const consent = await prisma.guardianConsent.findUnique({ where: { token } });
  if (!consent || consent.revokedAt) return bad('not_found', 404);
  if (consent.acceptedAt) return NextResponse.json({ accepted: true, acceptedAt: consent.acceptedAt, already: true });
  const updated = await prisma.guardianConsent.update({ where: { token }, data: { acceptedAt: new Date() } });
  return NextResponse.json({ accepted: true, acceptedAt: updated.acceptedAt });
}
