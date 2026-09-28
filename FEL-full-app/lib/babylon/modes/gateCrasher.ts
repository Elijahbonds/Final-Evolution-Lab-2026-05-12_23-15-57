// GATE CRASHER — the slalom's rules and the mountain's solids, as pure functions (GATE-CRASHER-MAJOR, 2026-09-28).
//
// Pure because nothing inside `buildSlopeRun` (it paints a DynamicTexture first) or the mode (it needs a scene) can be
// reached by a headless test, and everything here is something the eye grades on sight:
//
//   THE GATE VERDICT. The mode credited a gate when the rider's root was within 2.0 m of its centre on the frame his z
//   passed 0.3 m SHORT of the gate — and the world drew the poles at 1.7 m. Measured on the baseline race line: three
//   gates credited with the rider 0.10–0.29 m OUTSIDE a pole. The verdict is now judged where he actually crossed the
//   gate's line (interpolated between frames) against the same half-width the poles are drawn at.
//
//   THE SOLIDS. The snow rider has one downward ray and no horizontal collision (GroundRide.stepUp is 0 off the skate
//   plaza), so a box's deck snapped him up in one frame (+0.9 … +1.49 m measured) and a 3 m wallride, a rock, a lift
//   pylon and a spectator were all ridden straight through. Every one is a footprint + a top here, and a body under the
//   top is kept out of the footprint; a body above it (riding the deck, flying over) is left alone.
//
//   THE FALL. A bail played skate's upright arm-flail for 0.9 s while the board slid on at a third of its speed — no
//   body on the snow, nothing to read as a crash. `wipeRoll` lays the rider over on the board (bindings: the board goes
//   with him), holds him in the snow, and brings him back up.

/** The poles stand this far either side of a gate's centre. The world draws them HERE and the verdict reads this. */
export const GATE_HALF_WIDTH = 1.7;
/** A body whose centre crosses within this of a pole's line brushes it: the pole whips (the verdict is the centre's). */
export const POLE_BRUSH_M = 0.35;
/** The share of the gates that makes the run a GATE CRASHER — the win. */
export const GATE_CRASHER_SHARE = 0.5;
/** Metres down the fall line from the last gate to the finish line (the banner the run ends under). */
export const FINISH_AFTER_M = 14;

/** Snow's turn scrub (BoardMovement scrubRate): a fifth of the shared 0.7 — see SnowboardSlalomMode's snowTune. */
export const SNOW_SCRUB = 0.14;

/** Gates to clear for the win. */
export function crashTarget(gates: number): number {
  return Math.max(1, Math.ceil(gates * GATE_CRASHER_SHARE));
}

/** The line the splash and the start banner say: what winning IS, in the player's words. */
export function crashGoal(gates: number): string {
  return `CLEAR ${crashTarget(gates)} OF ${gates} GATES TO CRASH IT · 100 A GATE · TRICKS + TIME ON TOP`;
}

/** The win chip in the HUD: the target before it is reached, the verdict after. */
export function crashChip(hit: number, gates: number): string {
  const t = crashTarget(gates);
  return hit >= t ? 'GATE CRASHER ✓' : `WIN AT ${t} · ${t - hit} TO GO`;
}

export interface XZ { x: number; z: number }
export type GateVerdict =
  | { crossed: false }
  | { crossed: true; hit: boolean; dx: number; brush: boolean };

/**
 * Did the rider cross this gate's line (its z) between `prev` and `now`, and was he between the poles when he did?
 * Judged at the crossing point, interpolated between the two frames — not at whichever frame first came within 0.3 m.
 */
export function judgeGate(prev: XZ, now: XZ, gate: XZ, halfWidth = GATE_HALF_WIDTH): GateVerdict {
  if (!(now.z >= gate.z)) return { crossed: false };
  const span = now.z - prev.z;
  const t = prev.z < gate.z && span > 1e-6 ? (gate.z - prev.z) / span : 1;
  const x = prev.x + (now.x - prev.x) * Math.max(0, Math.min(1, t));
  const dx = x - gate.x;
  return { crossed: true, hit: Math.abs(dx) <= halfWidth, dx, brush: Math.abs(Math.abs(dx) - halfWidth) < POLE_BRUSH_M };
}

