// DunkLegs — the Lower Layer (LL), DUNK-POSTURE-LEGS 2026-09-08 (the legs / whole-body follow-up to DUNK-POSTURE @ 9d14995).
//
// The knees and the thighs are the clips' (and, since this pass, they bend the right way: the pose builder places every
// hand / foot target in the RIG'S OWN body frame — a spawn that yawed the root before the clips built had put the mocap's
// ankles at the authored z NEGATED and the knee pole behind the body, so every leg in the flight bent BACKWARD). What no
// clip keys are the FEET and the TOES: a pose clip solves the thigh and the shin to an ankle target and leaves the foot
// bone alone, so through the whole flight the feet held the run loop's last frame — one toe-off foot curled 40–60° down,
// the other mid-swing, whatever stride the takeoff cut — and the land crouch stood on those toes (measured: −19 … −27° of
// toes-down in the crouch, heels off the floor). This is the pure half: a FEET table per posture window, eased between
// windows like the Posture Poses. The mode writes it onto the foot and toe bones in the same after-animations pass.
//
// Layers, in order every frame:  RF root facing → SL DunkSpin (hips) → PP posture poses (thoracic / clavicles / head) →
// LL THIS (feet / toes) → LT limb tricks + HandIK.
//
// `footPitch` is the foot's WORLD elevation — where the toes point against the horizon (0 = the sole flat on the floor,
// − = pointed down, + = toes up) — not an ankle angle: a crouch leans the shin 30° over the toes, so a neutral ankle stands
// the athlete on tiptoe; the layer measures the foot's forward and corrects it to the target. `toeCurl` is the toe bone's
// own pitch from bind (0 = straight toes).
import type { PostureWindow } from './DunkPosture';

export interface LegPose {
  /** The foot's forward elevation in the world (deg): 0 = flat on the floor, − = toes down (pointed), + = toes up. */
  footPitch: number;
  /** Toe bone pitch from bind (deg): 0 = straight toes. */
  toeCurl: number;
  /** How far toward the pose the feet go; 0 = the loop / the clip owns the feet. */
  weight: number;
}

// Static reads (the same film the stance table came from): the runway loops key their own feet (heel-strike / toe-off) —
// the layer stays out; the plant's last foot leaves the floor toes-down; through the rise and the hang the feet hang
// relaxed, pointed a little; the jam settles them; the brace and the land put the heels down for the floor: flat feet,
// straight toes — never a crouch on tiptoe.
export const LEGS: Record<PostureWindow, LegPose> = {
  stance:    { footPitch: 0,   toeCurl: 0, weight: 0 },
  load:      { footPitch: 0,   toeCurl: 0, weight: 0 },
  plant:     { footPitch: -15, toeCurl: 0, weight: 0.85 },   // toe-off: the last foot leaves the floor toes-down
  rise:      { footPitch: -45, toeCurl: 0, weight: 1 },      // pointed through the rise (the shins trail)
  hang:      { footPitch: -40, toeCurl: 0, weight: 1 },
  extend:    { footPitch: -35, toeCurl: 0, weight: 1 },
  jam:       { footPitch: -25, toeCurl: 0, weight: 1 },
  brace:     { footPitch: 5,   toeCurl: 0, weight: 1 },      // heels down, ready for the floor
  land:      { footPitch: 0,   toeCurl: 0, weight: 1 },      // flat on the floor through the crouch — never on tiptoe
  celebrate: { footPitch: 0,   toeCurl: 0, weight: 1 },
};

/** Per-trick feet while the trick's body plays (the scorpion's kick points the toes; the 360 tucks with the feet flat under the knees). */
export const TRICK_LEGS: Record<string, Partial<LegPose>> = {
  scorpion: { footPitch: -60 },   // the kick points the toes
  spin360:  { footPitch: -20 },   // tucked, the feet under the knees
  spin720:  { footPitch: -20 },
};
/** The most the layer turns an ankle from the clip's value to reach the target (deg): a real ankle, never a broken one. */
export const FOOT_PITCH_CAP = 50;

export function legPose(window: PostureWindow, trick: string | null): LegPose {
  const base = LEGS[window];
  const o = trick ? TRICK_LEGS[trick] : undefined;
  return o ? { ...base, ...o } : base;
}

export function easeLegPose(cur: LegPose, to: LegPose, k: number): LegPose {
  const l = (a: number, b: number) => a + (b - a) * k;
  return { footPitch: l(cur.footPitch, to.footPitch), toeCurl: l(cur.toeCurl, to.toeCurl), weight: l(cur.weight, to.weight) };
}
export const cloneLegPose = (p: LegPose): LegPose => easeLegPose(p, p, 0);

// ── The plant (the takeoff hold) ───────────────────────────────────────────
/** Seconds the root holds on the floor at the takeoff line while the launch clip's first keys play: the loaded crouch
 *  with the feet ON the floor, the drive knee coming up, then the arc. Before this the arc started on the clip's first
 *  frame, so the plant floated: 0.4 m off the floor 0.1 s in, the loaded legs pulled up under a body already flying. The
 *  arc and the carry are re-timed to reach the same rim point at the same clip beat (`arcK` / `carryU`). */
