export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isStudioCreatorEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { checkBuildAllowed } from '@/lib/studio-service';

/**
 * GET /api/studio/entitlement
 * Returns the caller's Studio tier, plan limits, this-month usage, prepaid
 * credit balance, and whether another build is currently allowed.
 */
export async function GET() {
  if (!isStudioCreatorEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const gate = await checkBuildAllowed(userId);
  return NextResponse.json({
    tier: gate.tier,
    plan: gate.plan,
    usage: gate.usage,
    creditBalance: gate.creditBalance,
    buildAllowed: gate.allowed,
    reason: gate.reason,
    detail: gate.detail,
  });
}
