export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isRealMoneyCompetitionEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { checkCompetitionEligibility } from '@/lib/competition';

/**
 * GET /api/competition/eligibility
 * Check if the current user passes all compliance gates.
 */
export async function GET() {
  if (!isRealMoneyCompetitionEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { dobYear: true, kycStatus: true, selfExcludedAt: true, declaredState: true },
  });
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const result = checkCompetitionEligibility(user);
  return NextResponse.json(result);
}
