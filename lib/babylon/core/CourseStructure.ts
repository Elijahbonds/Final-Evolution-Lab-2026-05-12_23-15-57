// CourseStructure — Mode 3 Phase 13: run-based course logic for snowboard
// (and reusable by any run-format discipline).
//
//   Checkpoints — ordered gates; missing one costs time, hitting one banks
//     a split bonus. The run ENDS at the finish gate.
//   Branching line — a course node may offer a HIGH line (slower, safer,
//     fewer points) vs LOW line (faster, hazard-dense, more points). The
//     choice is positional: which gate line you enter.
//   Halfpipe — an amplitude-driven sub-area: pumping the transitions adds
//     amplitude; amplitude gates trick value (bigger air = bigger spins);
//     scored as its own mini-run.
//   Hazard — a rockfall band: rocks spawn on a telegraphed timer across
//     the low line; contact is a stumble (the mode maps it to its stumble
//     flow).
//
// Pure logic + geometry — the mode renders and calls the checkers.

import { Vector3 } from '@babylonjs/core';

// ── Checkpoints ────────────────────────────────────────────────────────────
export interface Checkpoint { id: string; pos: Vector3; radius: number; bonus: number; line?: 'high' | 'low' }

export class CheckpointTracker {
  private nextIdx = 0;
  hits = 0;
  misses = 0;
  splitBonus = 0;
  line: 'high' | 'low' | null = null;

  constructor(private checkpoints: Checkpoint[]) {}

  /** Current target gate. */
  get next(): Checkpoint | null { return this.checkpoints[this.nextIdx] ?? null; }
  get done(): boolean { return this.nextIdx >= this.checkpoints.length; }

  /** Per-frame: is the rider inside the target gate? If the target is a
   *  branch (multiple checkpoints share its id prefix with line tags),
   *  either gate completes the pair and records the chosen line. */
  update(pos: Vector3): { hit: Checkpoint | null; missed: Checkpoint | null } {
    const target = this.next;
    if (!target) return { hit: null, missed: null };
    const isBranch = !!target.line;
    const group = isBranch
      ? this.checkpoints.filter((c) => c.line && c.id.replace(/high|low/, '') === target.id.replace(/high|low/, ''))
      : [target];
    for (const c of group) {
      if (Vector3.Distance(pos, c.pos) <= c.radius) {
        if (c.line) this.line = c.line;
        this.nextIdx += group.length;
        this.hits++;
        this.splitBonus += c.bonus;
        return { hit: c, missed: null };
      }
    }
    // passed the gate plane without entering = a miss (branch: the plane
    // is the shared z of the pair)
    if (pos.z > target.pos.z + target.radius + 1.5) {
      this.nextIdx += group.length;
      this.misses++;
      return { hit: null, missed: target };
    }
    return { hit: null, missed: null };
  }
}

// ── Halfpipe ───────────────────────────────────────────────────────────────
export class HalfpipeRun {
  amplitude = 0;               // meters of air above the lip
  private pumpCharge = 0;

  /** Pumping a transition (pump input while on the wall) adds amplitude. */
  pump(strength01: number, onWall: boolean): void {
    if (!onWall) { this.pumpCharge = Math.max(0, this.pumpCharge - 0.01); return; }
    this.pumpCharge = Math.min(1, this.pumpCharge + strength01 * 0.05);
  }

  /** Launch off the lip: amplitude = base + pump charge. Returns the air
   *  height this hit produces (and resets the charge). */
  launch(baseAir: number): number {
    const out = baseAir + this.pumpCharge * 2.2;
    this.amplitude = out;
    this.pumpCharge = 0;
    return out;
  }

  /** Pipe trick value scales with amplitude (a 540 at 4m beats a 720 at 1m). */
  trickValue(basePts: number, turns: number): number {
    const ampMult = 0.6 + Math.min(1.4, this.amplitude * 0.35);
    return Math.round(basePts * (1 + turns * 0.15) * ampMult);
  }
}

// ── Rockfall hazard ────────────────────────────────────────────────────────
export interface FallingRock { pos: Vector3; radius: number; alive: boolean }

export class Rockfall {
  rocks: FallingRock[] = [];
  private timer = 0;

  constructor(private band: { x0: number; x1: number; z0: number; z1: number }, private intervalSec = 1.6) {}

  update(dt: number): FallingRock[] {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.intervalSec;
      this.rocks.push({
        pos: new Vector3(
          this.band.x0 + Math.random() * (this.band.x1 - this.band.x0),
          0.4,
          this.band.z0 + Math.random() * (this.band.z1 - this.band.z0),
        ),
        radius: 0.9, alive: true,
      });
    }
    // rocks roll downhill and expire
    for (const r of this.rocks) { r.pos.z += 6 * dt; }
    this.rocks = this.rocks.filter((r) => r.pos.z < this.band.z1 + 20);
    return this.rocks;
  }

  /** Contact check (grounded riders only — jumping clears it). */
  hits(pos: Vector3, grounded: boolean): boolean {
    if (!grounded) return false;
    return this.rocks.some((r) => Math.hypot(pos.x - r.pos.x, pos.z - r.pos.z) < r.radius + 0.4);
  }
}
