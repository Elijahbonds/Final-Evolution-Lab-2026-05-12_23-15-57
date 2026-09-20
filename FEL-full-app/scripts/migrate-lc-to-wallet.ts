/**
 * scripts/migrate-lc-to-wallet.ts — fold lab credits into the wallet (owner decision 2026-09-04).
 *
 * For every PlayerProfile: ensure a Wallet exists and carry PlayerProfile.labCredits into Wallet.lc with ONE
 * WalletLedgerEntry (reason LC_MIGRATION, idempotency `lc-migrate:<userId>:<amount>`). Idempotent: a profile whose
 * wallet already holds the same LC is skipped; re-running never double-carries. Prints the LC total before and after —
 * they must match. Run: `npx tsx scripts/migrate-lc-to-wallet.ts` (add `--dry` to report only).
 */
import 'dotenv/config';
import { PrismaClient } from '@/public/_prisma/client';
const db = new PrismaClient();

/** Carry every profile's labCredits into its wallet. Idempotent. Returns the totals; callers may pass their own client. */
export async function migrateLcToWallet(client: PrismaClient = db, dry = false): Promise<{ before: number; after: number }> {
  const profiles = await client.playerProfile.findMany({ select: { userId: true, labCredits: true } });
  const before = profiles.reduce((s, p) => s + p.labCredits, 0);
  let carried = 0, skipped = 0, created = 0;
  for (const p of profiles) {
    let w = await client.wallet.findUnique({ where: { playerId: p.userId } });
    if (!w) { if (!dry) w = await client.wallet.create({ data: { playerId: p.userId } }); created++; }
    const have = Number(w?.lc ?? 0);
    if (have === p.labCredits) { skipped++; continue; }
    const delta = p.labCredits - have;
    if (dry) { carried++; continue; }
    const key = `lc-migrate:${p.userId}:${p.labCredits}`;
    const prior = await client.walletLedgerEntry.findUnique({ where: { idempotencyKey: key } });
    if (prior) { skipped++; continue; }
    await client.$transaction(async (tx) => {
      const after = await tx.wallet.update({ where: { playerId: p.userId }, data: { lc: { increment: BigInt(delta) }, version: { increment: BigInt(1) } }, select: { id: true, lc: true } });
      await tx.walletLedgerEntry.create({ data: { walletId: after.id, currency: 'lc', delta: BigInt(delta), balanceAfter: after.lc, reasonCode: 'LC_MIGRATION', source: 'admin_adjust', idempotencyKey: key, metadata: { from: 'PlayerProfile.labCredits' } } });
    });
    carried++;
  }
  const wallets = await client.wallet.aggregate({ _sum: { lc: true } });
  const after = Number(wallets._sum.lc ?? 0);
  console.log(`${dry ? 'DRY ' : ''}lc-migrate: ${profiles.length} profiles · LC before (profiles) ${before} · carried ${carried} · skipped ${skipped} · wallets created ${created} · Wallet.lc total after ${after} → ${after === before ? 'SUMS MATCH' : 'MISMATCH'}`);
  return { before, after };
}

if (process.argv[1]?.endsWith('migrate-lc-to-wallet.ts')) migrateLcToWallet(db, process.argv.includes('--dry')).then(({ before, after }) => { if (before !== after) process.exitCode = 1; }).catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
