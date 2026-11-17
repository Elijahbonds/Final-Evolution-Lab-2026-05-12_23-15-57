// StickFrame — "STICK RIGHT RUNS A STRAIGHT LINE WHILE IT IS HELD" (lane/move-feel-2; owner 2026-11-17: the answer to MOVE-FEEL-DIAGNOSIS
// cause #1). The hoops stick is camera-relative, and the hoops follow camera orbits the rim, so a stick held still bent the run 30–43° a
// second (measured on the rig): the court direction a held stick asks for turned with the camera. Here the camera's flat axes are captured
// when the stick leaves centre and held while the stick stays out; they follow the live camera again the moment the stick comes home. A
// camera that turns more than RECAPTURE_DEG away from the held frame (a cut to a new possession, a replay hand-back) is taken at once.
// Knob `hoops.stickFrameHold`: 1 = the held frame (shipped ON, the owner's choice); 0 = the live camera every frame (the game before).
// Pure (plain {x, z} axes); the modes read it inside their camera-relative helpers (OneVOneMode camRel, ThreeVThreeMode's wish).

import { feel } from '../../feel-panel/feel';

/** (new, lane/move-feel-2) 1 = a held stick keeps the court frame it was pushed in; 0 = the live camera every frame (before 2026-11-17).
 *  assumption: shipped ON — the owner chose the straight line; the knob restores the old curve. */
export const HOOPS_STICK_FRAME_HOLD = 1;
/** The stick is "held" past this magnitude (the slot's own dead zone is below it). */
export const STICK_HOLD_MIN = 0.2;
/** A live camera this far round from the held frame re-captures (a cut, not a follow). */
export const RECAPTURE_DEG = 75;

export interface FlatAxis { x: number; z: number }

export class StickFrame {
  private held = false;
  private fx = 0; private fz = -1; private rx = 1; private rz = 0;
  /** Read the stick through this frame's axes. `f` / `r` are the live camera's flat forward and right (unit), overwritten in place with
   *  the axes to use; `mag` is the stick's magnitude this frame. */
  read(f: FlatAxis, r: FlatAxis, mag: number): void {
    if (!(feel('hoops.stickFrameHold', HOOPS_STICK_FRAME_HOLD) > 0) || !(mag > STICK_HOLD_MIN)) { this.held = false; return; }
    const cos = this.fx * f.x + this.fz * f.z;
    if (!this.held || cos < Math.cos((RECAPTURE_DEG * Math.PI) / 180)) {
      this.held = true; this.fx = f.x; this.fz = f.z; this.rx = r.x; this.rz = r.z; return;
    }
    f.x = this.fx; f.z = this.fz; r.x = this.rx; r.z = this.rz;
  }
  /** The stick came home or the possession reset: the next push takes the live camera. */
  reset(): void { this.held = false; }
}
