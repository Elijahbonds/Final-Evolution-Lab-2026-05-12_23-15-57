export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ARENA_RAKE_PERCENT, ARENA_FEE_TIERS, ARENA_MODES } from '@/lib/arena';
import { MODE_INFO } from '@/lib/game-data';

/**
 * GET /api/arena/config
 * Public Arena parameters + the caller's current LC balance.
 * No flag gate — the Arena runs on virtual Lab Credits (no cash on-ramp).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;

  let balance = 0;
  if (userId) {
    const profile = await prisma.playerProfile.findUnique({
      where: { userId },
      select: { labCredits: true },
    });
    balance = profile?.labCredits ?? 0;
  }

  const modes = ARENA_MODES.map((key) => ({
    key,
    name: MODE_INFO[key]?.name ?? key,
    venue: MODE_INFO[key]?.venue ?? '',
    href: MODE_INFO[key]?.href ?? '#',
  }));

  return NextResponse.json({
    rakePercent: ARENA_RAKE_PERCENT,
    feeTiers: ARENA_FEE_TIERS,
    modes,
    balance,
    authenticated: Boolean(userId),
  });
}
