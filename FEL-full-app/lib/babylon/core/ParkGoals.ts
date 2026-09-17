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

import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';

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
/**
 * Where the Venice plaza's golden patrol rail lives (ANIM-SURGICAL, 2026-09-14 — the eye's skate H3 "grind still
 * unlocked", GOALS 0/4). It lay along X and patrolled along Z, straight across the line every run starts on: the skater
 * spawns at (0, 0, −16) rolling +z, so riding AT the goal rail crossed it, and the rail magnet refuses a run that points
 * across a rail by design (RailMagnet `across`, |cos| < 0.34 — crossing a rail still crosses it). VENICE-SKATE-THPS proved
 * a lock only from the rail's own axis and wrote down that head-on was a layout change. This is that change, the THPS
 * one: the goal rail lies DOWN the natural line, between the spawn and the first funbox, and it is the rail that moves —
 * patrolling across the line, so the skill is still timing the pop onto a moving bar.
 */
export const VENICE_PATROL_RAIL = {
  /** The skater's spawn and its opening run (SkateRunMode.buildRig). */
  spawn: new Vector3(0, 0, -16), run: new Vector3(0, 0, 1),
  /** The bar, local: 5 m down +z at 0.5 m. */
  a: new Vector3(0, 0.5, -2.5), b: new Vector3(0, 0.5, 2.5),
  /** The patrol, across the line and inside the 2 m magnet at both ends: 6.5 m in front of the spawn (clear of the funbox at z −5.4). */
  from: new Vector3(-1.6, 0, -9.5), to: new Vector3(1.6, 0, -9.5),
  speed: 0.18,
} as const;

export class MovingRail {
  t = 0;
  dir = 1;
  constructor(
    public a: Vector3, public b: Vector3,      // rail line (local)
    public from: Vector3, public to: Vector3,  // patrol endpoints
    public speed = 0.25,                        // patrol cycle speed
  ) {}

  /** The rail the player can actually see. Built by mount(). */
  private mesh: AbstractMesh | null = null;

  /**
   * Give the patrol rail a body.
   *
   * It did not have one. This class was pure maths -- a grind line that slides
   * back and forth and pays a bonus -- while one of the four run goals is
   * "GRIND THE PATROL RAIL". The player was being asked to find, approach and
   * grind an object that was not drawn. That is the World-Population
   * Protocol's L2 failure exactly, and worse than the ball-rack case it cites:
   * there the state was at least visible in the HUD.
   *
   * Deliberately gold rather than the plaza's white: it is the goal object, so
   * it should read as different from the five ordinary rails at a glance.
   */
  mount(scene: Scene): AbstractMesh {
    const len = Vector3.Distance(this.a, this.b);
    const rail = MeshBuilder.CreateCylinder('rail_patrol', { diameter: 0.13, height: len }, scene);
    const d = this.b.subtract(this.a);
    rail.rotation.x = Math.PI / 2 - Math.atan2(d.y, Math.hypot(d.x, d.z));
    rail.rotation.y = Math.atan2(d.x, d.z);
    const m = new StandardMaterial('railPatrolM', scene);
    m.diffuseColor = Color3.FromHexString('#f2b73d');
    m.emissiveColor = Color3.FromHexString('#3a2a08');   // catches the eye while it slides
    rail.material = m;
    this.mesh = rail;
    this.syncMesh();
    return rail;
  }

  private syncMesh(): void {
    if (!this.mesh) return;
    this.mesh.position = Vector3.Center(this.a, this.b).add(this.offset);
  }

  update(dt: number): void {
    this.t += this.dir * this.speed * dt;
    if (this.t > 1) { this.t = 1; this.dir = -1; }
    if (this.t < 0) { this.t = 0; this.dir = 1; }
    this.syncMesh();
  }

  dispose(): void { this.mesh?.dispose(); this.mesh = null; }

  get offset(): Vector3 { return Vector3.Lerp(this.from, this.to, this.t); }
  /**
   * Current world-space grind line (feed the Rider's line list per frame).
   *
   * ONE object, mutated in place (VENICE-SKATE-THPS, 2026-09-09). This used to return a fresh literal on every read,
   * and the mode re-reads it every frame — so the line the Rider locked onto was, one frame later, an object that no
   * longer appeared in the world's list at all. Identifying the patrol rail by `indexOf` therefore always failed, and
   * the run goal it exists for ("GRIND THE PATROL RAIL") could not tick even when the grind was real. The line carries
   * its own `gapId` now, so the lock handler reads the credit off the rail it caught.
   */
  private readonly liveLine = { a: Vector3.Zero(), b: Vector3.Zero(), bonus: 300, gapId: 'moving_rail' };
  get line(): { a: Vector3; b: Vector3; bonus: number; gapId: string } {
    const o = this.offset;
    this.a.addToRef(o, this.liveLine.a);
    this.b.addToRef(o, this.liveLine.b);
    return this.liveLine;
  }

  /** Gap credit when a grind locks onto this rail in motion. */
  get gapId(): string { return 'moving_rail'; }
}

export const SKATE_GOALS: Omit<Goal, 'done'>[] = [
  { id: 'score5k', label: 'BANK 5,000 PTS', kind: 'score', target: 5000 },
  { id: 'combo800', label: 'LAND A 800+ COMBO', kind: 'combo', target: 800 },
  { id: 'gap_moving', label: 'GRIND THE PATROL RAIL', kind: 'gap', target: 1, gapId: 'moving_rail' },
  { id: 'coins10', label: 'COLLECT 10 COINS', kind: 'collect', target: 10 },
  // BOARD-10PHASE P8: the plaza's three signature features. SKATE-PLAZA built them and nothing pointed at them —
  // a park with fourteen rails and four goals is a park where ten rails are scenery.
  { id: 'gap_hubba', label: 'GRIND THE PYRAMID HUBBA', kind: 'gap', target: 1, gapId: 'plaza_hubba' },
  { id: 'gap_flatbar', label: 'GRIND THE BAR OVER THE GAP', kind: 'gap', target: 1, gapId: 'plaza_gap' },
  { id: 'gap_wallride', label: 'GRIND THE WALLRIDE LIP', kind: 'gap', target: 1, gapId: 'plaza_wallride' },
];
