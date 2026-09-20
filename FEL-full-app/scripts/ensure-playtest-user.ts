#!/usr/bin/env -S npx tsx
// Ensure a playtest account exists, so Phase 9 can run the SHIPPING route.
//
// /play/* pages call getServerSession and redirect to /login without one, so
// every playtest of 1v1 and 3v3 has had to go through /dev/mode/[key] instead.
// That is a different host component from the one that ships, which is exactly
// the gap the protocol's Phase 9 exists to close: "on a real device, through the
// shipping route — not a dev harness". Dunk was the only one of the three
// genuinely playtested, because /try is public.
//
// This creates ONE ordinary player account. It does not touch auth, does not
// add a bypass, and does not weaken the gate — the playtest logs in through the
// real /login form with a real password and gets a real session.
//
//   npx tsx scripts/ensure-playtest-user.ts
//
// Override the password with PLAYTEST_PASSWORD. Refuses to run in production.

import { readFileSync, existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@/lib/generated/prisma';
import { seedRewardRules } from './seed-reward-rules';
import { migrateLcToWallet } from './migrate-lc-to-wallet';   // LC lives in the wallet (2026-09-04)   // PACK #5: the playtest path seeds the reward rules so earn never no-ops

// Next.js loads .env for the app; a bare tsx script does not, and Prisma then
// fails with "Environment variable not found: DATABASE_URL".
for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    if (process.env[key]) continue;                  // real env wins
    process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

if (process.env.NODE_ENV === 'production') {
  console.error('refusing to create a playtest account in production');
  process.exit(1);
}

export const PLAYTEST_EMAIL = process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local';
const PASSWORD = process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const rules = await seedRewardRules(prisma); console.log(`reward rules present: ${rules}`);
  const existing = await prisma.user.findUnique({
    where: { email: PLAYTEST_EMAIL },
    include: { profile: { select: { id: true } } },
  });

  if (existing) {
    // Re-assert the password so a rotated env value still logs in.
    await prisma.user.update({
      where: { id: existing.id },
      data: { password: await bcrypt.hash(PASSWORD, 10) },
    });
    if (!existing.profile) await createProfile(existing.id);
    else await migrateLcToWallet(prisma);
    console.log(`playtest user ready (existing): ${PLAYTEST_EMAIL}`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: PLAYTEST_EMAIL,
      name: 'Playtest',
      password: await bcrypt.hash(PASSWORD, 10),
    },
  });
  await createProfile(user.id);
  console.log(`playtest user created: ${PLAYTEST_EMAIL}`);
}

/** Mid-range attributes — a profile the modes can read without special-casing. */
async function createProfile(userId: string) {
  const profile = await prisma.playerProfile.create({
    data: {
      userId,
      strength: 60, speed: 60, endurance: 60, agility: 60,
      power: 60, flexibility: 60, recovery: 60, mental: 60,
    },
  });
  await migrateLcToWallet(prisma);
  return profile;
}

/**
 * The profile's labCredits default (500) lands at creation WITHOUT a ledger
 * row (the signup route posts its own welcome grant; this script doesn't go
 * through signup). /api/wallet sums the CreditLedger while the header chip
 * reads the profile — so a fresh playtest account shows 500 in the header
 * and 0 in the shop. Post one deduped reconciliation entry so the two books
 * agree (measured on the cards page: header 555 LC vs storefront 55 LC).
 */
async function reconcileLedger(userId: string) {
  const [profile, agg] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { userId }, select: { labCredits: true } }),
    prisma.creditLedger.aggregate({ where: { userId }, _sum: { amount: true } }),
  ]);
  const ledger = agg._sum.amount ?? 0;
  const balance = profile?.labCredits ?? 0;
  const diff = balance - ledger;
  if (diff === 0) return;
  const dedupeKey = `seed-reconcile:${userId}:${diff}`;
  const existing = await prisma.creditLedger.findFirst({ where: { userId, dedupeKey } });
  if (existing) return;
  await prisma.creditLedger.create({
    data: {
      userId,
      amount: diff,
      reason: 'Playtest seed reconciliation',
      dedupeKey,
      balanceAfter: balance,
    },
  });
  console.log(`ledger reconciled: ${ledger} → ${balance} (${diff > 0 ? '+' : ''}${diff})`);
}

main()
  .catch((e) => { console.error('failed:', e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => prisma.$disconnect());
