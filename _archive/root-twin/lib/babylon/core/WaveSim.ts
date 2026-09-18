// WaveSim — Mode 3 Phase 14/15: a wave that FORMS, MOVES, and BREAKS over
// time — not a static ramp reskinned as water. Plus the paddle/lineup
// phase that makes wave selection a skill.
//
//   WaveLifecycle — swell → forming → breaking (peel along the line) →
//     dissipated. The face steepens as it breaks; the "power section"
//     (steep, fast) travels with the peel. Geometry params feed both the
//     visual mesh (mode) and the physics (face steepness at the rider's
//     position).
//   PaddleSim — paddling builds approach speed toward the wave's speed;
//     catching requires matching the wave's pace inside the takeoff window
//     as it stands up. Too slow = wave rolls under you; too late = pearl.
//   PopUp — on catch, a timed transition from prone to standing (a short
//     commitment window — mistimed input wobbles the takeoff).
//
// Headless-testable; the mode renders meshes from these numbers.

export type WavePhase = 'swell' | 'forming' | 'breaking' | 'dissipated';

export interface WaveState {
  phase: WavePhase;
  /** position of the breaking crest along the break line (0..1) */
  peel01: number;
  /** face steepness at a given line position (0..1) */
  steepnessAt(linePos01: number): number;
  /** wave speed along the line (m/s) */
  speed: number;
  /** height (m) at the crest */
  height: number;
}

export class WaveLifecycle {
  private t = 0;
  phase: WavePhase = 'swell';
  peel01 = 0;

  constructor(
    private swellSec = 6, private formingSec = 4,
    private breakSec = 9, private fadeSec = 4,
    public readonly baseSpeed = 5.2, public readonly maxHeight = 2.4,
  ) {}

  update(dt: number): void {
    this.t += dt;
    const { swellSec, formingSec, breakSec, fadeSec } = this;
    if (this.t < swellSec) this.phase = 'swell';
    else if (this.t < swellSec + formingSec) this.phase = 'forming';
    else if (this.t < swellSec + formingSec + breakSec) {
      this.phase = 'breaking';
      this.peel01 = (this.t - swellSec - formingSec) / breakSec;
    } else if (this.t < swellSec + formingSec + breakSec + fadeSec) {
      this.phase = 'dissipated';
    }
  }

  get done(): boolean { return this.phase === 'dissipated'; }

  /** The face at a line position: steepest just behind the peel front
   *  (the power section), soft ahead (unbroken), collapsing behind. */
  steepnessAt(linePos01: number): number {
    if (this.phase === 'swell') return 0.15;
    if (this.phase === 'forming') return 0.35;
    if (this.phase === 'dissipated') return 0.05;
    const d = this.peel01 - linePos01;            // >0: already broke here
    if (d < -0.25) return 0.3;                    // unbroken wall ahead
    if (d < 0) return 0.55 + Math.abs(d) * 1.4;   // standing up to break
    if (d < 0.18) return 1.0 - d * 2;             // the power section
    return Math.max(0.1, 0.4 - (d - 0.18) * 1.2); // whitewash behind
  }

  get speed(): number {
    return this.phase === 'breaking' ? this.baseSpeed * (1 + this.peel01 * 0.3) : this.baseSpeed * 0.7;
  }

  get height(): number {
    if (this.phase === 'swell') return this.maxHeight * 0.4;
    if (this.phase === 'forming') return this.maxHeight * 0.8;
    if (this.phase === 'breaking') return this.maxHeight * (1 - this.peel01 * 0.3);
    return this.maxHeight * 0.2;
  }
}

// ── Paddle & catch ─────────────────────────────────────────────────────────
export const CATCH_SPEED_MATCH = 0.85;      // rider speed / wave speed
export const CATCH_WINDOW = { min: 0.25, max: 0.75 };  // wave must be standing (forming→early break)

export class PaddleSim {
  speed = 0;
  paddling = false;

  /** Pump the paddle input; speed builds toward the wave's pace. */
  update(dt: number, paddle: boolean, waveSpeed: number): void {
    this.paddling = paddle;
    const target = paddle ? waveSpeed * 1.05 : 0.4;    // idle drift
    const rate = paddle ? 3.2 : 1.2;
    this.speed += Math.max(-rate * dt, Math.min(rate * dt, target - this.speed));
  }

  /** Can this rider catch the wave NOW? Needs pace match + the wave
   *  standing up (not flat swell, not closed out). */
  canCatch(wave: WaveLifecycle, riderLinePos01: number): boolean {
    if (wave.phase !== 'forming' && wave.phase !== 'breaking') return false;
    const stand = wave.phase === 'forming' ? 0.4 : wave.peel01;
    if (stand < CATCH_WINDOW.min || stand > CATCH_WINDOW.max) return false;
    const faceHere = wave.steepnessAt(riderLinePos01);
    if (faceHere < 0.3) return false;                 // flat section won't take you
    return this.speed / wave.speed >= CATCH_SPEED_MATCH;
  }
}

/** Pop-up: the prone → standing transition. A timed press; mistimed =
 *  wobble (instability kick the rider has to ride out). */
export class PopUp {
  private pressAt: number | null = null;
  static readonly WINDOW_SEC = 0.55;

  startCatch(nowMs: number): void { this.pressAt = nowMs; }

  /** The rider commits. Returns 'clean' | 'late' | 'early' | null (no catch). */
  commit(nowMs: number): 'clean' | 'late' | 'early' | null {
    if (this.pressAt === null) return null;
    const dt = (nowMs - this.pressAt) / 1000;
    const ideal = PopUp.WINDOW_SEC * 0.5;
    this.pressAt = null;
    if (Math.abs(dt - ideal) <= 0.18) return 'clean';
    return dt < ideal ? 'early' : 'late';
  }
}
