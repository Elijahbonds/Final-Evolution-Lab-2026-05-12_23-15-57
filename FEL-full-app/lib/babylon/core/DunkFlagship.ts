// DunkFlagship — the dunk flagship pass's numbers and rules (owner playtest 2026-10-27: "Dunk game mode is the flagship — needs to
// be improved still … smoother movement, better lobs"). Pure; DunkMode reads every number through feel() so the owner can tune
// them on a playtest run (lib/feel-panel; never in ranked, staked or paid play). docs/DUNK-FLAGSHIP.md has the measurements.

// ── (a) THE RUNWAY'S FEET MATCH THE GROUND ─────────────────────────────────────────────────────────────────────────────
/** TUNED (was the authored HOOPS_STRIDE.run 3.6 m/s ÷ RUNWAY_PIN 1.1 = 3.27 effective): the ground speed the runway's dribble-run
 *  capture (bball_mc_dribble_run, CMU 78_06) covers at rate 1 ON THE DUNKER. Measured on the rig from the planted foot: paced at
 *  3.27 the feet read a capture of ~4.1 m/s (they cycled fast, sliding back); paced at StrideMatch's 4.57 (scaled to its reference
 *  leg, not this body's) they read ~3.76 (too slow, sliding forward). 3.95 sits between the two reads. */
export const RUNWAY_STRIDE_MPS = 3.95;

// ── (b) THE ALLEY-OOP IS A LOB ──────────────────────────────────────────────────────────────────────────────────────────
// Measured before (esbuild rig, the ALLEY-OOP prop): the passer threw after the take-off, at 0.9 × the rise beat, to arrive on
// the catch beat (LOB_CATCH_CLIP_T 0.62) — a 0.35 s pass from 3.5 m away, a ~10 m/s bullet whose top was barely over the catch.
// Now he lobs it while the dunker is still running: thrown when the run left to the take-off plus the catch beat comes down to
// the lob's flight time, so it hangs over the rim and the dunker runs and jumps to meet it (the launch's re-aim keeps the
// catch exact whatever the run did after the throw).

/** (new) How long the passer's lob is in the air, release to the catch (s). */
export const OOP_LOB_FLIGHT_SEC = 1.0;

/** Throw now? `runToLaunchSec` is the run left to the take-off line, `catchClipT` the flight's catch beat. A run that starts
 *  inside the lob's time throws at once (a shorter, flatter lob — still on the catch beat). */
export function oopThrowDue(runToLaunchSec: number, catchClipT: number, flightSec: number): boolean {
  return Number.isFinite(runToLaunchSec) && runToLaunchSec + catchClipT <= flightSec;
}

/** The lob's apex over the higher of its two ends (m), for a ballistic flight of `tf` s between heights y0 and y1. */
export function lobApexOver(y0: number, y1: number, tf: number, g = 9.81): number {
  const vy = (y1 - y0) / tf + (g * tf) / 2;
  const top = y0 + (vy * vy) / (2 * g);
  return vy > 0 ? top - Math.max(y0, y1) : 0;
}

// ── (c) THE IRON ANSWERS HOW HARD IT WAS HIT ──────────────────────────────────────────────────────────────────────────
// Measured before: every make froze 70 ms and shook 0.12 for 140 ms whatever the slam was — a timid flush and a perfect one hit
// the iron the same (owner decision 2026-10-1x, the impact kit: "hit-stop, shake by size"). Now an ordinary make (accuracy at or
// under SLAM_BIG_FROM) keeps exactly those numbers, and a clean one grows toward the BIG numbers. Reduced motion is the juice
// kit's own business (it drops the shake; the hit-stop is gameplay and stays).
/** The make's beat as shipped (DunkMode contactPunch). */
export const SLAM_HITSTOP_MS = 70;
export const SLAM_SHAKE = 0.12;
export const SLAM_SHAKE_MS = 140;
/** TUNED (new): a perfect slam's beat (was the same 70 ms / 0.12 / 140 ms as every make). */
export const SLAM_HITSTOP_BIG_MS = 100;
export const SLAM_SHAKE_BIG = 0.18;
export const SLAM_SHAKE_BIG_MS = 180;
/** (new) Slam accuracy (0–1, the card's execution read) from which the beat starts to grow. */
export const SLAM_BIG_FROM = 0.5;

export interface SlamImpact { hitStopMs: number; shake: number; shakeMs: number }
/** The make's hit-stop and shake for a slam of accuracy `acc01` (and a rim hang adds a touch: the body hits the iron too). */
export function slamImpact(acc01: number, hang: boolean, big = { hitStopMs: SLAM_HITSTOP_BIG_MS, shake: SLAM_SHAKE_BIG }, from = SLAM_BIG_FROM): SlamImpact {
  const a = Number.isFinite(acc01) ? Math.min(1, Math.max(0, acc01)) : 0;
  const k = Math.min(1, Math.max(0, (a - from) / Math.max(1e-6, 1 - from)) + (hang ? 0.15 : 0));
  return {
    hitStopMs: Math.round(SLAM_HITSTOP_MS + (big.hitStopMs - SLAM_HITSTOP_MS) * k),
    shake: SLAM_SHAKE + (big.shake - SLAM_SHAKE) * k,
    shakeMs: Math.round(SLAM_SHAKE_MS + (SLAM_SHAKE_BIG_MS - SLAM_SHAKE_MS) * k),
  };
}
