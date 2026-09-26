// PoseFrameGate — one camera frame, one evaluation (MIRROR-COACH P2, 2026-09-26). Pure: no Babylon, no DOM.
//
// The overlay compositor's render loop (overlay-compositor.ts) runs at the DISPLAY's rate and asks the pose adapter for
// a frame on every tick. When the camera has not delivered a new one, the adapter hands back the previous frame object,
// timestamp and all (mediapipe-adapter.ts detect(): "Returns the previous frame unchanged if the video hasn't
// advanced"). The loop evaluated it again anyway: the kinematic engine, the rep book, the squat audit, and the
// harness's onFrame — the guided squat's rep step and the knee record behind it. On a 60 Hz display and a 30 fps camera
// that is every camera frame twice; on 120 Hz, four times. P1's live proof on :3131 measured the damage: 2,357 audit
// calls for 1,178 camera frames, every "back to standing" moment on a repeated frame, and all 11 reps of the guided
// squat (3 check + 8 work) counted inside ONE squat (painfree/p1/REPORT.md, rows 1g and 4).
//
// This gate admits a frame only when its timestamp has ADVANCED past the last one admitted, so a repeated frame (or one
// stamped earlier, which the adapter never produces) is not evaluated and does not reach onFrame. The scene still
// renders every tick; only the analysis waits for the camera.
export class PoseFrameGate {
  private lastTs = -Infinity;

  /** True the first time a frame with a later timestamp than every admitted one arrives; false for a repeat. */
  admit(frame: { timestampMs: number }): boolean {
    if (!(frame.timestampMs > this.lastTs)) return false;
    this.lastTs = frame.timestampMs;
    return true;
  }

  reset(): void {
    this.lastTs = -Infinity;
  }
}
