import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { ExchangeWidget } from '@/components/wallet/exchange-widget';
import { LedgerHistory } from '@/components/wallet/ledger-history';
import { WalletBalances } from '@/components/shop/wallet-balances';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { purchasesEnabledFromEnv, shardSaleCopy } from '@/lib/wallet/purchases';
import { allowlistPermits } from '@/lib/payments/allowlist';
import { DEFAULT_REWARD_RULES, REASON } from '@/lib/wallet/reward-rules';

export const dynamic = 'force-dynamic';

/**
 * /wallet — PLAT-P07 (2026-11-02): the shop front's shape. Three balance tiles (Lab Credits, Coins, Shards) with one line
 * each on what they are for, "Earn today" (today's drill, a friend's first week — the reward rules' own amounts, never a
 * typed number), then "Spend" (the Coin Store and the Shard Store, as before), then the exchange and the history. No
 * economy change (owner call §5.1).
 */
export default async function WalletPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/wallet'));
  // FEATURES-UX-SHOP: "Get Shards" led to a store that said COMING SOON — the button now carries the purchases truth itself.
  const shardCopy = shardSaleCopy(purchasesEnabledFromEnv() && allowlistPermits('shards'));
  const lc = (code: string) => `+${DEFAULT_REWARD_RULES[code]?.baseAmount ?? 0} LC`;
  return (
    <div className="min-h-screen bg-fel-bg">
      <main className={L.page}>
        <p className={L.eyebrow}>Wallet</p>
        <h1 className={`${L.title} mb-6`}>Your balances</h1>
        <WalletBalances
          earn={[
            { label: "Today's drill", amount: lc(REASON.DAILY_DRILL_COMPLETE), href: '/train/today-drill' },
            { label: 'Bring a friend through week one', amount: lc(REASON.REFERRAL_WEEK_ONE), href: '/profile/challenges' },
          ]}
          spend={[{ label: 'Coin Store', href: '/store' }, { label: shardCopy.walletShardButton, href: '/shop/shards' }]}
        />
      </main>
      <ExchangeWidget />
      <LedgerHistory />
    </div>
  );
}
