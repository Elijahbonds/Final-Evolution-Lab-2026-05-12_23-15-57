// purchases — what the Music Room sells, and for how much.
//
// THE ROOM WAS GIVING IT ALL AWAY. StudioMode takes a `spendShards` prop and falls back to allowing the spend
// when it is absent — with a console line saying so — and nothing in app/ or components/ has ever passed it. So
// every kit (NEON 200, DUST 400) and every Cell assist (50) has been free since the day it shipped. The seam was
// marked honestly in the code and then nobody closed it.
//
// This is the catalogue side of closing it: one table, read by the wallet SKUs and by the route, so the price a
// player is shown and the price the server charges cannot drift apart. The amounts are the ones the room already
// displayed.

import { KIT_META, type KitId } from './SynthKit';

export type MusicPurchase = { id: string; label: string; shards: number };

/** What the Cell assist costs. Mirrors CELL_ASSIST_COST in StudioMode. */
export const CELL_ASSIST_SHARDS = 50;

export const MUSIC_SKU_PREFIX = 'music_';

export function kitSkuId(kit: KitId): string { return `${MUSIC_SKU_PREFIX}kit_${kit}`; }
export const CELL_ASSIST_SKU = `${MUSIC_SKU_PREFIX}cell_assist`;

/**
 * Everything the room charges for. A free kit is NOT listed — a zero-price SKU would mean a spend call that
 * takes a lock and writes a ledger row for nothing.
 */
export const MUSIC_PURCHASES: MusicPurchase[] = [
  ...(Object.keys(KIT_META) as KitId[])
    .filter((k) => KIT_META[k].unlockShards > 0)
    .map((k) => ({ id: kitSkuId(k), label: `${KIT_META[k].label} kit`, shards: KIT_META[k].unlockShards })),
  { id: CELL_ASSIST_SKU, label: 'Cell foundation', shards: CELL_ASSIST_SHARDS },
];

export function musicPurchase(id: string): MusicPurchase | null {
  return MUSIC_PURCHASES.find((p) => p.id === id) ?? null;
}

/** The kit a SKU unlocks, or null when the SKU is not one of ours. */
export function kitForSku(skuId: string): KitId | null {
  const k = skuId.startsWith(`${MUSIC_SKU_PREFIX}kit_`) ? skuId.slice(`${MUSIC_SKU_PREFIX}kit_`.length) : '';
  return k in KIT_META ? (k as KitId) : null;
}

/** Kits that cost nothing are owned from the start; charging for them would be a lie either way. */
export function freeKits(): KitId[] {
  return (Object.keys(KIT_META) as KitId[]).filter((k) => KIT_META[k].unlockShards === 0);
}
