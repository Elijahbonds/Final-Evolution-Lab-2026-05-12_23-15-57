// lib/hoops-cam/spot.ts — basketball on the camera (BBS, 2026-10-26): where a shot was taken from, for the shot chart.
//
// ONE PHONE, NO COURT LINES READ. The spot is put together from three things the app already has:
//   · how far away the SHOOTER stands: their shoulder→ankle length in the picture against their height (the VBT body
//     ruler's share, lib/vbt/track.ts segmentUnits; Drillis–Contini 0.779 of stature), at the lens's focal length;
//   · how far away the RING is: its width in the picture (the user's two taps) against its real 45.7 cm;
//   · WHERE THE PHONE STANDS around the hoop, which the user picks once (behind the shooter, a wing, a baseline):
//     that turns the camera's floor plan into the court's.
// The focal length is a phone's main camera's: LONG_SIDE_FOV_DEG across the picture's long side (assumption, flagged;
// every phone differs a little). Its error moves both depths by the same share, so a spot's side-to-side place holds and
// its distance stretches with it. The spot is drawn as APPROXIMATE, and a shot whose shooter the pose did not see has
// no spot (it still counts in the totals).
//
// Court coordinates (metres): the ring's centre at (0, 0); x to the right as the shooter faces the basket from half
// court; z out from the baseline side toward half court. The three-point line is FIBA / NCAA's 6.75 m (6.6 m in the
// corners) — assumption, flagged: a high-school line is 6.02 m, the NBA's 7.24 m.
//
// Pure.
import { SEGMENT_STATURE_SHARE } from '@/lib/vbt/thresholds';
import type { Rim } from './rim';

/** (new, assumption) A phone main camera's field of view across the picture's long side. */
export const LONG_SIDE_FOV_DEG = 66;
/** The ring's inside diameter (m): 18 inches. */
export const RING_D_M = 0.4572;
/** (new) The height used when none was entered (m) — the spot is then rougher, and the page says so. */
export const DEFAULT_HEIGHT_M = 1.75;
/** (assumption) FIBA / NCAA three-point line: 6.75 m, 6.6 m in the corners (the straight part runs to 3 m past the baseline… here to z ≤ 1.4 m). */
export const THREE_M = 6.75;
export const CORNER_THREE_M = 6.6;
const CORNER_Z = 1.4;
/** The key: 4.9 m wide, to the free-throw line 5.8 m from the baseline (the ring's centre is 1.575 m off the baseline). */
const KEY_HALF_W = 2.45;
const KEY_Z = 5.8 - 1.575;
/** The restricted area's arc (m). */
const RIM_ZONE_M = 1.25;

/** Where the phone stands around the hoop: its angle (degrees) from the line out to the top of the key, + to the right. */
export const PLACEMENTS = {
  left_baseline: { label: 'Left baseline', deg: -80 },
  left_wing: { label: 'Left wing (45°)', deg: -45 },
  top: { label: 'Behind the shooter', deg: 0 },
  right_wing: { label: 'Right wing (45°)', deg: 45 },
  right_baseline: { label: 'Right baseline', deg: 80 },
} as const;
export type Placement = keyof typeof PLACEMENTS;
export const PLACEMENT_IDS = Object.keys(PLACEMENTS) as Placement[];
export const isPlacement = (x: unknown): x is Placement => typeof x === 'string' && x in PLACEMENTS;

export type Zone = 'rim' | 'paint' | 'mid' | 'corner3' | 'three';
export const ZONES: Record<Zone, string> = { rim: 'At the rim', paint: 'Paint', mid: 'Mid-range', corner3: 'Corner three', three: 'Three' };
export const ZONE_IDS = Object.keys(ZONES) as Zone[];

export interface Spot { x: number; z: number; distM: number; zone: Zone }

/** The focal length in image heights for a picture of this aspect (width ÷ height). */
export function focalH(aspect: number, fovDeg = LONG_SIDE_FOV_DEG): number {
  const long = Math.max(aspect, 1);                 // the long side, in image heights
  return long / 2 / Math.tan((fovDeg * Math.PI) / 360);
}

export function zoneOf(x: number, z: number): Zone {
  const d = Math.hypot(x, z);
  if (z <= CORNER_Z && Math.abs(x) >= CORNER_THREE_M) return 'corner3';
  if (z > CORNER_Z && d >= THREE_M) return 'three';
  if (d <= RIM_ZONE_M) return 'rim';
  if (Math.abs(x) <= KEY_HALF_W && z <= KEY_Z) return 'paint';
  return 'mid';
}

/**
 * The court spot of a shooter standing with their feet at `feet` (normalised image) and a shoulder→ankle length of
 * `bodyUnits` image heights, given the ring box, the picture's aspect, where the phone stands and the shooter's height.
 * null when the numbers cannot give one (no body length, a ring of no size).
 */
export function spotOf(o: {
  feet: { x: number; y: number } | null; bodyUnits: number | null; rim: Rim; aspect: number; placement: Placement; heightM?: number | null;
}): Spot | null {
  if (!o.feet || !o.bodyUnits || o.bodyUnits < 0.02 || !(o.rim.hw > 0)) return null;
  const f = focalH(o.aspect);
  const H = o.heightM && o.heightM > 1 && o.heightM < 2.4 ? o.heightM : DEFAULT_HEIGHT_M;
  // camera floor plan (metres): X right in the picture, Z away from the lens
  const zS = (f * SEGMENT_STATURE_SHARE * H) / o.bodyUnits;
  const xS = ((o.feet.x - 0.5) * o.aspect * zS) / f;
  const ringUnits = 2 * o.rim.hw * o.aspect;          // the ring's width in image heights
  const zR = (f * RING_D_M) / ringUnits;
  const xR = ((o.rim.x - 0.5) * o.aspect * zR) / f;
  // flip to a plan seen from above with z toward the lens, then turn it so the ring→phone line points where the phone stands
  const c = { x: -xR, z: zR };
  const deg = PLACEMENTS[o.placement].deg;
  const want = Math.atan2(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180));
  const th = want - Math.atan2(c.z, c.x);
  const d = { x: xS - xR, z: -(zS - zR) };
  const cx = d.x * Math.cos(th) - d.z * Math.sin(th);
  const cz = d.x * Math.sin(th) + d.z * Math.cos(th);
  const x = Math.round(Math.max(-7.5, Math.min(7.5, cx)) * 100) / 100;
  const z = Math.round(Math.max(-1.5, Math.min(12, cz)) * 100) / 100;
  return { x, z, distM: Math.round(Math.hypot(x, z) * 10) / 10, zone: zoneOf(x, z) };
}

/** The placement nearest a phone at this court angle (degrees from the line to the top of the key, + right). */
export function nearestPlacement(deg: number): Placement {
  return PLACEMENT_IDS.reduce((a, b) => (Math.abs(PLACEMENTS[b].deg - deg) < Math.abs(PLACEMENTS[a].deg - deg) ? b : a), 'top' as Placement);
}
