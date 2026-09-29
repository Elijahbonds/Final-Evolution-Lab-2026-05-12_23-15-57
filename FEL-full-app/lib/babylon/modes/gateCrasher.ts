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
//
// GATE-CRASHER-POLISH-2 (2026-09-28) adds the rules behind the eye's GC list: the carve's bank, the rocks off the line and
// their stumble, the air a trick can still finish, the time bonus curve, the stall, the air shadow (see the section below).
import { trickSeconds } from '../core/TrickPose';
import { SNOW_TRICKS, type BoardTrick } from '../core/BoardTricks';

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
export function carveSpeed01(speed: number, cruise: number): number {
  return Math.max(0, Math.min(1, speed / Math.max(1e-6, cruise)));
}

// ── GATE-CRASHER-POLISH-2 (2026-09-28): the eye's GC list on 46a8dc6a / 9096d7cf, as rules a test can hold ─────────────────

/**
 * GC-5 THE CARVE, LAID OVER. The bank was the shared board table (22° max) × 1.35, and it never showed: the Rider eases the
 * root's roll toward −steer × 0.28 (16°) every frame, then the mode eased it toward its own bank — the fixed point of two
 * writers is their AVERAGE, so the roll plateaued at 16–18° whatever the mode asked (measured p90 17.6°). The mode owns the
 * roll now, and a snowboard's is its own number: the rider and the board roll as ONE about the board (bindings), so the
 * feet never leave the deck the way a skater's would past 22°. SSX lays a hard carve over 30–45°.
 */
export const SNOW_CARVE_MAX = 38 * Math.PI / 180;
/** Roll (rad) for a lean at a carve speed. A right lean is a NEGATIVE roll (the board stack's sign, BoardPosture.boardBank).
 *  The lean is eased (BalanceModel) and a slalom is mostly partial corrections, so the curve is concave: half a lean at
 *  cruise already lays the rider over ~22°, a committed one the whole 38°. */
export function snowBank(lean: number, carve01: number): number {
  const l = Math.max(-1, Math.min(1, lean));
  const s = Math.max(0, Math.min(1, carve01));
  return -Math.sign(l) * Math.pow(Math.abs(l), 0.75) * Math.pow(s, 0.8) * SNOW_CARVE_MAX;
}

/**
 * GC-1 THE ROCKS. Rock 0 sat at x 0 eight metres after gate 0 (x 0) on the way to gate 1 (x 3.1): the straight line between
 * the two gates passes x ≈ 1 there, and the eye's rider — steering at gate 1's centre, as told — hit it at x 1.0, z 24.8 at
 * 2.4 m/s, four seconds in, and lay down in the snow (reproduced at 9096d7cf: x 1.0, z 24.8). Rocks are the run's JUMP
 * obstacles, not a tax on the line the gates ask for: every rock stands ROCK_LINE_CLEAR_M off the gate-to-gate line and
 * ROCK_GATE_CLEAR_M off any gate along the fall line, never on a park feature.
 */
export const ROCK_LINE_CLEAR_M = 3.6;
export const ROCK_GATE_CLEAR_M = 5;
/** …and a rock met at walking pace is a STUMBLE (the board checks, the body stays up), not a wipeout: below this speed. */
export const ROCK_WIPE_SPEED = 6;
/** The share of its speed a board keeps through a stumble. */
export const ROCK_STUMBLE_KEEP = 0.6;
export type RockOutcome = 'stumble' | 'wipe';
export function rockOutcome(speed: number): RockOutcome { return speed >= ROCK_WIPE_SPEED ? 'wipe' : 'stumble'; }

