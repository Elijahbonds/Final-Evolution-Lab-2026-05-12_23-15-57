import { prisma } from '@/lib/db';
import { PRQ_ATTRS } from '@/lib/prq';
import { postLc } from '@/lib/ledger';

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
    await postLc(prisma, { userId, amount: 500, reason: 'Welcome grant', balanceAfter: 500, dedupeKey: `welcome:${userId}` });
  }

  // Apply inactivity decay: -0.5 per attribute per full day since lastActiveAt (beyond 1 day)
  const now = Date.now();
  const lastActive = new Date(profile.lastActiveAt ?? now).getTime();
  const lastDecay = new Date(profile.lastDecayAt ?? now).getTime();
  const idleDays = Math.floor((now - Math.max(lastActive, lastDecay)) / DAY_MS);
  if (idleDays >= 1) {
    const dec = idleDays * 0.5;
    const data: Record<string, any> = { lastDecayAt: new Date() };
    for (const a of PRQ_ATTRS) {
      const cur = Number((profile as any)?.[a] ?? 0);
      data[a] = Math.max(0, Math.round((cur - dec) * 100) / 100);
    }
    profile = await prisma.playerProfile.update({ where: { userId }, data });
  }

  return profile;
}
