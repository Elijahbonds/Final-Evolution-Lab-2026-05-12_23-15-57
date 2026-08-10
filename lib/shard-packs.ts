/**
 * lib/shard-packs.ts — the real-money SHARD PACK SKUs (M25).
 *
 * Single source of truth for the shard-store UI and server checkout creation.
 * Prices are in USD cents (Stripe's smallest unit). Shard amounts are
 * SERVER-OWNED: a client-supplied price or amount is always ignored. The
 * webhook mints exactly `shards + bonus` for the purchased pack.
 *
 * M25 policy note: prior to M25 shards were earned-only and real money minted
 * coins exclusively. M25 introduces shard packs as the ONE real-money product
 * family — everything premium in-app (plans, scans, class passes, seminars,
 * 1-on-1s) is priced in shards and bought through the server wallet.
 */

export interface ShardPack {
  id: string;
  name: string;
  shards: number; // base shards
  bonus: number;  // extra shards over the base rate — the value ladder
  usdCents: number;
  badge?: string;
}

// Base rate ~100 shards/$1; bonuses reward bigger packs.  // TUNE(elijah)
export const SHARD_PACKS: ShardPack[] = [
  { id: 'pack_starter', name: 'Starter Pack', shards: 500,  bonus: 0,    usdCents: 499 },
  { id: 'pack_grinder', name: 'Grinder Pack', shards: 1200, bonus: 100,  usdCents: 999,  badge: 'POPULAR' },
  { id: 'pack_baller',  name: 'Baller Pack',  shards: 2600, bonus: 400,  usdCents: 1999, badge: 'BEST VALUE' },
  { id: 'pack_legend',  name: 'Legend Pack',  shards: 7000, bonus: 1500, usdCents: 4999 },
];

export function getShardPack(id: string | null | undefined): ShardPack | null {
  if (!id) return null;
  return SHARD_PACKS.find((p) => p.id === id) ?? null;
}

export function shardPackTotal(p: ShardPack): number {
  return p.shards + p.bonus;
}

export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
