export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad, requirePaidFacilitator } from '@/lib/camp/server';

/** GET /api/v1/camp/mentees?email=… — a certified facilitator resolves a mentee by exact email.
 *  Returns only id and display name; never lists users. */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  { const paywalled = await requirePaidFacilitator(userId); if (paywalled) return paywalled; }
  const fac = await prisma.facilitatorProfile.findUnique({ where: { userId } });
  if (fac?.certificationStatus !== 'certified') return bad('facilitator_not_certified', 403);
  const email = (req.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase();
  if (!email) return bad('email_required');
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, dobYear: true } });
  if (!user || user.id === userId) return bad('not_found', 404);
  const consent = await prisma.guardianConsent.findFirst({ where: { menteeId: user.id, acceptedAt: { not: null }, revokedAt: null }, select: { acceptedAt: true } });
  return NextResponse.json({ mentee: { id: user.id, name: user.name ?? user.email.split('@')[0], consentAccepted: Boolean(consent), birthYearKnown: user.dobYear != null } });
}
