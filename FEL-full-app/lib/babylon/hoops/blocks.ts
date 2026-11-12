// HAND MEETS BALL (1v1 / 3v3 ten-phase pass, phase 2 "defence is skill, not dice"; owner 2026-10-20 HOOPS DEFENSE: "blocks: the hand
// meets the ball, for EVERYONE. The AI times its jump instead of rolling dice, and the ball flies off where it was hit … goaltending
// needs a real touch").
//
// Before (the release, measured and read in code):
//   · the AI blocked my jumper / layup / dunk with `roll() < aiBlockChance(style, dist, handUp, set)` (core/HoopsDefense) — a hand up
//     anywhere inside 1.9 m was a 4–35 % coin, whatever the hand's height, the ball's height or where the ball was going;
//   · the rim protector swatted a dunk on `roll() < aiBlockChance × 1.6` (core/DriveFlight);
//   · MY block on their shot was `checkBlock`: jumped ≤ 0.4 s ago and within 1.5 m — no hand, no ball (the scripted defender who
//     jumps on the gather swatted 62 % of their shots, hoops-round2's rig);
//   · my swat on their dunk was a window on the flight clock and the jump's age (`jumpSwats`), and goaltending needed no touch at all.
//
// After: ONE test for every body. A defender's hand can be anywhere inside an arm's length of his shoulder — the shoulder rides his
// contest jump (the modes' own jump: JUMP_SEC 0.75 s, apex 0.46 m) — and a block is the BALL inside that reach, by its own radius:
//   · at a release, the ball's path over its first LOOK_SEC is the shot's own arc (BasketballCore.shotArcShape — the curve ShotArc
//     flies), and the jump keeps rising while it flies: a jump timed to the release meets it, an early one is coming down, a late one
//     is still on its way up, and a hand 1.5 m away does not reach;
//   · in a dunk flight, the ball in the dunker's hand this frame;
//   · goaltending, the falling ball this frame.
// No dice: the outcome is geometry. What the AI still DECIDES (whether to jump at all, read at the gather — HoopsDefense.aiShotRead)
// is a choice, not an outcome; WHEN it jumps is timed to the expected release (aiBlockJumpAtSec), never before it could have read
// the shot (its reaction by tier, hoops/reaction).
//
// The ball flies where it was hit (deflect): away from the hand, along the line from the shoulder to the ball, up off a rising hand
// and down off a falling one.
//
// Every number is a feel knob (group "Hoops · blocks (hand meets ball)"); `hoops.blockDiceOn` 1 puts today's rolls back exactly.
// Pure: no Babylon, no scene, no clock but the numbers passed in.
import { feel } from '../../feel-panel/feel';
import { shotArcShape, type ShotStyle } from '../core/BasketballCore';

export interface P3 { x: number; y: number; z: number }

/** 1 = today's dice (aiBlockChance rolls, checkBlock's window, jumpSwats, goaltending without a touch); 0 = the hand meets the ball.
 *  Knob `hoops.blockDiceOn`. */
export const BLOCK_DICE_ON = false;
/** The shoulder's height above the floor, standing (m). With ARM_M this is the standing reach, arms up: 2.40 m. Knob `hoops.blkShoulderM`. */
export const SHOULDER_M = 1.55;
/** Shoulder to fingertips (m). Knob `hoops.blkArmM`. */
export const ARM_M = 0.85;
/** The ball touches the hand when its centre is this close to the reach (m): the ball's radius (0.12) and a fingertip. Knob `hoops.blkContactM`. */
export const CONTACT_M = 0.14;
/** How much of a release's flight a hand can still meet (s). After this the ball is above every hand on the floor. Knob `hoops.blkLookSec`. */
export const LOOK_SEC = 0.25;
/** The contest jump both modes play (OneVOneMode JUMP_SEC / JUMP_VY 3.0 m/s; ThreeVThreeMode JUMP_SEC / JUMP_APEX): s and m. */
export const JUMP_SEC = 0.75;
export const JUMP_RISE_M = 0.46;
/** The AI leaves the floor this long before the release it expects (the green's centre), so the top of its jump meets the ball. TUNED
 *  0.15 → 0.25 s (today's 0.15 left its hand 0.27 m up at the release, still rising; calibrated on the headless sim so the
 *  AI's block rate on my shots stays near the dice's). Knob `hoops.aiBlockLeadSec`. */
