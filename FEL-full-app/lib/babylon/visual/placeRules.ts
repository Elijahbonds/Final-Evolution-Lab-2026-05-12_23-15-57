// placeRules — the pure half of the PLACE layer (SHARED-PLACE-FLOOR, 2026-09-14): floor value, structure separation
// and the PLACE checklist verdict. No Babylon import, so a unit test and a node probe can both read it. PlacePack.ts
// re-exports everything here next to the painters that use it.

// ── value rules (pure) ──────────────────────────────────────────────────────────────────────────────────

/** Rec. 601 luma of a hex colour, 0..1. */
export function lumaHex(hex: string): number {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function scaleHex(hex: string, k: number): string {
  const v = hex.replace('#', '');
  const c = (i: number): string => Math.max(0, Math.min(255, Math.round(parseInt(v.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0');
  return `#${c(0)}${c(2)}${c(4)}`;
}

/**
 * The band a FLOOR albedo must sit in to read under the venue light rig.
 *
 * The rigs throw a 1.6–2.6 directional sun plus a 0.55–0.95 hemi and then tonemap, so a lit PBR floor lands at
 * roughly 2.5–3× its albedo before ACES rolls it off. Measured on the Venice park: #b8a48c (luma 0.66) came back as
 * a 0.93 frame luma — a white field. Above ~0.46 a floor is a light source; below ~0.14 it is a hole.
 */
export const FLOOR_LUMA = { min: 0.14, max: 0.46 } as const;

/** Keep a floor colour's hue and move its value into FLOOR_LUMA. A colour already inside comes back unchanged. */
export function readableFloorHex(hex: string): string {
  const l = lumaHex(hex);
  if (l > FLOOR_LUMA.max) return scaleHex(hex, FLOOR_LUMA.max / l);
  if (l < FLOOR_LUMA.min && l > 0) return scaleHex(hex, FLOOR_LUMA.min / l);
  return hex;
}

/**
 * Structure on a floor needs a VALUE step, not a hue step — the eye separates ramp from slab by lightness at
 * distance. Returns a structure colour at least `step` luma away from the floor, pushed darker when there is room
 * (a ramp face in its own shadow) and lighter otherwise.
 */
export function separatedHex(structure: string, floor: string, step = 0.12): string {
  const lf = lumaHex(floor), ls = lumaHex(structure);
  if (Math.abs(ls - lf) >= step || ls === 0) return structure;
  const target = lf - step >= 0.08 ? lf - step : lf + step;
  return scaleHex(structure, target / ls);
}

// ── the PLACE checklist (pure) ─────────────────────────────────────────────────────────────────────────

/** What a probe measured about a place, one mount, after the wake. */
export interface PlaceMeasure {
  /** hero feet minus the floor under them, metres (null = no floor under the hero at all). */
  floorGap: number | null;
  /** props standing 6–60 m from the hero: the MID layer that tells you where you are. */
  midProps: number;
  /** dot of the hero's facing with the direction to the play centre (null when the mode has no centre). */
  spawnFacing: number | null;
  /** biggest single colour bucket's share of the lower frame (1 = one flat colour: void or melt). */
  flatShare: number | null;
}

export const PLACE_BAR = {
  /** feet may sink 6 cm into a surface (soles, grass) or float 5 cm over it, no more */
  gapMin: -0.06, gapMax: 0.05,
  midProps: 6,
  /** the spawn looks within ~75° of the play */
  facing: 0.25,
  /** a readable floor has texture and furniture: no one bucket owns more than 45 % of the lower frame */
  flat: 0.45,
} as const;

export function placeVerdict(m: PlaceMeasure): { pass: boolean; fails: string[] } {
  const fails: string[] = [];
  if (m.floorGap === null) fails.push('no floor under the spawn');
  else if (m.floorGap < PLACE_BAR.gapMin) fails.push(`feet sunk ${(-m.floorGap).toFixed(2)} m`);
  else if (m.floorGap > PLACE_BAR.gapMax) fails.push(`feet float ${m.floorGap.toFixed(2)} m`);
  if (m.midProps < PLACE_BAR.midProps) fails.push(`${m.midProps} mid props (< ${PLACE_BAR.midProps})`);
  if (m.spawnFacing !== null && m.spawnFacing < PLACE_BAR.facing) fails.push(`spawn faces away from play (${m.spawnFacing.toFixed(2)})`);
  if (m.flatShare !== null && m.flatShare > PLACE_BAR.flat) fails.push(`flat floor ${(m.flatShare * 100).toFixed(0)} % one colour`);
  return { pass: fails.length === 0, fails };
}
