/**
 * FEL — Duel Weapon Skins (COSMETIC ONLY)
 * ───────────────────────────────────────
 * PURE module: NO `three`, NO React, NO DOM.
 *
 * A weapon skin re-dresses a fighter's blade — colour, trail, glow, silhouette
 * — and NOTHING ELSE. There are deliberately NO stat fields on a skin: no
 * damage, reach, speed, or cooldown. All combat math lives in ./duel-core and
 * is identical for every character, so equipping the "Aurora Keyblade" gives a
 * player EXACTLY the same numbers as the default blade. This is the structural
 * guarantee against pay-to-win — a skin literally cannot carry an advantage
 * because there is no field for one to live in.
 *
 * The stat-free contract is enforced by scripts/combat-tests.ts, which asserts
 * every skin's keys are a subset of COSMETIC_KEYS and that no value is numeric.
 */

export type WeaponMesh = 'blade' | 'keyblade' | 'staff' | 'nunchaku';

export interface WeaponSkin {
  id: string;
  /** Character this skin is the signature look for. */
  characterId: string;
  label: string;
  meshKind: WeaponMesh;
  /** Hex colour of the blade/prop body. */
  bladeColor: string;
  /** Hex colour of the swing trail ribbon. */
  trailColor: string;
  /** Hex colour of the emissive glow / rim. */
  glowColor: string;
}

/**
 * The ONLY keys a skin may carry. combat-tests.ts asserts every skin object's
 * keys ⊆ this set — if anyone ever adds a `damage`/`reach`/etc. field the test
 * fails, preserving the equal-footing guarantee.
 */
export const COSMETIC_KEYS: readonly (keyof WeaponSkin)[] = [
  'id',
  'characterId',
  'label',
  'meshKind',
  'bladeColor',
  'trailColor',
  'glowColor',
];

/** Keys whose values are colour/text strings (never numeric). */
export const DEFAULT_WEAPON: WeaponSkin = {
  id: 'standard-blade',
  characterId: '*',
  label: 'Training Blade',
  meshKind: 'blade',
  bladeColor: '#C8D2DC',
  trailColor: '#9FB3C8',
  glowColor: '#00E5FF',
};

export const WEAPON_SKINS: Record<string, WeaponSkin> = {
  elijah: {
    id: 'aurora-keyblade',
    characterId: 'elijah',
    label: 'Aurora Keyblade',
    meshKind: 'keyblade',
    bladeColor: '#00E5FF',
    trailColor: '#7CF9FF',
    glowColor: '#00FF9D',
  },
  rival: {
    id: 'crimson-edge',
    characterId: 'rival',
    label: 'Crimson Edge',
    meshKind: 'blade',
    bladeColor: '#FF3366',
    trailColor: '#FF7A99',
    glowColor: '#FF3366',
  },
  sensei: {
    id: 'oak-bo-staff',
    characterId: 'sensei',
    label: 'Oak Bo Staff',
    meshKind: 'staff',
    bladeColor: '#C89B4A',
    trailColor: '#FFD700',
    glowColor: '#FFD700',
  },
};

/** Resolve the signature skin for a character id, falling back to the default. */
export function weaponForCharacter(characterId: string | null | undefined): WeaponSkin {
  if (!characterId) return DEFAULT_WEAPON;
  return WEAPON_SKINS[characterId] ?? DEFAULT_WEAPON;
}
