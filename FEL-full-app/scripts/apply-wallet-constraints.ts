/**
 * scripts/apply-wallet-constraints.ts — apply prisma/wallet-constraints.sql (the non-negativity CHECKs Prisma cannot
 * model) after `prisma db push` / `migrate deploy`. Idempotent. Run: `npx tsx scripts/apply-wallet-constraints.ts`
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@/public/_prisma/client';
const db = new PrismaClient();

async function main(): Promise<void> {
  await db.$executeRawUnsafe(readFileSync('prisma/wallet-constraints.sql', 'utf8'));
  const rows = await db.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE conname LIKE 'wallet_%_nonneg' ORDER BY conname`);
  console.log('wallet constraints present:', rows.map((r) => r.conname).join(', '));
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
