// KART TUNE — Velocity Kart's speed feel in ONE place (10-phase pass, phase 3, 2026-10-02).
//
// Before this file the mode's speed presentation was scattered: the FOV kick's shape lived in SpeedFov's
// module constants (shared with every discipline), the chase camera was the shared 'runner' preset, and
// the acceleration curve was a flat m/s² inside the kart spec. The handling numbers stay where they have
// always lived — the KartSpec (KART_STARTER, which the garage's karts spread from) — because they are
// PER-VEHICLE. What lives here is PER-MODE: the presentation of speed, and a handle on the baseline spec.
//
// The VALUES are the signed-off ones unless a comment says otherwise — this phase makes them ownable and
// testable, it does not re-tune them.

import { KART_STARTER } from '../core/KartModel';
import { SPEED_FOV_GAIN, SPEED_FOV_FLOOR01, SPEED_FOV_TAU, type SpeedFovTune } from '../core/SpeedFov';

export const KART_TUNE = {
  /** The handling baseline the garage's karts spread from (same object — the garage tests pin the reference). */
  spec: KART_STARTER,
  /**
   * The speed-FOV kick's shape, fed to stepSpeedFov every frame. The signed-off shared shape — a kart at
   * 26 m/s with the boost lit reads as fast as the lens can honestly say.
   */
  fov: { gain: SPEED_FOV_GAIN, floor01: SPEED_FOV_FLOOR01, tau: SPEED_FOV_TAU } satisfies SpeedFovTune,
  /**
   * The chase camera, overlaid on the 'runner' preset via CameraDirector.tuneFollow at load. The preset's
   * own values, owned here now so a kart-camera change stops being a shared-preset change.
   */
  cam: { distance: 7.5, height: 3.2, lag: 0.08, lookAhead: 3.0 },
} as const;
