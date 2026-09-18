// fits — a coordinated OUTFIT, not three unrelated tints (appearance pass, 2026-09-16).
//
// Owner: "put the models in more stylish outfits."
//
// The wardrobe cannot grow from here — two tops, one real short, two shoes, and new garments need the Blender
// pipeline (docs/BRIEF-WARDROBE.md). What CAN change is how they are coloured, and that turns out to be most of it:
// until now a non-player body got ONE tint, sprayed at every garment slot that matched, so a character was a person
// dressed head to toe in a single flat colour. Nobody dresses like that. What makes an outfit look deliberate is that
// the pieces were chosen together — a jersey, a short that answers it, shoes that pick up one of the two, and an
// accent that ties the accessories in.
//
// So: named FITS. Each one is a real colourway with a jersey, a short, shoes and an accent, dealt deterministically
// so a rival wears the same fit every night and a re-spawned NPC comes back in what it had on.
//
// THE VALUES ARE DARKER THAN THEY LOOK. The scene carries a lot of light — that is a separate finding (the venue used
// to stack a second rig on the mode's own, NexusVenue.keepModeLights) — and a mid-tone albedo under a strong key
// reads a full step lighter than its hex. These are picked to land where they are written, not where they are typed.
import { Color3 } from '@babylonjs/core';
import { SLOT_KEYS, tintGarmentSlot } from './playerIdentity';
import type { SpawnedCharacter } from './CharacterLibrary';
import { seedOf } from './accessories';

export interface Fit {
  name: string;
  jersey: string;
  shorts: string;
  shoes: string;
  /** What the accessories are dyed with — the piece that ties the fit together. */
  accent: string;
}

/**
 * The fits. Each is a colourway somebody would actually wear: two colours and a neutral, never three of a kind.
 *
 * The rule behind them, so new ones stay coherent: ONE loud piece, ONE quiet piece, and shoes that pick up either the
 * loud colour or the neutral — never a third opinion.
 */
export const FITS: readonly Fit[] = [
  { name: 'COURT PURPLE', jersey: '#6A3FA0', shorts: '#221A33', shoes: '#F2EEE6', accent: '#D9C25A' },
  { name: 'SUNSET', jersey: '#E2603A', shorts: '#2B2320', shoes: '#F2EEE6', accent: '#F0A84B' },
  { name: 'MIDNIGHT', jersey: '#1B2A4A', shorts: '#12182A', shoes: '#C8CDD6', accent: '#4FA3C7' },
  { name: 'CHALK', jersey: '#E8E4DA', shorts: '#3A3A38', shoes: '#2A2A28', accent: '#D24B3E' },
  { name: 'PINE', jersey: '#2C6E55', shorts: '#1C2622', shoes: '#EDE8DC', accent: '#E0B441' },
  { name: 'CLAY', jersey: '#B4563C', shorts: '#E8E1D3', shoes: '#3A2E28', accent: '#2C6E55' },
  { name: 'STEEL', jersey: '#5A6470', shorts: '#23282E', shoes: '#E6E2D8', accent: '#E2603A' },
  { name: 'GOLD RUSH', jersey: '#C9972E', shorts: '#221F1A', shoes: '#F2EEE6', accent: '#6A3FA0' },
];

/** The fit this character wears — same key, same fit, every time. */
export function fitFor(key: string | number): Fit {
  return FITS[Math.floor(seedOf(`fit:${key}`) * FITS.length) % FITS.length];
}

/** The named rivals dress consistently, and their fit is part of who they are. */
export const RIVAL_FITS: Readonly<Record<string, string>> = {
  SILK: 'COURT PURPLE', DOC: 'GOLD RUSH', MAC: 'SUNSET', REIGN: 'PINE', PRIME: 'MIDNIGHT',
};

export function fitForName(name: string): Fit {
  const want = RIVAL_FITS[name.toUpperCase()];
  return (want && FITS.find((f) => f.name === want)) || fitFor(name);
}

/** Dress a spawned body in a fit. Returns the accent, so the accessories can be tied to it. */
export function wearFit(spawn: Pick<SpawnedCharacter, 'meshes'>, fit: Fit): Color3 {
  tintGarmentSlot(spawn, SLOT_KEYS.jersey, fit.jersey);
  tintGarmentSlot(spawn, SLOT_KEYS.shorts, fit.shorts);
  tintGarmentSlot(spawn, SLOT_KEYS.shoes, fit.shoes);
  return Color3.FromHexString(fit.accent);
}
