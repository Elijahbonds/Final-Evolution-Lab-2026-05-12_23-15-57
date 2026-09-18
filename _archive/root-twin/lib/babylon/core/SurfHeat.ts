// SurfHeat — Mode 3 Phase 16: judged surf heat on the shared JudgePanel.
//
// A heat is a CONTEST, not a score trickle:
//   - each RIDE becomes a "wave score" from wave-selection quality (how
//     steep/formed the wave was at takeoff), maneuver difficulty (carves,
//     aerials via the shared trick system), and tube time (barrel state)
//   - the heat total is your best N waves, like a real judged heat
//   - JudgePanel's staged reveal runs at the heat's end (or per-wave
//     flashes) — the same tension pacing the dunk contest uses
//
// Barrel riding is the high-risk state: inside the tube (wave breaking
// over the rider), score accrues fast; you must EXIT before the section
// closes (a timing beat) or wipe out and lose the wave's unbanked points.

import { WaveLifecycle } from './WaveSim';

// ── Barrel state ───────────────────────────────────────────────────────────
export class BarrelRide {
  inTube = false;
  tubeTime = 0;
  private closeoutAt = 0;

  /** Enter the tube when the wave is breaking over the rider (steep power
   *  section) at the peel front. */
  tryEnter(wave: WaveLifecycle, riderLinePos01: number): boolean {
    if (this.inTube || wave.phase !== 'breaking') return false;
    const d = wave.peel01 - riderLinePos01;
    if (d > 0 && d < 0.12 && wave.steepnessAt(riderLinePos01) > 0.8) {
      this.inTube = true;
      this.tubeTime = 0;
      // the section closes behind the peel — you have until the closeout
      this.closeoutAt = 1.8 + Math.random() * 1.4;
      return true;
    }
    return false;
  }

  /** Frame step. exitNow = player bails out deliberately. */
  update(dt: number, exitNow: boolean): { state: 'tube' | 'exited' | 'wipeout'; pts: number } {
    if (!this.inTube) return { state: 'exited', pts: 0 };
    this.tubeTime += dt;
    if (exitNow) {
      this.inTube = false;
      return { state: 'exited', pts: Math.round(this.tubeTime * 120) };
    }
    if (this.tubeTime >= this.closeoutAt) {
      this.inTube = false;
      return { state: 'wipeout', pts: 0 };            // the unbanked tube points die
    }
    return { state: 'tube', pts: 0 };
  }
}

// ── Wave scoring + heat ────────────────────────────────────────────────────
export interface WaveScoreInput {
  selectionQuality01: number;   // steepness/formation at takeoff
  maneuvers: { label: string; difficulty: number }[];
  tubeSec: number;
  wipedOut: boolean;
}

export function scoreWave(i: WaveScoreInput): number {
  const base = i.selectionQuality01 * 3;
  const maneuver = i.maneuvers.reduce((s, m) => s + m.difficulty * 0.8, 0);
  const tube = Math.min(4, i.tubeSec * 1.1);
  const raw = base + maneuver + tube;
  return Math.round((i.wipedOut ? raw * 0.4 : raw) * 10) / 10;   // 0..10-ish
}

export class HeatScore {
  waves: number[] = [];
  constructor(private keepBest = 3) {}

  addWave(score: number): void {
    this.waves.push(score);
    this.waves.sort((a, b) => b - a);
  }

  /** Heat total = best N waves (contest format). */
  get total(): number {
    return Math.round(this.waves.slice(0, this.keepBest).reduce((s, w) => s + w, 0) * 10) / 10;
  }

  get waveCount(): number { return this.waves.length; }
}
