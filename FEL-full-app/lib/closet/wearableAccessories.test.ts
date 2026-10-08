// Equipped wearables → accessories (IMPROVE (2026-10-06), research item 2): what the player bought is what renders.
import { describe, expect, it } from 'vitest';
import { WEARABLE_ACCESSORY, accessoriesForEquipped, accessoryForWearable } from './wearableAccessories';
import { WEARABLES, defaultEquipped } from './wearable-catalog';
import { ACCESSORY_IDS, RETIRED_ACCESSORIES } from '../babylon/core/accessories';
import { ALL_SEASON_WEARABLES } from '../season/golden-hour';

describe('accessoryForWearable', () => {
  it('maps the store headband, chain and sleeve to their code-built accessories', () => {
    expect(accessoryForWearable('band_flow')).toBe('headband');
    expect(accessoryForWearable('acc_chain')).toBe('chain');
    expect(accessoryForWearable('acc_sleeve')).toBe('armsleeve');
  });
  it('the visor has no mesh yet, garments are never accessories, unknown ids are nothing', () => {
    expect(accessoryForWearable('cap_nexus')).toBeNull();
    for (const w of WEARABLES.filter((x) => x.slot === 'tops' || x.slot === 'shorts' || x.slot === 'shoes')) expect(accessoryForWearable(w.itemId)).toBeNull();
    expect(accessoryForWearable('not_an_item')).toBeNull();
    expect(accessoryForWearable(null)).toBeNull();
  });
  it('season items map by what they are', () => {
    const byName = (n: string) => ALL_SEASON_WEARABLES.find((w) => w.name === n)!.itemId;
    expect(accessoryForWearable(byName('Coral Headband'))).toBe('headband');
    expect(accessoryForWearable(byName('Dusk Haze Sweatband'))).toBe('headband');
    expect(accessoryForWearable(byName('Tangerine Wristband'))).toBe('wristbands');
    expect(accessoryForWearable(byName('Twilight Ripple Gloves'))).toBeNull();
  });
  it('every mapped id is a real, dealable accessory (never a retired one) and every store id exists', () => {
    for (const [item, acc] of Object.entries(WEARABLE_ACCESSORY)) {
      expect(WEARABLES.some((w) => w.itemId === item), item).toBe(true);
      expect(ACCESSORY_IDS).toContain(acc);
      expect(RETIRED_ACCESSORIES).not.toContain(acc);
    }
    for (const w of ALL_SEASON_WEARABLES) {
      const a = accessoryForWearable(w.itemId);
      if (a) expect(RETIRED_ACCESSORIES).not.toContain(a);
    }
  });
});

describe('accessoriesForEquipped', () => {
  it('reads the headwear and accessory slots, deduped, and nothing for the default look', () => {
    expect(accessoriesForEquipped(defaultEquipped())).toEqual([]);
    expect(accessoriesForEquipped({ ...defaultEquipped(), headwear: 'band_flow', accessory: 'acc_chain' })).toEqual(['headband', 'chain']);
    expect(accessoriesForEquipped({ headwear: 'cap_nexus', accessory: 'acc_sleeve' })).toEqual(['armsleeve']);
    expect(accessoriesForEquipped(null)).toEqual([]);
  });
});
