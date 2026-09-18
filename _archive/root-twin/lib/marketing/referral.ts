/**
 * lib/marketing/referral.ts — viral referral loop (Phase 5).
 *
 * A registered athlete gets a stable share code (/?ref=CODE). When a lead who
 * arrived via that code converts to a registered account, the REFERRER earns
 * shards exactly once (idempotent per referred user), the conversion is
 * recorded, and the referrer is emailed. All conversion work is best-effort:
 * a referral hiccup must NEVER fail a signup.
 *
 * This module talks to the DB + wallet, so it is server-only (not a pure core),
 * but the code-generation math is pure and unit-tested.
 */
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { grantServerReward } from '@/lib/wallet/wallet-service';
import { REASON } from '@/lib/wallet/reward-rules';
import { sendReferralRewardEmail } from '@/lib/marketing/email';
import { normalizeEmail } from '@/lib/marketing/funnel';
import { generateReferralCode, isValidReferralCode } from '@/lib/marketing/referral-core';

export { generateReferralCode, isValidReferralCode };

/** Get or lazily create the caller's stable referral code. */
export async function ensureReferralCode(prisma: PrismaClient, userId: string): Promise<string> {
  const existing = await prisma.referralCode.findUnique({ where: { userId } });
  if (existing) return existing.code;
  // Retry a few times on the (astronomically rare) code collision.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateReferralCode();
    try {
      const created = await prisma.referralCode.create({ data: { userId, code } });
      return created.code;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        // Either the user got a code concurrently, or the code collided.
        const again = await prisma.referralCode.findUnique({ where: { userId } });
        if (again) return again.code;
        continue;
      }
      throw e;
    }
  }
  throw new Error('could not allocate referral code');
}

/** Referral stats for the caller's profile UI. */
export async function getReferralStats(prisma: PrismaClient, userId: string) {
  const rc = await prisma.referralCode.findUnique({
    where: { userId },
    include: { _count: { select: { conversions: true } } },
  });
  if (!rc) return { code: null as string | null, clicks: 0, signups: 0, conversions: 0, shardsEarned: 0 };
  const agg = await prisma.referralConversion.aggregate({
    where: { referrerId: userId },
    _sum: { shardsAwarded: true },
  });
  return {
    code: rc.code,
    clicks: rc.clicks,
    signups: rc.signups,
    conversions: rc._count.conversions,
    shardsEarned: agg._sum.shardsAwarded ?? 0,
  };
}

/**
 * Convert a referral when a new user registers. Resolves the referrer either
 * from an explicit code (signup ?ref=) or from a previously-captured lead row
 * for this email. Grants the referrer shards ONCE (idempotent per referred
 * user). Fully best-effort — returns silently on any miss or error.
 */
export async function convertReferralOnSignup(
  prisma: PrismaClient,
  args: { referredUserId: string; email: string; refCode?: string | null }
): Promise<{ converted: boolean; shards: number }> {
  try {
    const email = normalizeEmail(args.email);
    const lead = await prisma.marketingLead.findUnique({ where: { email } });
    const code = (args.refCode || lead?.referredByCode || '').toUpperCase();

    // Always advance the lead lifecycle to converted if we have one.
    if (lead && lead.stage !== 'converted') {
      await prisma.marketingLead.update({
        where: { email },
        data: { stage: 'converted', convertedUserId: args.referredUserId },
      }).catch(() => {});
    }

    if (!code || !isValidReferralCode(code)) return { converted: false, shards: 0 };
    const rc = await prisma.referralCode.findUnique({ where: { code } });
    if (!rc) return { converted: false, shards: 0 };
    if (rc.userId === args.referredUserId) return { converted: false, shards: 0 }; // no self-referral

    // Idempotent: one conversion per referred user (unique constraint).
    const already = await prisma.referralConversion.findUnique({ where: { referredUserId: args.referredUserId } });
    if (already) return { converted: true, shards: already.shardsAwarded };

    const grant = await grantServerReward(prisma, {
      playerId: rc.userId,
      reasonCode: REASON.REFERRAL_BONUS,
      idempotencyKey: `referral:${args.referredUserId}`,
      metadata: { referredUserId: args.referredUserId, code },
    });
    const shards = grant.granted.shards;

    await prisma.referralConversion.create({
      data: {
        codeId: rc.id,
        referrerId: rc.userId,
        referredUserId: args.referredUserId,
        shardsAwarded: shards,
      },
    }).catch(() => {});
    await prisma.referralCode.update({ where: { id: rc.id }, data: { signups: { increment: 1 } } }).catch(() => {});

    // Email the referrer their reward (best-effort).
    const referrer = await prisma.user.findUnique({ where: { id: rc.userId }, select: { email: true, name: true } });
    if (referrer?.email) void sendReferralRewardEmail(referrer.email, referrer.name ?? 'Athlete', shards);

    return { converted: true, shards };
  } catch (err) {
    console.error('convertReferralOnSignup failed', err);
    return { converted: false, shards: 0 };
  }
}
