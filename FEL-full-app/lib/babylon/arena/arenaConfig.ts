// PHYSICS ARENA — the switches and the new feel numbers (owner 2026-11-23: "Make there be a live physics play arena for the sport
// modes.- all the modes can be played physics based. And POV-"; docs/PHYSICS-ARENA-PLAN.md).
//
// Every number here is NEW (no shipped mode reads any of them), chosen on lane/physics-arena from the headless Havok runs in
// scripts/physics-arena-tests.ts, and registered on the feel panel (lib/feel-panel/knobs.ts, group "Physics arena"). Each is read
// through feel() at the point of use, never at module load. The switches restore today exactly at 0:
//   arena.on 0           no Physics Arena chip on Play (the arena page still answers its address)
//   arena.physicsHoops 0  the arena's basketball opens the shipped 1v1 (/play/onevone) instead of the physics game
//   cam.pov 0            SELECT / C in the arena is the camera director's own toggle, as in every other mode
// No existing mode reads this file.

import { feel } from '../../feel-panel/feel';

// ── switches ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The Physics Arena chip on the Play screen. 1 = shown (it ships on: a new place the owner asked for). */
export const ARENA_ON = 1;
/** The arena's basketball 1v1 plays on physics. 0 = the arena's hoops door opens the shipped 1v1 instead. */
export const ARENA_PHYSICS_HOOPS = 1;
/** POV (first person) on the camera button (SELECT / C) inside the arena. 0 = the director's own toggle. */
export const CAM_POV = 1;

// ── the simulation ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Physics steps a second (a fixed step: the same inputs give the same game). 120 = two steps a 60 Hz frame. */
export const ARENA_STEP_HZ = 120;
/** At most this many steps in one frame (a slow frame drops simulated time instead of spiralling). */
export const ARENA_MAX_STEPS = 4;
/** Ball on the floor: the share of the speed kept by a bounce. 0.78 brings a ball dropped from 1.80 m (its bottom) back to 1.34 m
 *  (its top): the rule book asks 1.20 to 1.40 (scripts/physics-arena-tests.ts A). */
export const FLOOR_BOUNCE = 0.78;
/** Ball off the iron. Rims are stiff but damped. */
export const RIM_BOUNCE = 0.55;
/** Ball off the backboard glass. */
export const BOARD_BOUNCE = 0.62;
/** Ball off a body (a chest, an arm): bodies absorb. */
export const BODY_BOUNCE = 0.3;

// ── the shot ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The shooter's jump: upward speed at take-off (m/s). 3.1 = about 0.49 m of rise, 0.32 s to the top. */
export const JUMP_VY = 3.1;
/** The launch angle the hand aims for (degrees above flat). */
export const SHOT_ARC_DEG = 52;
/** Backspin on a jump shot (turns a second). Havok turns it into a softer bounce off the iron and the glass. */
export const BACKSPIN_RPS = 2.2;
/** The share of the body's own upward or downward speed at the release that reaches the ball. Releasing on the way up adds,
 *  on the way down takes away: this is the timing. Chosen from the headless runs (the plan's bar: a good release makes clearly
 *  more than a bad one). */
export const BODY_CARRY = 0.3;
/** The share of the body's sideways drift at the release that the hand cancels (a shot on the move). */
export const RUN_COMPENSATE = 0.85;
/** The hand's own scatter, m/s per axis (one standard deviation). */
export const RELEASE_NOISE = 0.05;
/** POV only: how much of a look away from the rim the shot forgives (1 = always at the rim, 0 = exactly where you look). */
export const AIM_ASSIST = 0.8;

// ── the POV camera ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Eye height above the feet (m) when no head bone is found. */
export const POV_EYE_M = 1.72;
/** Horizontal field of view in POV (degrees). The vertical one follows the screen's shape, clamped 50 to 100. */
export const POV_FOV_DEG = 82;
/** Head-bob height (m). 0 = off (the default: a moving horizon is what makes first person sickening). */
export const POV_BOB_M = 0;
/** How fast the right stick turns the view (degrees a second at full tilt). */
export const POV_LOOK_DEG_S = 150;

/** Knob reads (one Map.get at most; safe per frame). */
export const arenaOn = (): boolean => feel('arena.on', ARENA_ON) >= 0.5;
export const physicsHoopsOn = (): boolean => feel('arena.physicsHoops', ARENA_PHYSICS_HOOPS) >= 0.5;
export const povOn = (): boolean => feel('cam.pov', CAM_POV) >= 0.5;
export const stepHz = (): number => feel('arena.stepHz', ARENA_STEP_HZ);
export const floorBounce = (): number => feel('arena.floorBounce', FLOOR_BOUNCE);
export const rimBounce = (): number => feel('arena.rimBounce', RIM_BOUNCE);
export const boardBounce = (): number => feel('arena.boardBounce', BOARD_BOUNCE);
export const jumpVy = (): number => feel('arena.jumpVy', JUMP_VY);
export const shotArcDeg = (): number => feel('arena.shotArcDeg', SHOT_ARC_DEG);
export const backspinRps = (): number => feel('arena.backspinRps', BACKSPIN_RPS);
export const bodyCarry = (): number => feel('arena.bodyCarry', BODY_CARRY);
export const runCompensate = (): number => feel('arena.runCompensate', RUN_COMPENSATE);
export const releaseNoise = (): number => feel('arena.releaseNoise', RELEASE_NOISE);
export const aimAssist = (): number => feel('arena.aimAssist', AIM_ASSIST);
export const povEyeM = (): number => feel('cam.povEyeM', POV_EYE_M);
export const povFovDeg = (): number => feel('cam.povFovDeg', POV_FOV_DEG);
export const povBobM = (): number => feel('cam.povBobM', POV_BOB_M);
export const povLookDegS = (): number => feel('cam.povLookDegS', POV_LOOK_DEG_S);

/** Where the arena lives, and the shipped 1v1 the hoops door falls back to with arena.physicsHoops 0. */
export const ARENA_HREF = '/play/arena';
export const SHIPPED_ONEVONE_HREF = '/play/onevone';
/** The arena's basketball: the physics game, or (arena.physicsHoops 0) the shipped 1v1. */
export function arenaHoopsHref(): string { return physicsHoopsOn() ? `${ARENA_HREF}?sport=hoops` : SHIPPED_ONEVONE_HREF; }
