// The Mac pipeline's contract (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e): scripts/avatar/mpfb/fit-outfit.py cannot run
// here (no Blender), so this pins what it writes against what the game reads — the mesh name kit.ts parses, the material
// prefix the Closet's colour lands on, the pack path KIT_PACKS uses, the slots it accepts — so the two cannot drift.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KIT_PACKS, KIT_SLOTS, kitOf } from '../../core/kit';
import { maskSlotOf } from '../../core/bodyMask';

const src = readFileSync('scripts/avatar/mpfb/fit-outfit.py', 'utf8');

describe('fit-outfit.py writes what the game reads', () => {
  it('names the mesh Kit_<slot>_<itemId>, which kit.ts and the body mask parse, for every kit slot', () => {
    expect(src).toContain("NAME = f'Kit_{SLOT}_{ITEM}'");
    for (const slot of KIT_SLOTS) {
      expect(src).toContain(`'${slot}'`);
      expect(kitOf(`Kit_${slot}_my_item-2`)).toEqual({ slot, itemId: 'my_item-2' });
      expect(maskSlotOf(`Kit_${slot}_my_item-2_pk7`)).toBe(slot);
    }
  });
  it('names the material <jersey|shorts|shoes>.<itemId> (the tint slots match by prefix)', () => {
    expect(src).toContain("MAT = {'tops': 'jersey', 'shorts': 'shorts', 'shoes': 'shoes'}[SLOT]");
    expect(src).toContain("m.name = f'{MAT}.{ITEM}'");
  });
  it('writes the pack where KIT_PACKS points the shipped ones, with the kit\'s own 22-bone armature and nothing else', () => {
    expect(src).toContain("os.path.join(APP, 'public', 'models', 'kits', f'{ITEM}.glb')");
    for (const url of Object.values(KIT_PACKS)) expect(url).toMatch(/^\/models\/kits\/[A-Za-z0-9_-]+\.glb$/);
    expect(src).toContain("fel-kit-{SEX}.glb");
    expect(src).toMatch(/use_selection=True, export_skins=True/);
    expect(src).toContain('len(rig.data.bones) != 22');
  });
  it('says plainly that it is untested', () => {
    expect(src).toMatch(/^# UNTESTED/m);
  });
});
