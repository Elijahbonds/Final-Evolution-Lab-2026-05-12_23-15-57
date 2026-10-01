import { prisma } from '@/lib/db';
import { PRQ_ATTRS } from '@/lib/prq';
import { applyLc } from '@/lib/wallet/wallet-service';
import { settledRecovery } from '@/lib/prq-recovery';

function randAttr() {
  return Math.round((40 + Math.random() * 30) * 10) / 10;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getOrCreateProfile(userId: string) {
  let profile = await prisma.playerProfile.findUnique({ where: { userId } });
  if (!profile) {
    profile = await prisma.playerProfile.create({
      data: {
        userId,
        strength: randAttr(),
        speed: randAttr(),
        endurance: randAttr(),
        agility: randAttr(),
        power: randAttr(),
        flexibility: randAttr(),
        recovery: randAttr(),
        mental: randAttr(),
        labCredits: 500,
      },
    });
    await applyLc(prisma, { playerId: userId, delta: 500, reasonCode: 'WELCOME_GRANT', source: 'milestone', idempotencyKey: `welcome:${userId}` });   // LC lives in the wallet (2026-09-04)
  }

  // Apply inactivity decay: -0.5 per attribute per full day since lastActiveAt (beyond 1 day)
  const now = Date.now();
  const lastActive = new Date(profile.lastActiveAt ?? now).getTime();
  const lastDecay = new Date(profile.lastDecayAt ?? now).getTime();
  const idleDays = Math.floor((now - Math.max(lastActive, lastDecay)) / DAY_MS);
  const data: Record<string, any> = {};
  if (idleDays >= 1) {
    const dec = idleDays * 0.5;
    data.lastDecayAt = new Date();
    for (const a of PRQ_ATTRS) {
      if (a === 'recovery') continue;   // MIRROR-COACH P9: recovery has its own rule, settled below
      const cur = Number((profile as any)?.[a] ?? 0);
      data[a] = Math.max(0, Math.round((cur - dec) * 100) / 100);
    }
  }

  // MIRROR-COACH P9 (2026-09-30): PRQ RECOVERY IS SETTLED HERE (owner decision #12; the rule is lib/prq-engine.ts "PRQ
  // recovery", the reads lib/prq-recovery.ts). It used to take the same −0.5 per idle day toward 0 as every attribute
  // above — and only for a player who had stopped playing, so a player in every day kept every trivia-raised point.
  // Now it rises only from logged recovery work (cool-downs, off days, easy-cardio minutes) and the part above 50
  // halves every RECOVERY_HALF_LIFE_DAYS without it, whenever the player is next seen here. The other seven attributes'
  // decay above is unchanged, number for number. The settle writes in this same update (recovery + updatedAt, its
  // anchor), and a settle that cannot read (a database hiccup) changes nothing and never fails the profile read.
  const settled = await settledRecovery(prisma, userId, profile, new Date(now)).catch((e) => {
    console.error('[profile-service] PRQ recovery not settled on this read:', (e as { code?: string })?.code ?? (e as Error)?.name ?? 'error');
    return null;
  });
  // MIRROR-COACH P9 fix (2026-09-30, code review): THE SETTLE'S WRITE IS CONDITIONAL. It merged into one unconditional
  // update, on almost every call (at 4 decimals a value above 50 moves within seconds). A read here that raced a coach
  // route's settle (lib/prq-recovery.ts settleRecoveryFor, right after a cool-down or a Done) could read R, let that
  // settle credit the cool-down (R + 0.6, anchor now), and then write its own R' — settled from R without the event —
  // with an anchor LATER than the event, so the credit was gone for good. Now the settle lands only if the row has not
  // been written since this read (the same guard settleRecoveryFor uses). If it has, the other writer's value stands
  // and the next settle carries on from it; the idle decay of the other seven attributes (unchanged, and not
  // time-anchored) is still written on its own, as before.
  if (settled?.write) {
    const both = { ...data, ...settled.write };
    const r = await prisma.playerProfile.updateMany({ where: { userId, updatedAt: profile.updatedAt }, data: both });
    if (r.count > 0) profile = { ...profile, ...both } as typeof profile;
    else if (Object.keys(data).length) profile = await prisma.playerProfile.update({ where: { userId }, data });
    else profile = (await prisma.playerProfile.findUnique({ where: { userId } })) ?? profile;
  } else if (Object.keys(data).length) {
    profile = await prisma.playerProfile.update({ where: { userId }, data });
  }

  return profile;
}
