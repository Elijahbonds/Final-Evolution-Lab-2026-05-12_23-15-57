// AERO TUNE — Aero Aces' speed feel in ONE place (10-phase pass, phase 3, 2026-10-02). The flyer twin of
// racing/kartTune.ts: the handling numbers stay in the ArcadeTune (ARCADE_TRAINER, which the garage's
// planes scale from via arcadeFrom) because they are PER-AIRFRAME; what lives here is PER-MODE — the
// presentation of speed, and a handle on the baseline tune.
//
// The VALUES are the signed-off ones — this phase makes them ownable and testable, it does not re-tune them.

import { ARCADE_TRAINER } from './ArcadeFlight';
import { SPEED_FOV_GAIN, SPEED_FOV_FLOOR01, SPEED_FOV_TAU, type SpeedFovTune } from '../core/SpeedFov';

export const AERO_TUNE = {
  /** The handling baseline the garage's planes scale from. */
  tune: ARCADE_TRAINER,
  /**
   * The speed-FOV kick's shape, fed to stepSpeedFov every frame (normalised against top × 1.4 — the boost
   * ceiling — so the kick completes exactly when the boost does). The signed-off shared shape.
   */
  fov: { gain: SPEED_FOV_GAIN, floor01: SPEED_FOV_FLOOR01, tau: SPEED_FOV_TAU } satisfies SpeedFovTune,
  /**
   * The chase camera, overlaid on the 'flyer' preset via CameraDirector.tuneFollow at load. The preset's
   * own values, owned here now so an aero-camera change stops being a shared-preset change.
   */
  cam: { distance: 13.5, height: 4.6, lag: 0.09, lookAhead: 9.0 },
  /**
   * The prop's spin rates, rad/s (10-phase pass, phase 9). These are the values the mode already ran —
   * moved here, not re-tuned: the grid's rev, the airborne idle/gas/boost terms, the field's constant hum,
   * and the gate where the blades smear into the blur disc (full gas is 48, a lit boost 68, rivals 40).
   */
  prop: { gridIdle: 6, gridGas: 40, idle: 18, gas: 30, boost: 20, rival: 40, blurFrom: 34, blurTo: 58 },
} as const;
