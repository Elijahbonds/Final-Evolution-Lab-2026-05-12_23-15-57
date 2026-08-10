// ParkGoals — Mode 3 Phase 11: THPS-style goals + a level gimmick for the
// skatepark. Data-driven goal definitions; the mode reports events, the
// tracker owns completion.
//
//   Goal kinds (3+ distinct types, per the phase exit criteria):
//     score   — bank N total points in the run
//     combo   — land a single combo worth N+
//     gap     — hit a named transfer (cross a gap trigger volume airborne)
//     collect — grab all N park collectibles
//   Gimmick — the MOVING RAIL: a rail that patrols the plaza on a loop;
//     grinding it pays a fat bonus and counts as its own gap. The park is
//     a puzzle, not a sandbox.

import { Vector3 } from '@babylonjs/core';

export type GoalKind = 'score' | 'combo' | 'gap' | 'collect';

export interface Goal {
  id: string;
  label: string;
  kind: GoalKind;
  target: number;             // points / combo pts / collectible count
  gapId?: string;             // for kind 'gap'
  done: boolean;
}

export interface GoalEvent {
  type: 'bank' | 'comboLanded' | 'gap' | 'collect';
  value?: number;             // bank pts / combo pts
  gapId?: string;
  collectibleId?: string;
}

export class GoalTracker {
  readonly goals: Goal[];
  private collected = new Set<string>();
  private gapsHit = new Set<string>();

  constructor(defs: Omit<Goal, 'done'>[]) {
    this.goals = defs.map((d) => ({ ...d, done: false }));
  }

  /** Feed a run event; returns goals completed by THIS event (for banners). */
  report(e: GoalEvent): Goal[] {
    const doneNow: Goal[] = [];
    if (e.type === 'collect' && e.collectibleId) this.collected.add(e.collectibleId);
    if (e.type === 'gap' && e.gapId) this.gapsHit.add(e.gapId);
    for (const g of this.goals) {
      if (g.done) continue;
      let hit = false;
      if (g.kind === 'score' && e.type === 'bank') hit = (e.value ?? 0) >= g.target;
      if (g.kind === 'combo' && e.type === 'comboLanded') hit = (e.value ?? 0) >= g.target;
      if (g.kind === 'gap' && e.type === 'gap') hit = this.gapsHit.has(g.gapId ?? '');
      if (g.kind === 'collect') hit = this.collected.size >= g.target;
      if (hit) { g.done = true; doneNow.push(g); }
    }
    return doneNow;
  }

  get doneCount(): number { return this.goals.filter((g) => g.done).length; }
  get allDone(): boolean { return this.goals.every((g) => g.done); }
}

// ── The moving rail gimmick ────────────────────────────────────────────────
/** Patrols between two points; its grind line endpoints follow, so the
 *  shared grind system can lock onto it in motion. */
export class MovingRail {
  t = 0;
  dir = 1;
  constructor(
    public a: Vector3, public b: Vector3,      // rail line (local)
    public from: Vector3, public to: Vector3,  // patrol endpoints
    public speed = 0.25,                        // patrol cycle speed
  ) {}

  update(dt: number): void {
    this.t += this.dir * this.speed * dt;
    if (this.t > 1) { this.t = 1; this.dir = -1; }
    if (this.t < 0) { this.t = 0; this.dir = 1; }
  }

  get offset(): Vector3 { return Vector3.Lerp(this.from, this.to, this.t); }
  /** Current world-space grind line (feed the Rider's line list per frame). */
  get line(): { a: Vector3; b: Vector3; bonus: number } {
    const o = this.offset;
    return { a: this.a.add(o), b: this.b.add(o), bonus: 300 };
  }

  /** Gap credit when a grind locks onto this rail in motion. */
  get gapId(): string { return 'moving_rail'; }
}

export const SKATE_GOALS: Omit<Goal, 'done'>[] = [
  { id: 'score5k', label: 'BANK 5,000 PTS', kind: 'score', target: 5000 },
  { id: 'combo800', label: 'LAND A 800+ COMBO', kind: 'combo', target: 800 },
  { id: 'gap_moving', label: 'GRIND THE PATROL RAIL', kind: 'gap', target: 1, gapId: 'moving_rail' },
  { id: 'coins10', label: 'COLLECT 10 COINS', kind: 'collect', target: 10 },
];