export const AI_BLOCK_LEAD_SEC = 0.25;
/** The blocked ball's planar speed off the hand, and its lift off a rising / a falling hand (m/s). Knobs `hoops.blkDeflectMps`, `hoops.blkDeflectUpMps`. */
export const DEFLECT_MPS = 2.4;
export const DEFLECT_UP_MPS = 1.4;

/** Where a shot leaves the hand, above the court (m; the modes pass feet 0 for every shooter — the 3v3 rival's clip hops while his root
 *  stays on the floor, so the root is not his feet for every body): the release is decided before the clip's arms are up (the rig read the
 *  3v3 rival's layups "released" at 1.65–1.74 m, the ball still at his chest), and from the chest any jump reaches it — the hand
 *  would carry the ball up here before it leaves. The block reads the ball from the higher of the two. Knobs `hoops.blkReleaseJumperM`,
 *  `hoops.blkReleaseLayupM`. */
export const RELEASE_JUMPER_M = 2.6;   // TUNED 2.45 → 2.6 (hoops-p02, after calls 1A/2A: the AI's 0.45 jump blocked my jumpers at 13.1 % vs the dice's 4.8 %; 7.5 % here)
export const RELEASE_LAYUP_M = 2.5;
export const blockDiceOn = (): boolean => feel('hoops.blockDiceOn', BLOCK_DICE_ON ? 1 : 0) >= 0.5;
const shoulderM = (): number => feel('hoops.blkShoulderM', SHOULDER_M);
const armM = (): number => feel('hoops.blkArmM', ARM_M);
export const contactM = (): number => feel('hoops.blkContactM', CONTACT_M);
export const lookSec = (): number => feel('hoops.blkLookSec', LOOK_SEC);
export const aiBlockLeadSec = (): number => feel('hoops.aiBlockLeadSec', AI_BLOCK_LEAD_SEC);

/** A defender as the block test sees him: where he stands (planar root), his contest jump's age (Infinity = on the floor) and whether
 *  his hands are UP (a hand-up hold, a block reach or a jump). Hands down never block. */
export interface Blocker { x: number; z: number; jumpAge: number; handsUp: boolean }

/** How high the contest jump has carried the body at `age` s (0 on the floor). The modes' own curve (sin over JUMP_SEC). */
export function jumpRise(age: number, jumpSec = JUMP_SEC, rise = JUMP_RISE_M): number {
  if (!Number.isFinite(age) || age < 0 || age >= jumpSec) return 0;
  return Math.sin((age / jumpSec) * Math.PI) * rise;
}

const LAYUP_LIKE = new Set<ShotStyle>(['layup', 'reverse', 'scoop', 'spinLayup', 'hangLayup', 'fingerRoll', 'mikan', 'upAndUnder']);
/** The ball as it leaves the hand: the drawn ball, lifted to the release height over the shooter's feet when it is still below it. */
export function releaseFrom(ball: P3, shooterFeetY: number, style: ShotStyle): P3 {
  const h = LAYUP_LIKE.has(style) ? feel('hoops.blkReleaseLayupM', RELEASE_LAYUP_M) : feel('hoops.blkReleaseJumperM', RELEASE_JUMPER_M);
  return { x: ball.x, y: Math.max(ball.y, (Number.isFinite(shooterFeetY) ? Math.max(0, shooterFeetY) : 0) + h), z: ball.z };
}

/** The top of his reach right now (m): the shoulder on the jump, plus the arm straight up. */
export function reachTop(b: Blocker, ahead = 0): number {
  return shoulderM() + jumpRise(b.jumpAge + ahead) + armM();
}

/** Metres from the ball's centre to the nearest point the hand can be (0 = the ball is inside his reach). Infinity with the hands down. */
export function reachGap(b: Blocker, ball: P3, ahead = 0): number {
  if (!b.handsUp && !(b.jumpAge + ahead >= 0 && b.jumpAge + ahead < JUMP_SEC)) return Infinity;   // hands down: a landed jump is on the floor
  const sy = shoulderM() + jumpRise(b.jumpAge + ahead);
  const d = Math.hypot(ball.x - b.x, ball.y - sy, ball.z - b.z);
  return Math.max(0, d - armM());
}

