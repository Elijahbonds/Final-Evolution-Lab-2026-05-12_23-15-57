// The kit palette a body wears, from three sources (IMPROVE (2026-10-06), CREATOR-PLAN phase 1, research item 1).
//
//   1. derived  — each equipped garment's own accent (+ the equipped card's accent): the Closet's mapping, as before;
//   2. build    — the Athlete Creator's colour picks (AthleteBuild.palette), returned by /api/v1/hero-body as OVERRIDES
//                 only (a row left at its default is not an override; buildPalette.ts decides);
//   3. doc      — the CreatorDoc's colours (AvatarLook.face.creator.colours).
//
// Later wins, per slot. Before this, (2) was saved and shown in the Creator's preview and never reached a mode.
// Pure and client-safe: no schema imports.

import type { ColourSlot } from './doc';
import { sanitizeHex } from './sanitize';

export type KitPalette = { jersey: string; shorts: string; shoes: string; accent: string };
export type PaletteOverrides = Partial<Record<ColourSlot, string>>;

const SLOTS: readonly ColourSlot[] = ['jersey', 'shorts', 'shoes', 'accent'];

/** `base` with each valid hex in `layers` laid over it, in order. Invalid values are ignored, never applied. */
export function effectivePalette(base: KitPalette, ...layers: (PaletteOverrides | null | undefined)[]): KitPalette {
  const out = { ...base };
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    for (const k of SLOTS) { const c = sanitizeHex(layer[k]); if (c) out[k] = c; }
  }
  return out;
}
