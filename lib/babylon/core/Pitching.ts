// Pitching — Mode 6 Phase 2: the pitcher controller and five genuinely
// distinct pitch types. Each pitch is a different PHYSICAL event (velocity
// + spin-driven break + release signature), not a relabeled lob.
//
//   PitchType — velo (mph-ish m/s), spin vector (break via SoccerBall's
//     Magnus), release point, and a visual 'tell' window (how early the
//     trajectory betrays the pitch — the Phase 3 read model reads these).
//   Pitcher — select type, target a zone location (or intentionally
//     chase outside), release-timing accuracy mechanic that moves the
//     actual release point (and thus the pitch's honesty).

import { Vector3 } from '@babylonjs/core';

// ── Pitch types ────────────────────────────────────────────────────────────
export interface PitchType {
  id: string;
  label: string;
  velo: number;               // m/s (MLB: 95mph ≈ 42 m/s)
  spin: Vector3;              // rad/s — Magnus break (y = armside/run, x = sink/ride)
  breakSharp01: number;       // how LATE the break bites (0 = gradual, 1 = late snap)
  releasePoint: Vector3;      // pitcher's hand (meters, mound-relative)
  readWindowMs: number;       // how long the batter has to read it honestly
}

export const PITCHES: Record<string, PitchType> = {
  fastball: { id: 'fastball', label: 'FOUR-SEAM', velo: 42, spin: new Vector3(8, 0, 220), breakSharp01: 0.15, releasePoint: new Vector3(0.1, 1.9, 0), readWindowMs: 400 },
  curveball: { id: 'curveball', label: 'CURVEBALL', velo: 33, spin: new Vector3(-26, 4, 160), breakSharp01: 0.55, releasePoint: new Vector3(0.05, 2.0, 0), readWindowMs: 620 },
  slider: { id: 'slider', label: 'SLIDER', velo: 37, spin: new Vector3(-8, 22, 190), breakSharp01: 0.7, releasePoint: new Vector3(0.08, 1.85, 0), readWindowMs: 520 },
  changeup: { id: 'changeup', label: 'CHANGEUP', velo: 34, spin: new Vector3(6, -8, 120), breakSharp01: 0.3, releasePoint: new Vector3(0.1, 1.9, 0), readWindowMs: 430 },
  sinker: { id: 'sinker', label: 'SINKER', velo: 40, spin: new Vector3(-18, -6, 240), breakSharp01: 0.4, releasePoint: new Vector3(0.12, 1.8, 0), readWindowMs: 440 },
};

// ── Strike zone + targeting ────────────────────────────────────────────────
export const ZONE = { halfW: 0.43, bottom: 0.55, top: 1.1 };   // meters at the plate

export interface PitchTarget { x: number; y: number; chase: boolean }

/** Clamp/flag a target: chase pitches aim OUTSIDE the zone on purpose. */
export function aimPitch(x: number, y: number, chase = false): PitchTarget {
  const m = chase ? 1.6 : 1;
  return {
    x: Math.max(-ZONE.halfW * m, Math.min(ZONE.halfW * m, x)),
    y: Math.max(ZONE.bottom - (chase ? 0.25 : 0), Math.min(ZONE.top * m, y)),
    chase,
  };
}

// ── The pitcher ────────────────────────────────────────────────────────────
export class PitcherController {
  selected: PitchType = PITCHES.fastball;
  target: PitchTarget = aimPitch(0, 0.8);
  /** release timing quality set by the input (1 = perfect) */
  releaseQ = 1;

  select(id: keyof typeof PITCHES): void { this.selected = PITCHES[id]; }
  aim(x: number, y: number, chase = false): void { this.target = aimPitch(x, y, chase); }

  /** The pitch that actually happens: target + release accuracy move the
   *  release point (a yanked release misses the spot for REAL). */
  deliver(): { pitch: PitchType; release: Vector3; target: PitchTarget } {
    const miss = (1 - this.releaseQ) * 0.12;
    const release = this.selected.releasePoint.add(new Vector3(
      (Math.random() - 0.5) * miss, (Math.random() - 0.5) * miss, 0));
    return { pitch: this.selected, release, target: this.target };
  }
}