/**
 * A solid on the piste. Footprints are world XZ: the park only pitches about x (with the piste), so a footprint stays
 * axis-aligned while its TOP falls away with the snow — `y0` is the top of the base at `z0` and `slope` its dy/dz.
 * A `ramp` rises from nothing at z0 to `h` at z1 (a kicker or a roller: the uphill end is the way on).
 */
export type RideSolid =
  | { kind: 'box'; tag: string; x0: number; x1: number; z0: number; z1: number; y0: number; slope: number; h: number; ramp: boolean }
  | { kind: 'post'; tag: string; x: number; z: number; r: number; y0: number; h: number };

/** A body this close under a solid's top counts as ON it (riding the deck, clearing it in the air), not into it. */
export const OVER_M = 0.35;
/** The rider's footprint, metres: a board and a body, seen from above. */
export const RIDER_RADIUS = 0.35;

/** World y of the solid's top at (x, z) — the deck, the ramp's surface at that point, or the post's cap. */
export function solidTop(s: RideSolid, z: number): number {
  if (s.kind === 'post') return s.y0 + s.h;
  const zc = Math.max(s.z0, Math.min(s.z1, z));
  const k = s.ramp ? (zc - s.z0) / Math.max(1e-6, s.z1 - s.z0) : 1;
  return s.y0 + s.slope * (zc - s.z0) + s.h * k;
}

export interface SolidContact { nx: number; nz: number; index: number; tag: string; kind: RideSolid['kind'] }

/**
 * Keep a body out of every solid it is not above. `feetY` is the body's height BEFORE this frame's ground snap: a body
 * under a deck is being blocked, one above it is riding it or flying it. Returns the corrected XZ and the first contact —
 * the face's outward normal in world XZ, for BoardMovement.wall — or null.
 */
export function resolveSolids(
  pos: XZ, feetY: number, solids: readonly RideSolid[], radius = RIDER_RADIUS,
): { x: number; z: number; contact: SolidContact | null } {
  let { x, z } = pos;
  let contact: SolidContact | null = null;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (feetY >= solidTop(s, z) - OVER_M) continue;           // on it or over it: the ground ray owns this one
    if (s.kind === 'post') {
      const dx = x - s.x, dz = z - s.z, reach = s.r + radius;
      const d = Math.hypot(dx, dz);
      if (d >= reach) continue;
      const nx = d > 1e-6 ? dx / d : -1, nz = d > 1e-6 ? dz / d : 0;
      x = s.x + nx * reach; z = s.z + nz * reach;
      contact ??= { nx, nz, index: i, tag: s.tag, kind: s.kind };
      continue;
    }
    const ex0 = s.x0 - radius, ex1 = s.x1 + radius, ez0 = s.z0 - radius, ez1 = s.z1 + radius;
    if (x <= ex0 || x >= ex1 || z <= ez0 || z >= ez1) continue;
    // out through the face it went in least far past
    const pen = [x - ex0, ex1 - x, z - ez0, ez1 - z];
    let k = 0; for (let j = 1; j < 4; j++) if (pen[j] < pen[k]) k = j;
    const n = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as const)[k];
    if (k === 0) x = ex0; else if (k === 1) x = ex1; else if (k === 2) z = ez0; else z = ez1;
    contact ??= { nx: n[0], nz: n[1], index: i, tag: s.tag, kind: s.kind };
  }
  return { x, z, contact };
}

/** Past the footprint's end, still the lip: the ramp is pitched with the piste, so its top edge leans ~0.65 m downhill of z1. */
export const LIP_MARGIN_M = 1;
/** The ramp a grounded body is riding (its deck under the feet), or null. */
export function rampUnder(solids: readonly RideSolid[], x: number, z: number, feetY: number): RideSolid | null {
  for (const s of solids) {
    if (s.kind !== 'box' || !s.ramp || x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1 + LIP_MARGIN_M) continue;
    if (Math.abs(feetY - solidTop(s, z)) < 0.25) return s;
  }
  return null;
}
/** How much of the ramp's rise the lip gives back as lift. */
export const KICK_POP = 0.9;
/**
 * A board leaving a kicker's lip is thrown UP by it. The rider rides a ramp by ground snaps with no vertical speed, so
 * with the park finally sitting on the snow its kickers only dropped him off their lips. The lift is the ramp's own
 * rise over run (relative to the piste) at the speed he hit it: a steeper kicker at more speed is more air.
 */