/** A gate as the course lays it out: lateral metres and metres down the fall line. */
export interface GateSpot { x: number; dist: number }
/** A park feature's footprint in the same terms (lateral x0…x1, fall-line d0…d1). */
export interface FeatureSpan { x0: number; x1: number; d0: number; d1: number }
/** The racing line's lateral position `dist` down the fall line: from the start (x 0) straight through every gate centre. */
export function racingLineX(gates: readonly GateSpot[], dist: number): number {
  let px = 0, pd = 0;
  for (const g of gates) {
    if (dist <= g.dist) return px + (g.x - px) * Math.max(0, Math.min(1, (dist - pd) / Math.max(1e-6, g.dist - pd)));
    px = g.x; pd = g.dist;
  }
  return px;
}
/** How far a rock keeps off a feature's footprint (its own radius and a board's width). */
const ROCK_FEATURE_PAD_M = 1.6;
/**
 * Where the run's rocks stand: the authored scatter (every 21 m from 26 m, x = sin(i · 2.9) · 10), each pushed off the racing
 * line on its own side — or across it when a feature is in the way — and off the gates along the fall line.
 */
export function rockSpots(gates: readonly GateSpot[], features: readonly FeatureSpan[], half: number, count = 8): GateSpot[] {
  const out: GateSpot[] = [];
  const onFeature = (x: number, d: number) => features.some((f) => x > f.x0 - ROCK_FEATURE_PAD_M && x < f.x1 + ROCK_FEATURE_PAD_M && d > f.d0 - ROCK_FEATURE_PAD_M && d < f.d1 + ROCK_FEATURE_PAD_M);
  for (let i = 0; i < count; i++) {
    let dist = 26 + i * 21;
    for (const g of gates) if (Math.abs(g.dist - dist) < ROCK_GATE_CLEAR_M) dist = g.dist + (dist >= g.dist ? 1 : -1) * ROCK_GATE_CLEAR_M;
    const line = racingLineX(gates, dist);
    const scatter = Math.sin(i * 2.9) * 10;
    const side = scatter >= line ? 1 : -1;
    const inGroom = (x: number) => Math.abs(x) <= half - 3;
    const candidates = [
      Math.abs(scatter - line) >= ROCK_LINE_CLEAR_M ? scatter : line + side * ROCK_LINE_CLEAR_M,
      line - side * ROCK_LINE_CLEAR_M,
      line + side * (ROCK_LINE_CLEAR_M + 2),
      line - side * (ROCK_LINE_CLEAR_M + 2),
    ];
    const x = candidates.find((c) => inGroom(c) && !onFeature(c, dist));
    if (x !== undefined) out.push({ x, dist });
  }
  return out;
}

/**
 * GC-2 A TRICK THE AIR CAN FINISH. Every button trick in the air was judged against a FIXED 1.2 s budget, whatever air the
 * rider actually had left — so a Y pressed on the way down of a flat ollie threw the 720 with a fifth of a second to spin it,
 * and the landing was a forced bail (the eye: `bail 720 0.23`, `bail RODEO 540 0.25`; at 9096d7cf `bail 720 0.50`,
 * `sketchy RODEO 540 0.77`). The air LEFT is measured now, and SSX's rule applies: a spin that cannot finish is thrown as the
 * biggest spin that can, and a press with no air left for anything is answered (NO AIR) — the trick already going lands.
 */
/** The Rider's gravity (m/s², GroundRide's default — the snow rig does not override it). */
export const SNOW_GRAVITY = 14;
/**
 * Seconds until a body in the air meets the snow: `h` metres above the snow under it, rising at `vy`, over snow that falls away
 * at `drop` m/s (the piste's tan(pitch) × the board's down-slope speed: a rider flying down a pitched run stays up longer).
 */
export function airLeftSec(h: number, vy: number, drop = 0, g = SNOW_GRAVITY): number {
  const v = vy + Math.max(0, drop);
  return Math.max(0, (v + Math.sqrt(v * v + 2 * g * Math.max(0, h))) / g);
}
/** One clean grab's hold (TrickMachine.MIN_TAP_GRAB_SEC — a grab scores 4 a second against a need of 1). */
export const MIN_GRAB_SEC = 0.25;
/** A trick's motion from the press: a spin or flip on the pose clock the TrickMachine grades it on; a grab, one clean hold. */
export function motionSec(t: BoardTrick): number {
  return t.spinDeg !== 0 || t.flipDeg !== 0 ? trickSeconds(t) : MIN_GRAB_SEC;
}
/** Headroom on the air left: the estimate reads the snow under the rider NOW, and a frame of landing is not a finish. */
export const AIR_FIT_MARGIN_SEC = 0.06;
export function fitsAirLeft(t: BoardTrick, airLeft: number): boolean { return motionSec(t) + AIR_FIT_MARGIN_SEC <= airLeft; }
/** The trick a press throws with `airLeft` seconds to finish it: the one asked for, else the biggest SHORTER spin (same flip
 *  family first — a cork or a rodeo shortens to a 540 before a 360), else nothing. A grab that cannot finish has nothing shorter. */
