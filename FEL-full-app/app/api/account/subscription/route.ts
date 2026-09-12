export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  gateAttributes, hasActivePro, upgradeStatusLine, FEL_PRO_WEEKLY_USD,
} from '@/lib/progression/upgradeGate';
import { PRQ_BASELINE } from '@/lib/prq-engine';

/**
 * GET /api/account/subscription — current user's active subscriptions + entitlements.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subs = await prisma.subscription.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  });

  const felPro = hasActivePro(subs as Array<{ product?: string | null; status?: string | null }>);
  const entitlements = {
    felPro,
    studioCreator: subs.some((s: any) => s.product === 'STUDIO_CREATOR' && s.status === 'ACTIVE'),
  };

  // FEL PRO — attribute upgrades (2026-09-12). Playing and scanning the PRQ are free and the
  // scanned base is the player's for good; the points training adds on top are ACTIVE only while
  // Pro is. Nothing earned is ever deleted, so this reports what is PAUSED rather than lost, and
  // the client can say so honestly instead of implying the progress is gone.
  const profile = await prisma.playerProfile.findUnique({ where: { userId: session.user.id } });
  let upgrades: ReturnType<typeof gateAttributes> | null = null;
  if (profile) {
    const earned = {
      strength: profile.strength, speed: profile.speed, endurance: profile.endurance,
      agility: profile.agility, power: profile.power, flexibility: profile.flexibility,
      recovery: profile.recovery, mental: profile.mental,
    };
    // the scan base: PRQ_BASELINE until a measured base is wired through, so the gate is
    // conservative — it can only ever withhold points above the baseline, never below it
    const base = Object.fromEntries(Object.keys(earned).map((k) => [k, PRQ_BASELINE]));
    upgrades = gateAttributes({ base, earned, hasPro: felPro });
  }

  return NextResponse.json({
    subscriptions: subs,
    entitlements,
    pro: { weeklyUsd: FEL_PRO_WEEKLY_USD, active: felPro },
    upgrades: upgrades && {
      active: upgrades.upgradesActive,
      pausedPoints: upgrades.pausedPoints,
      detail: upgrades.detail,
      status: upgradeStatusLine(upgrades),
    },
  });
}
