#!/usr/bin/env -S npx tsx
// Seed the OWNER's local account + creator card: Elijah Bonds, founder.
// "Make my creator card, use my skin" — his card exists, his avatar look is
// saved, and his in-game hero wears it (the identity pipeline applies it at
// spawn for bare hero spawns).
//
//   npx tsx scripts/seed-owner-card.ts
//
// TUNE(elijah): the skin tone below is a stand-in — re-run the System Scan
// on his account and the look re-derives (faceFromLandmarks). Everything
// else is his real identity from the Playbook.

import { readFileSync, existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@/lib/generated/prisma';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
if (process.env.NODE_ENV === 'production') {
  console.error('refusing to seed the owner account in production');
  process.exit(1);
}

const EMAIL = process.env.OWNER_EMAIL ?? 'elijah@fel.local';
const PASSWORD = process.env.OWNER_PASSWORD ?? 'owner-local-only';
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: {
      email: EMAIL,
      name: 'Elijah Bonds',
      password: await bcrypt.hash(PASSWORD, 10),
      role: 'owner',
    },
  });

  await prisma.playerProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      // the founder's measured midline — his real PRQ comes from HIS scans
      strength: 72, speed: 70, endurance: 74, agility: 70,
      power: 76, flexibility: 72, recovery: 74, mental: 82,
      labCredits: 5000,
    },
  });

  // his look: Court General build, gold kit accent (the founder's card skin
  // below drives the kit accent through the identity pipeline)
  await prisma.avatarLook.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      face: {
        skinTone: '#6B4423',   // TUNE(elijah): stand-in until his System Scan
        faceShape: 'Oval', hairStyle: 'Fade', hairColor: '#141414',
        eyeShape: 'Almond', eyeColor: '#3B2F2F',
      },
      equipped: { headwear: null, tops: 'top_bonds', shorts: 'shorts_court', shoes: 'shoes_evo', accessory: 'acc_chain' },
    },
  });

  const card = await prisma.creatorCard.upsert({
    where: { slug: 'elijah-bonds' },
    update: { published: true },
    create: {
      ownerId: user.id,
      slug: 'elijah-bonds',
      displayName: 'Elijah Bonds',
      tagline: 'Your body already knows how to move.',
      mode: 'dunk',
      rarity: 'legendary',
      accent: '#FFD700',
      signatureMove: 'The Neuro-Mechanic',
      prq: 86, topScore: 0, wins: 0,
      published: true,
    },
  });

  // the card skins his kit: accent flows through resolveIdentity → hero spawn
  await prisma.avatarLook.update({
    where: { userId: user.id },
    data: { skinCardId: card.id },
  });

  console.log(`owner account ready: ${EMAIL}`);
  console.log(`card live at /card/${card.slug}`);
}

main()
  .catch((e) => { console.error('failed:', e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => prisma.$disconnect());