export function shortenToAir(want: BoardTrick, airLeft: number, table: readonly BoardTrick[] = SNOW_TRICKS): BoardTrick | null {
  if (fitsAirLeft(want, airLeft)) return want;
  if (want.spinDeg === 0 && want.flipDeg === 0) return null;
  const shorter = table.filter((t) => t.kind === 'air' && t.spinDeg > 0 && t.spinDeg <= want.spinDeg && t.id !== want.id && fitsAirLeft(t, airLeft));
  shorter.sort((a, b) => b.spinDeg - a.spinDeg || Math.abs(a.flipDeg - want.flipDeg) - Math.abs(b.flipDeg - want.flipDeg) || b.difficulty - a.difficulty);
  return shorter[0] ?? null;
}

/**
 * GC-9 THE TIME BONUS. It was (60 − elapsed) × 10 against a par a clean run only just beats (~59 s), so one fall zeroed it and
 * the card read "+0 TIME" on a good run. The curve now pays 10 a second under TIME_BONUS_ZERO_SEC: a 59 s run earns 310, a run
 * with a fall (~64 s) 260, and it is gone by 90 s. THE CEILING DOES NOT MOVE: the Arena stake mirrors the most the time can pay
 * (lib/arena-score-integrity `snowTimeBonusMax` = 600), and the bonus is capped at exactly that — reached only by a run under
 * 30 s, which the course cannot give.
 */
export const TIME_PAR_SEC = 60;
export const TIME_BONUS_ZERO_SEC = 90;
export const TIME_BONUS_PER_SEC = 10;
export const TIME_BONUS_MAX = 600;
export function timeBonus(elapsed: number): number {
  return Math.min(TIME_BONUS_MAX, Math.max(0, Math.round((TIME_BONUS_ZERO_SEC - elapsed) * TIME_BONUS_PER_SEC)));
}

/**
 * GC-F1 A RUN THAT STALLS ENDS. Nothing ended a run whose rider had stopped (a board turned across the fall line, pinned
 * against a feature): the clock ran on with no way out but the browser. A grounded board slower than STALL_SPEED for
 * STALL_NUDGE_SEC is turned back down the fall line and given a push (said on screen); still stalled at STALL_END_SEC the run
 * ends on its card (REPLAY / HOME), and no run outlives RUN_CAP_SEC.
 */
export const STALL_SPEED = 1.2;
export const STALL_NUDGE_SEC = 3;
export const STALL_END_SEC = 14;
export const RUN_CAP_SEC = 240;
export type StallAction = 'ride' | 'nudge' | 'end';
/** What `stillSec` seconds of stall (and `elapsed` of run) call for; the mode nudges once per STALL_NUDGE_SEC. */
export function stallAction(stillSec: number, elapsed: number): StallAction {
  if (elapsed >= RUN_CAP_SEC || stillSec >= STALL_END_SEC) return 'end';
  return stillSec >= STALL_NUDGE_SEC ? 'nudge' : 'ride';
}

/**
 * GC-6 THE AIR SHADOW. The shared contact disc holds the TAKE-OFF height in the air and lies level, so off a kicker on a
 * pitched run it hung at lip height in the air, a hard dark ellipse well away from the rider on screen. The snow's shadow
 * lies ON the snow under the rider (raycast), tilted with it, and grows soft and faint with height.
 */
export function airShadow(h: number): { alpha: number; scale: number } {
  const hh = Math.max(0, h);
  const k = Math.max(0, 1 - hh / 4.5);
  return { alpha: 0.3 * k * k, scale: 1 + hh * 0.45 };
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
