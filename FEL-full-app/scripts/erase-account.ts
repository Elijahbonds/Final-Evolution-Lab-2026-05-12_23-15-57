/**
 * scripts/erase-account.ts — DATA-RIGHTS-SWEEP (2026-10-25): the operator's account erase.
 *
 * Privacy §4 (lib/policies.ts): "Until an in-app delete option exists, you can have your account and personal data
 * deleted by emailing ... from the email address on your account." Until this script, that request had no tool: a hand
 * `DELETE FROM "User"` either fails (Order, Subscription, Booking ... are Restrict) or cascades through Wallet into the
 * wallet ledger, which no erase in this repo has ever deleted. This runs lib/data-rights/accountDelete.ts
 * eraseAccountNow — the SAME function the in-app "Delete my account" calls (ACCOUNT-DELETE, 2026-10-25) — which follows
 * lib/data-rights/registry.ts table by table and records the event once as a CreditLedger row (amount 0, counts only),
 * all in ONE transaction with the account row locked. Running it again on an erased account sweeps again and records
 * nothing new.
 *
 *   npx tsx scripts/erase-account.ts --user <id> --email <the account's email>            # dry run: counts only
 *   npx tsx scripts/erase-account.ts --user <id> --email <the account's email> --commit   # IRREVERSIBLE
 *
 * A dry run counts what each statement's condition matches: a row that a cascade would reach first (a group's members
 * when its owner is erased) is counted under both, so the commit's totals can be a little lower.
 *
 * The email must match the account (case-insensitive), so a mistyped id cannot erase someone else. Output is counts
 * per table and action, and the tables not created yet; never a row. Against production this is destructive database
 * work: the OWNER runs it (CLAUDE.md). Nothing in CI or the app calls it.
 */
import 'dotenv/config';
import { PrismaClient } from '@/public/_prisma/client';
import { erasureSummary, type AccountErasure } from '@/lib/data-rights/rights';
import { eraseAccountNow, previewAccountErase, txRunner } from '@/lib/data-rights/accountDelete';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}

function print(e: AccountErasure): void {
  const rows = e.lines.filter((l) => l.rows > 0).map((l) => `  ${l.action.padEnd(9)} ${l.table}.${l.col}: ${l.rows}`);
  console.log(rows.length ? rows.join('\n') : '  (no rows)');
  if (e.notYetCreated.length) console.log(`not created yet (skipped): ${e.notYetCreated.join(', ')}`);
  console.log(erasureSummary(e));
}

async function main(): Promise<void> {
  const userId = arg('user');
  const email = arg('email');
  const commit = process.argv.includes('--commit');
  if (!userId || !email) throw new Error('usage: --user <id> --email <account email> [--commit]');
  const db = new PrismaClient();
  try {
    const found = await db.$queryRawUnsafe<{ email: string }[]>(`SELECT "email" FROM "User" WHERE "id" = $1`, userId);
    if (!found.length) throw new Error('no such account');
    if (found[0].email.toLowerCase() !== email.toLowerCase()) throw new Error('the email does not match that account; nothing done');
    if (!commit) {
      console.log('DRY RUN: nothing is changed. Add --commit to erase.');
      print(await previewAccountErase(db, userId));
      return;
    }
    // the same erase the in-app "Delete my account" runs (lib/data-rights/accountDelete.ts)
    const done = await eraseAccountNow(txRunner(db), userId, 'operator');
    console.log(done.alreadyErased ? 'ALREADY ERASED (swept again; no second event).' : 'ERASED.');
    print(done.erasure);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
