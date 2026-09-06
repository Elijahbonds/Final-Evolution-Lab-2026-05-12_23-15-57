import { describe, expect, it } from 'vitest';
import { FALLBACK_KIT, SPORT_KIT_DEFAULTS, catalogueKitIds, sportKitDefault } from './sportKitDefaults';
import { KIT_PACKS } from './kit';
import { WEARABLES, wearablesForSlot } from '../../closet/wearable-catalog';
import { KIT_SLOTS } from './kit';

describe('sportKitDefaults (owner decision 2026-09-05: per-sport defaults)', () => {
  const ids = catalogueKitIds();

  it('draws every id in the table from the wearable catalogue, in the right slot', () => {
    const slotOf = new Map(WEARABLES.map((w) => [w.itemId, w.slot]));
    for (const [mode, kit] of Object.entries({ ...SPORT_KIT_DEFAULTS, __fallback: FALLBACK_KIT })) {
      for (const slot of KIT_SLOTS) {
        expect(ids.has(kit[slot]), `${mode}.${slot} = ${kit[slot]} is not in the catalogue`).toBe(true);
        expect(slotOf.get(kit[slot]), `${mode}.${slot} = ${kit[slot]} is a ${slotOf.get(kit[slot])}`).toBe(slot);
      }
    }
  });

  it('gives every registry mode a default (by its modeId and by its registry key) or the fallback', async () => {
    const { MODES } = await import('../modes/registry');
    for (const [key, def] of Object.entries(MODES)) {
      for (const id of [key, def.modeId]) {
        const kit = sportKitDefault(id);
        for (const slot of KIT_SLOTS) expect(ids.has(kit[slot]), `${id}.${slot}`).toBe(true);
      }
    }
    expect(sportKitDefault('no_such_mode')).toBe(FALLBACK_KIT);
    expect(sportKitDefault(undefined)).toBe(FALLBACK_KIT);
    expect(sportKitDefault(null)).toBe(FALLBACK_KIT);
  });

  it('differs per sport family: combat, board and court are not one outfit', () => {
    const karate = sportKitDefault('karate'), skate = sportKitDefault('skateboard'), tennis = sportKitDefault('tennis');
    expect(karate).not.toEqual(skate);
    expect(karate).not.toEqual(tennis);
    expect(skate).not.toEqual(tennis);
    // the registry key and the harness modeId land on the same kit
    expect(sportKitDefault('karate_vs')).toBe(sportKitDefault('karate-vs'));
    expect(sportKitDefault('snowboard_slalom')).toBe(sportKitDefault('snowboard'));
    expect(sportKitDefault('derby')).toBe(sportKitDefault('baseball'));
    expect(sportKitDefault('penalty')).toBe(sportKitDefault('soccer'));
  });

  it('the catalogue carries the garments dress-kit fits (two per slot) plus the kit-pack items', () => {
    // kit packs (kit.ts KIT_PACKS): garments skinned to the rig outside the body file, one glb each
    for (const slot of KIT_SLOTS) {
      const packed = wearablesForSlot(slot).filter((w) => w.itemId in KIT_PACKS).length;
      expect(wearablesForSlot(slot).length - packed).toBe(2);
    }
    for (const id of Object.keys(KIT_PACKS)) expect(WEARABLES.some((w) => w.itemId === id), `${id} is a pack without a catalogue entry`).toBe(true);
  });
});
