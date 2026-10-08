// AthleteBuild.palette → the overrides a mode should wear (IMPROVE (2026-10-06), research item 1). Server side
// (/api/v1/hero-body); pure.
//
// WHY "OVERRIDES" AND NOT THE WHOLE PALETTE. Every Finalize writes all four colour rows, untouched ones at their
// default (the accent of the Closet's DEFAULT top/shorts/shoes). Sending those as colours would freeze a player's jersey
// at the default top's colour forever: equip a different top in the Closet and the jersey would not follow. So a row
// counts only when it differs from its default; an untouched row leaves the Closet's per-garment derivation in charge.
// assumption: a player who deliberately picks exactly the default colour gets the derivation, which is the same colour
// while the default top is worn.

import { GEAR } from '../schema/gear';
import { sanitizeHex } from './sanitize';
import type { PaletteOverrides } from './palette';

const ROW_TO_SLOT = { paletteJersey: 'jersey', paletteShorts: 'shorts', paletteShoes: 'shoes', paletteAccent: 'accent' } as const;

export function paletteOverrides(raw: unknown): PaletteOverrides {
  const out: PaletteOverrides = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [rowId, slot] of Object.entries(ROW_TO_SLOT)) {
    const v = sanitizeHex((raw as Record<string, unknown>)[rowId]);
    if (!v) continue;
    const def = sanitizeHex(GEAR.rows.find((r) => r.id === rowId)?.defaultOption);
    if (v !== def) out[slot] = v;
  }
  return out;
}