export const PLANT_SEC = 0.1;
/** The height fraction of the jump arc at flight clock `t` (0 → 1 → 0 over the flight, held at 0 through the plant). */
export function arcK(t: number, durationSec: number, plantSec = PLANT_SEC): number {
  const tf = Math.max(0, t - plantSec);
  return Math.min(1, tf / Math.max(1e-3, durationSec - plantSec));
}
/**
 * DUNK MOTION phase 9 (owner: "common sense how you would complete the dunk"): THE TOP OF THE JUMP IS AT THE RIM. The height was the
 * parabola 4k(1−k) over plant → duration, topping out at clip 0.80 — while the carry reaches the rim at the extension (1.25), where
 * the slam window is centred, by which time the body was back down to 59 % of its height: the hand came UP to the iron from under
 * it (2.75 m at the press, the ball set onto the ring from below). The rise now leaves the floor as hard as the parabola did
 * (3/(top − plant) of the apex a second, the parabola's 2.86) and eases into its top AT the extension, so the ball goes over the
 * rim from above; past the top the body falls on a parabola over ARC_FALL_SEC.
 */
export const ARC_FALL_SEC = 0.5;
export function arcHeight(t: number, topSec: number, plantSec = PLANT_SEC): number {
  if (t <= plantSec) return 0;
  if (t <= topSec) { const w = 1 - (t - plantSec) / Math.max(1e-3, topSec - plantSec); return 1 - w * w * w; }
  const v = Math.min(1, (t - topSec) / ARC_FALL_SEC); return 1 - v * v;
}
/** The flight clock second the rise reaches `frac` of its top. */
export function arcTopT(topSec: number, frac: number, plantSec = PLANT_SEC): number {
  return plantSec + (topSec - plantSec) * (1 - Math.cbrt(Math.max(0, 1 - frac)));
}
/** How much of the jump's height still reads as "the top": a parabola is flat up there — 98 % of the peak spans ±0.1 s. */
export const ARC_TOP_FRAC = 0.98;
/** The flight clock second the jump reaches the TOP (ARC_TOP_FRAC of its height, on the way up; frac 1 = the apex itself,
 *  where the height 4k(1−k) peaks at k = ½). */
export function arcApexT(durationSec: number, plantSec = PLANT_SEC, frac = 1): number {
  const k = (1 - Math.sqrt(Math.max(0, 1 - frac))) / 2;
  return plantSec + (durationSec - plantSec) * k;
}
/** How long before the SLAM window opens a press is still held for it (CLOTHING-SOFT-RESIDUAL R2, 2026-09-15): never less
 *  than `minSec`, and always back to the top of the arc. The runway teaches "SLAM at the top", and the window is centred on
 *  the extension (clip 1.25) — on the way DOWN. The arc tops out at clip 0.80, the window opened at 1.11 and the buffer
 *  reached back only to 0.89, so a press at the top of the jump was refused "TOO EARLY — 233 ms BEFORE THE WINDOW" (the
 *  QA eye's ontime-p2) and the dunk fell as a hang/miss. A press on the RISE (before the top) is still too early. */
export function slamBufferSec(openAt: number, apexT: number, minSec: number): number {
  return Math.max(minSec, openAt - apexT);
}
/** The forward carry fraction at flight clock `t` (0 at the plant, 1 at the extension beat). */
export function carryU(t: number, extendSec: number, plantSec = PLANT_SEC): number {
  const tf = Math.max(0, t - plantSec);
  return Math.min(1, tf / Math.max(1e-3, extendSec - plantSec));
}

// ── The windmill finish's release ──────────────────────────────────────────
/** Finish-clip seconds at which the PERFECT-timing windmill lets the ball go: the over-the-top key (the hand over the rim
 *  at the top of the sweep), not the press. Released on the press the ball was already flushing while the arm cocked back
 *  and swept (measured: the ball hand 0.2 m under the rim at the release, the ball 2.86 m on its own) — the finish read as
 *  an empty-handed wave. The ball rides the sweep and leaves at the top; the flush and CONTACT follow from there. */
export const WINDMILL_RELEASE_T = 0.55;

// ── The runway gather ──────────────────────────────────────────────────────
/** Seconds before the takeoff line at which the dribble is gathered (the last bounce comes up into the hand, the off hand
 *  joins it): the run's last stride is a two-hand carry into the plant, not a bounce cut in half at the line. */
export const GATHER_LEAD_SEC = 0.5;
/** The dribble phase (0 = at the palm) inside which the gather takes the ball: a hand-off at the palm, never a snap from the floor. */
export const GATHER_PHASE = 0.08;
/** Is the dribble at the palm (the ball in hand) at this phase? */
export const atPalm = (phase: number, tol = GATHER_PHASE): boolean => phase <= tol || phase >= 1 - tol;
