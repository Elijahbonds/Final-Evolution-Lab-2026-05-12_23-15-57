// _lc-inventory — before folding lab credits into the wallet: how many profiles, the LC total, how many wallets exist.
import { PrismaClient } from '@/lib/generated/prisma';
const db = new PrismaClient();
const profiles = await db.playerProfile.count(); const lc = await db.playerProfile.aggregate({ _sum: { labCredits: true }, _min: { labCredits: true }, _max: { labCredits: true } });
const wallets = await db.wallet.count(); const noWallet = await db.playerProfile.count({ where: { user: { wallet: null } } }).catch(() => -1);
const credit = await db.creditLedger.count(); const posted = await db.ledgerPosting.count();
console.log(`profiles ${profiles} · LC sum ${lc._sum.labCredits} min ${lc._min.labCredits} max ${lc._max.labCredits} · wallets ${wallets} · profiles without wallet ${noWallet} · creditLedger rows ${credit} · ledger postings ${posted}`);
await db.$disconnect();
