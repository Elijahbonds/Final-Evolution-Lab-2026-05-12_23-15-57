export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad, requirePaidFacilitator } from '@/lib/camp/server';

/** GET /api/v1/camp/mentees?email=… — a certified facilitator resolves one of THEIR mentees by exact email.
 *  Returns only id and display name; never lists users.
 *
 *  SAFETY FIX (owner decision 2026-10-06, "Same answer"): this was `user.findUnique({ where: { email } })` and a 404 for
 *  no account vs a 200 for any account, so a paid facilitator could learn which emails have FEL accounts. It now finds
 *  the email ONLY among the facilitator's own mentees, in one query: someone who joined them through their coach invite
 *  (an open CoachClient row — the link the mentee accepted) or someone they already have a camp plan with (a GoalPlan
 *  they facilitate; that mentee's id is already in their GET /api/v1/camp/plans). An email with no account, an account
 *  that is not theirs, and the facilitator's own email all run that same single query and get the same
 *  404 { error: 'not_found' } — no second read, no other branch. A new mentee joins through the facilitator's invite
 *  link first (app/api/coach/invite), then this finds them. tests/camp/mentee-lookup.test.ts pins both halves. */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  { const paywalled = await requirePaidFacilitator(userId); if (paywalled) return paywalled; }
  const fac = await prisma.facilitatorProfile.findUnique({ where: { userId } });
  if (fac?.certificationStatus !== 'certified') return bad('facilitator_not_certified', 403);
  const email = (req.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase();
  if (!email) return bad('email_required');
  const user = await prisma.user.findFirst({
    where: {
      email,
      id: { not: userId },
      OR: [
        { coaches: { some: { coachId: userId, endedAt: null } } },
        { goalPlansAsMentee: { some: { facilitatorUserId: userId } } },
      ],
    },
    select: { id: true, name: true, email: true, dobYear: true },
  });
  if (!user) return bad('not_found', 404);
  const consent = await prisma.guardianConsent.findFirst({ where: { menteeId: user.id, acceptedAt: { not: null }, revokedAt: null }, select: { acceptedAt: true } });
  return NextResponse.json({ mentee: { id: user.id, name: user.name ?? user.email.split('@')[0], consentAccepted: Boolean(consent), birthYearKnown: user.dobYear != null } });
}
