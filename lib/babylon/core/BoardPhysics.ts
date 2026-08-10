// BoardPhysics — Mode 3 Phase 2: the shared rider+board physics foundation.
//
// The board is an ATTACHED PROP (parented to the rider root, posed by the
// animation state) — never an independently simulated rigid body that
// fights the rider's pose (the Gate 0 contract). The physics that matter
// for a board sport live HERE, on the rider unit:
//
//   SlopeResponse — ground normal sampling: gravity projects along the
//     slope (speed builds downhill, bleeds uphill), carve edge hold varies
//     with slope angle. Turns a flat raycast rider into terrain-aware
//     riding — the same math serves concrete transitions, pistes, and the
//     wave face.
//   BalanceModel — center-of-mass lean: rider lean offsets the contact
//     patch; too much lean at speed = instability (wobble), which the
//     landing/bail system (Phase 6) escalates. Weight distribution is a
//     readable input, not a hidden stat.
//   BoardSync — the prop-attachment contract + the desync guard: board
//     transform is derived from the rider root every frame; a test proves
//     the pair can never drift.
//
// Kinematic-by-design: board sports have no player-vs-player contact
// (Havok owns that in basketball/combat); what boards need is exact,
// responsive, provable terrain response — raycast + this model.

import { Vector3, Ray } from '@babylonjs/core';
import type { AbstractMesh, Scene, TransformNode } from '@babylonjs/core';

// ── Slope response ─────────────────────────────────────────────────────────
export interface SlopeInfo {
  normal: Vector3;
  /** signed downhill acceleration along current facing (m/s²) */
  gravityAlongSlope: number;
  steepness01: number;         // 0 = flat, 1 = vertical
}

/** Sample the ground under the rider: normal + slope response for the
 *  current facing direction. Falls back to flat when no hit. */
export function sampleSlope(
  scene: Scene, pos: Vector3, facingYaw: number, ground: AbstractMesh[],
): SlopeInfo {
  const up = pos.add(new Vector3(0, 1.2, 0));
  const ray = new Ray(up, new Vector3(0, -1, 0), 4);
  const hit = scene.pickWithRay(ray, (m) => ground.includes(m as AbstractMesh));
  const normal = hit?.getNormal(true, true) ?? Vector3.Up();
  const n = normal.normalize();
  const steep = 1 - Math.max(-1, Math.min(1, Vector3.Dot(n, Vector3.Up())));
  // project gravity onto the slope plane, take the component along facing
  const g = new Vector3(0, -9.81, 0);
  const alongPlane = g.subtract(n.scale(Vector3.Dot(g, n)));
  const fwd = new Vector3(Math.sin(facingYaw), 0, Math.cos(facingYaw));
  return { normal: n, gravityAlongSlope: Vector3.Dot(alongPlane, fwd), steepness01: steep };
}

// ── Balance model ──────────────────────────────────────────────────────────
export class BalanceModel {
  /** -1 (heels) .. +1 (toes); 0 = centered. */
  lean = 0;
  /** accumulated instability 0..1 — wobble builds from hard leans at speed
   *  and sketchy events; decays when centered. Landing/bail reads this. */
  instability = 0;

  update(dt: number, leanInput: number, speed01: number): void {
    // lean tracks input with inertia (weight shift is not instant)
    this.lean += (leanInput - this.lean) * Math.min(1, 8 * dt);
    const strain = Math.abs(this.lean) * speed01;
    if (strain > 0.55) this.instability = Math.min(1, this.instability + (strain - 0.55) * 1.6 * dt);
    else this.instability = Math.max(0, this.instability - 0.8 * dt);
  }

  /** External wobble kick (rough ground, clipped landing). */
  kick(amount: number): void { this.instability = Math.min(1, this.instability + amount); }

  get wobbling(): boolean { return this.instability > 0.45; }
  get critical(): boolean { return this.instability > 0.9; }   // about to wash out
}

// ── Board prop sync contract ───────────────────────────────────────────────
/** Derives the board prop's local pose from the rider root every frame.
 *  The board can NEVER drift from the rider: its world transform is a pure
 *  function of the root + the ride pose (carve lean, grab tweaks). */
export class BoardSync {
  constructor(private board: TransformNode, private riderRoot: TransformNode) {}

  update(lean: number, airborne: boolean): void {
    this.board.position.set(0, 0.03, 0);
    this.board.rotation.set(airborne ? 0 : 0, 0, -lean * 0.22);
    // parent is the rider root — position is local, so the pair is synced
    // by construction. This guard exists so a future refactor that re-
    // parents the board fails loudly here instead of shipping a desync.
    if (this.board.parent !== this.riderRoot) {
      throw new Error('[FEL-BOARD] board prop detached from rider root — desync risk, refusing to run');
    }
  }
}
