import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CELL_ASSIST_SHARDS, CELL_ASSIST_SKU, MUSIC_PURCHASES, MUSIC_SKU_PREFIX,
  freeKits, kitForSku, kitSkuId, musicPurchase,
} from './purchases';
import { KIT_META, type KitId } from './SynthKit';
import { CATALOG, getSku } from '../../wallet/catalog';

describe('what the room sells', () => {
  it('lists every kit that costs something', () => {
    const paid = (Object.keys(KIT_META) as KitId[]).filter((k) => KIT_META[k].unlockShards > 0);
    expect(paid.length).toBeGreaterThan(0);
    for (const k of paid) expect(musicPurchase(kitSkuId(k)), k).not.toBeNull();
  });

  it('DOES NOT SELL A FREE KIT', () => {
    // A zero-price SKU means a spend call that takes a lock and writes a ledger row for nothing.
    for (const k of freeKits()) expect(musicPurchase(kitSkuId(k)), k).toBeNull();
    expect(freeKits()).toContain('street');
  });

  it('sells the Cell assist', () => {
    expect(musicPurchase(CELL_ASSIST_SKU)?.shards).toBe(CELL_ASSIST_SHARDS);
  });

  it('round-trips a kit through its SKU and refuses anything else', () => {
    for (const k of Object.keys(KIT_META) as KitId[]) expect(kitForSku(kitSkuId(k))).toBe(k);
    expect(kitForSku('music_kit_nonsense')).toBeNull();
    expect(kitForSku('boost_card_neural-max')).toBeNull();
    expect(kitForSku(CELL_ASSIST_SKU)).toBeNull();
  });
});

describe('the price shown and the price charged', () => {
  it('agree, for every single item', () => {
    // The whole reason this file exists. The room prints KIT_META[k].unlockShards next to the button; the
    // server charges the catalogue. If those two ever diverge the room lies about the price.
    for (const p of MUSIC_PURCHASES) {
      const sku = getSku(p.id);
      expect(sku, `${p.id} is not in the wallet catalogue`).not.toBeNull();
      expect(sku!.unitPrice, p.id).toBe(p.shards);
      expect(sku!.currency, p.id).toBe('shards');
    }
  });

  it('matches what StudioMode puts on screen for the Cell assist', () => {
    const src = readFileSync(join(__dirname, 'StudioMode.tsx'), 'utf8');
    const m = /const CELL_ASSIST_COST = (\d+)/.exec(src);
    expect(m, 'CELL_ASSIST_COST vanished from StudioMode').not.toBeNull();
    expect(Number(m![1])).toBe(CELL_ASSIST_SHARDS);
  });

  it('registers nothing under our prefix that is not ours', () => {
    const ours = Object.keys(CATALOG).filter((k) => k.startsWith(MUSIC_SKU_PREFIX));
    expect(ours.sort()).toEqual(MUSIC_PURCHASES.map((p) => p.id).sort());
  });

  it('charges shards, never coins — these are earned unlocks', () => {
    for (const p of MUSIC_PURCHASES) expect(getSku(p.id)!.currency).not.toBe('coins');
  });

  it('treats a kit as permanent and the assist as consumable', () => {
    for (const p of MUSIC_PURCHASES) {
      const expected = p.id === CELL_ASSIST_SKU;
      expect(getSku(p.id)!.consumable, p.id).toBe(expected);
    }
  });
});

describe('the seam that was never wired', () => {
  it('is wired now — the music route is what the loader calls', () => {
    const loader = readFileSync(join(__dirname, '..', '..', '..', 'app', 'play', 'music', '_components', 'loader.tsx'), 'utf8');
    expect(loader).toMatch(/spendShards/);
    expect(loader).toMatch(/\/api\/music\/unlock/);
  });

  it('refuses a spend it does not recognise instead of waving it through', () => {
    // The old fallback ALLOWED anything when the prop was absent. The replacement must fail closed.
    const loader = readFileSync(join(__dirname, '..', '..', '..', 'app', 'play', 'music', '_components', 'loader.tsx'), 'utf8');
    expect(loader).toMatch(/if \(!sku\) return false/);
  });
});
