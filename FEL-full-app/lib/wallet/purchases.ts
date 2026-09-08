/**
 * lib/wallet/purchases.ts — ONE truth for "can real money be spent here?".
 *
 * FEATURES-UX-SHOP (2026-09-08): /store said "shard packs are sold separately" while /shop/shards showed COMING SOON
 * with every Buy disabled — two pages reading two different truths. Every surface that mentions buying coins or
 * shards now derives its copy from the same flag (Stripe configured or not) through the helpers below, so the copy
 * can only flip when the flag flips. Pure: no React, no network — unit-tested in purchases.test.ts.
 */

/** Real-money checkout exists only when Stripe is configured. The server reads process.env; the client asks /api/v1/wallet/config. */
export function purchasesEnabledFromEnv(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/** `null` = the client has not heard from the server yet — copy must stay neutral, never promise a sale or deny one. */
export type PurchasesState = boolean | null;

export interface ShardSaleCopy {
  /** Coin store subline about shards. */
  coinStoreShards: string;
  /** Shard store body line under the heading. */
  shardStoreIntro: string;
  /** The wallet page's button to the shard store. */
  walletShardButton: string;
  /** The header chip's tooltip. */
  chipShardsTitle: string;
  /** Badge next to store headings (empty when purchases are live). */
  badge: string;
  /** Shard store Buy button label (when not busy). */
  shardBuyLabel: string;
}

const SHARD_ROLE = 'Shards are the premium currency for plans, scans, class passes, seminars & 1-on-1s.';

export function shardSaleCopy(enabled: PurchasesState): ShardSaleCopy {
  if (enabled === true) {
    return {
      coinStoreShards: 'Top up coins, spend on unlocks. Shard packs are sold in the Shard Store.',
      shardStoreIntro: `${SHARD_ROLE} Buy a pack below, or earn shards in play.`,
      walletShardButton: 'Get Shards',
      chipShardsTitle: 'Shards — premium currency, earned in play or bought as packs in the Shard Store',
      badge: '',
      shardBuyLabel: 'Buy',
    };
  }
  if (enabled === false) {
    return {
      coinStoreShards: 'Top up coins, spend on unlocks. Shard packs are not on sale yet — shards are earned in play (see the Shard Store).',
      shardStoreIntro: `${SHARD_ROLE} Shard packs are not on sale yet: for now shards are earned in play and by converting coins in your wallet.`,
      walletShardButton: 'Shard Store · coming soon',
      chipShardsTitle: 'Shards — premium currency, earned in play (shard packs coming soon)',
      badge: 'Coming soon',
      shardBuyLabel: 'Coming soon',
    };
  }
  return {
    coinStoreShards: 'Top up coins, spend on unlocks. Shards live in the Shard Store.',
    shardStoreIntro: SHARD_ROLE,
    walletShardButton: 'Shard Store',
    chipShardsTitle: 'Shards — premium currency, earned in play',
    badge: '',
    shardBuyLabel: 'Buy',
  };
}