export function kickerPop(speed: number, s: RideSolid): number {
  if (s.kind !== 'box' || !s.ramp) return 0;
  return Math.max(0, speed) * (s.h / Math.max(1e-6, s.z1 - s.z0)) * KICK_POP;
}

/** Seconds a wipeout keeps the rider down (the tree's bail beat reads the same number). */
export const WIPE_SEC = 1.1;
/** How far over he goes, radians about the board's long axis (72°: on his side in the snow). */
export const WIPE_ROLL_MAX = 1.25;
/** How fast the snow stops a body lying in it (1/s): from 13 m/s the fall keeps a third and slides ~2.5 m to rest. */
export const WIPE_FRICTION = 1.8;

/**
 * The fall as a roll of the whole rider about the board: the slam (0.22 s, eased out), down in the snow until 0.7 s,
 * then back up onto the edge by WIPE_SEC. 0 before and after, so the ride's own bank takes over without a step.
 */
export function wipeRoll(t: number): number {
  const FALL = 0.22, DOWN_UNTIL = 0.7;
  if (!(t > 0) || t >= WIPE_SEC) return 0;
  if (t < FALL) { const k = t / FALL; return WIPE_ROLL_MAX * (1 - (1 - k) * (1 - k)); }
  if (t < DOWN_UNTIL) return WIPE_ROLL_MAX;
  const k = (t - DOWN_UNTIL) / (WIPE_SEC - DOWN_UNTIL);
  return WIPE_ROLL_MAX * (1 - k * k * (3 - 2 * k));
}

/** A snowboard carves on its EDGE: the bank reads against the cruise pace, not the 27 m/s ceiling (7° at gate speed). */
export const SNOW_BANK_GAIN = 1.35;
export function carveSpeed01(speed: number, cruise: number): number {
  return Math.max(0, Math.min(1, speed / Math.max(1e-6, cruise)));
}

/** A tree beside the run: lateral metres (signed), metres down the fall line, and a size. */
export interface TreeSpot { x: number; dist: number; scale: number }

/**
 * The treeline, down the WHOLE run and outside the groom. The old one was 22 cone pines over the first 210 m of a 678 m
 * run at HALF − 2 … HALF + 1 — half of them inside the rider's clamp (HALF − 1), ridden through — and the lower two
 * thirds of the mountain had no trees at all. `density` is the venue's tree count against the 22 the alpine run was
 * authored with; 0 is a real answer (the glacier is above the trees).
 */
export function treeline(half: number, runLen: number, density: number): TreeSpot[] {
  if (!(density > 0)) return [];
  const out: TreeSpot[] = [];
  const spacing = 19 / Math.min(2, density / 22);             // the alpine run: a near tree every 19 m a side
  const n = Math.floor(runLen / spacing);
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const j = i * 7 + (side > 0 ? 3 : 0);
      // near row: just off the groom, never inside the clamp (half − 1) nor on the edge poles (half − 0.5)
      out.push({ x: side * (half + 1.8 + ((j * 37) % 10) / 10 * 1.6), dist: 4 + i * spacing + ((j * 13) % 7), scale: 0.85 + ((j * 29) % 10) / 22 });
      // far row: the forest behind it, bigger and staggered
      if (i % 3 !== 1) out.push({ x: side * (half + 6 + ((j * 53) % 10) / 10 * 6), dist: 10 + i * spacing + ((j * 17) % 9), scale: 1.1 + ((j * 31) % 10) / 16 });
    }
  }
  return out;
}

/** The piste's edge poles (every run has them): just outside the rider's clamp, so the edge you hit is one you can see. */
export function edgePoles(half: number, runLen: number, spacing = 16): { x: number; dist: number }[] {
  const out: { x: number; dist: number }[] = [];
  for (let d = 2; d <= runLen; d += spacing) for (const side of [-1, 1]) out.push({ x: side * (half - 0.5), dist: d });
  return out;
}