/** The hand is on the ball THIS frame (a dunk in flight, a falling ball over the ring). */
export function handOnBall(b: Blocker, ball: P3, ahead = 0): boolean {
  return reachGap(b, ball, ahead) <= contactM();
}

/** Where a released ball is `t` s into its flight: ShotArc's own curve (straight line + a sine bow of `apex`). */
export function ballOnArc(from: P3, to: P3, duration: number, apex: number, t: number): P3 {
  const k = Math.min(1, Math.max(0, t / Math.max(1e-3, duration)));
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * apex,
    z: from.z + (to.z - from.z) * k,
  };
}

export interface FlightRead {
  /** The hand met the ball. */
  hit: boolean;
  /** The closest the ball came to his reach (m; 0 = inside it). */
  gap: number;
  /** When, into the flight (s). */
  t: number;
  /** Where the ball was then. */
  at: P3;
  /** The top of his reach then (m) — for the log: a late jump reads low, an early one is coming down. */
  reachTop: number;
}

/**
 * THE BLOCK AT A RELEASE. The ball leaves `from` on the style's arc to `rim` (bowed by `apexAdd`, the contest's altered release); the
 * blocker's jump keeps going while it flies. Sampled every 1/120 s over `look` s; the first sample inside his reach is the block.
 */
export function meetsRelease(b: Blocker, from: P3, rim: P3, style: ShotStyle, apexAdd = 0, look = lookSec()): FlightRead {
  const shape = shotArcShape(style, Math.hypot(rim.x - from.x, rim.y - from.y, rim.z - from.z), apexAdd);
  const touch = contactM();
  let best: FlightRead = { hit: false, gap: Infinity, t: 0, at: from, reachTop: reachTop(b) };
  const step = 1 / 120;
  for (let t = 0; t <= look + 1e-9; t += step) {
    const at = ballOnArc(from, rim, shape.duration, shape.apex, t);
    const gap = reachGap(b, at, t);
    if (gap < best.gap) best = { hit: gap <= touch, gap, t, at, reachTop: reachTop(b, t) };
    if (gap <= touch) return best;
  }
  return best;
}

/**
 * Where the blocked ball goes: off the hand, along the line from his shoulder through the ball (the way he hit it), with the ball's own
 * planar motion carried a little; up off a hand still rising, down off one coming down (a swat into the floor).
 */
export function deflect(b: Blocker, at: P3, ahead = 0, carry: { x: number; z: number } = { x: 0, z: 0 }): P3 {
  let dx = at.x - b.x, dz = at.z - b.z;
  const L = Math.hypot(dx, dz);
  if (L < 1e-4) { dx = 0; dz = 1; } else { dx /= L; dz /= L; }
  const age = b.jumpAge + ahead;
  const rising = Number.isFinite(age) && age < JUMP_SEC / 2;
  const sp = feel('hoops.blkDeflectMps', DEFLECT_MPS), up = feel('hoops.blkDeflectUpMps', DEFLECT_UP_MPS);
  return { x: dx * sp + carry.x * 0.2, y: rising || !Number.isFinite(age) ? up : -up * 0.4, z: dz * sp + carry.z * 0.2 };
}

/** 1 = the AI's block jump also waits out its tier's reaction (hoops/reaction) after the gather; 0 = timed off the read at the gather
 *  (today's). The rig: with the wait on, a PRO defender's jump was pinned at 0.22 s while my finishes released 0.32–0.39 s into the
 *  meter — 0.10–0.17 s into his jump, never at the ball (0 blocks in 9 releases, the dice's expectation 0.54). Knob `hoops.aiBlockReactOn`. */
export const AI_BLOCK_REACT_ON = false;

/**
 * THE AI TIMES ITS JUMP. Seconds into my shot meter at which the AI leaves the floor: AI_BLOCK_LEAD_SEC before the release it expects
 * (the green's centre) — his read at my gather, as today. With `hoops.aiBlockReactOn` 1, never before his tier's reaction (`reactSec`).
 * The release that comes early or late is the one his jump misses.
 */
export function aiBlockJumpAtSec(expectedReleaseSec: number, reactSec: number): number {
  const wait = feel('hoops.aiBlockReactOn', AI_BLOCK_REACT_ON ? 1 : 0) >= 0.5 ? reactSec : 0;
  return Math.max(0.05, wait, expectedReleaseSec - aiBlockLeadSec());
}
