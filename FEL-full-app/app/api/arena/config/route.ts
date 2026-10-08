export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { readWallet } from '@/lib/wallet/wallet-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ARENA_RAKE_PERCENT, ARENA_FEE_TIERS, arenaStakeableModes } from '@/lib/arena';
import { pausedStakeModes } from '@/lib/stakingPause';
import { MODE_INFO } from '@/lib/game-data';
import { isUnlistedMode } from '@/lib/unlisted-modes';

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
    // LC lives in the wallet (2026-09-04); the profile column is the mirror
    balance = (await readWallet(prisma, userId)).lc ?? (profile?.labCredits ?? 0);
  }

  // MUSIC-SUITE P1 (2026-09-25, owner decision #9: "pause staking both now"): the lobby's mode picker offers only modes
  // a NEW stake can be opened on. The paused ones (lib/stakingPause.ts) are named beside it rather than silently
  // dropped, so a player looking for music or dance reads why; their open duels keep their links in /api/arena/list.
  // IRON-PARADISE-OUT (2026-10-03): a parked mode (lib/unlisted-modes.ts) is never offered for a NEW stake — its
  // /play route redirects, and a stake on a redirecting route is a trap. ARENA_MODES keeps the row (lib/arena.ts,
  // music's file) so a duel posted before the parking still settles.
  const modes = arenaStakeableModes().filter((key) => !isUnlistedMode(key)).map((key) => ({
    key,
    name: MODE_INFO[key]?.name ?? key,
    venue: MODE_INFO[key]?.venue ?? '',
    href: MODE_INFO[key]?.href ?? '#',
  }));

  return NextResponse.json({
    rakePercent: ARENA_RAKE_PERCENT,
    feeTiers: ARENA_FEE_TIERS,
    modes,
    pausedModes: pausedStakeModes(),
    balance,
    authenticated: Boolean(userId),
  });
}
