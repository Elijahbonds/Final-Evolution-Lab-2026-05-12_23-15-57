// DunkFlagship — the dunk flagship pass's numbers and rules (owner playtest 2026-10-27: "Dunk game mode is the flagship — needs to
// be improved still … smoother movement, better lobs"). Pure; DunkMode reads every number through feel() so the owner can tune
// them on a playtest run (lib/feel-panel; never in ranked, staked or paid play). docs/DUNK-FLAGSHIP.md has the measurements.

// ── (a) THE RUNWAY'S FEET MATCH THE GROUND ─────────────────────────────────────────────────────────────────────────────
/** TUNED (was the authored HOOPS_STRIDE.run 3.6 m/s × RUNWAY_PIN 1.1): the ground speed the runway's dribble-run capture
 *  (bball_mc_dribble_run, CMU 78_06) covers at rate 1 — StrideMatch's HOOPS_STRIDE_CAPTURE.sprint, measured from the capture. */
export const RUNWAY_STRIDE_MPS = 4.57;

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
