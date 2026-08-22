// basketballTree — Mode 1 Phase 5: the basketball animation blend tree.
//
// One decision function, one wiring class. Every basketball state a live
// 1v1/3v3 player can be in maps to a clip + loop mode + fade time, so the
// blend tree reads the GAME (dribble/drive/gather/release/contact/defend),
// not just "run vs idle". All clip names resolve through clipResolver —
// the tree can never request a clip that doesn't exist (the test suite
// proves it against the live registry).
//
// FootPlant: plant-and-cut contact lock. When CourtMovement reports a
// plant, we capture the lead foot's world position and pin it with a
// two-bone IK controller for the plant window (~0.18s) while the body
// rotates around it — no foot-skate through the cut. Court is flat, so
// this is the whole IK scope for Mode 1 (deliberate).

import { Vector3, BoneIKController } from '@babylonjs/core';
import type { Mesh, Skeleton, TransformNode } from '@babylonjs/core';
import type { CharacterAnimator } from './CharacterAnimator';

// ── Blend tree ─────────────────────────────────────────────────────────────
export type BasketballAnimState =
  | 'idle_dribble' | 'speed_dribble' | 'crossover' | 'protect'
  | 'drive' | 'gather' | 'shot_release' | 'layup' | 'dunk'
  | 'contact_stagger' | 'defend_slide' | 'defend_idle' | 'box_out'
  | 'celebrate' | 'dejected';

export interface AnimTreeInput {
  speed01: number;
  crossover: boolean;
  nearestDefender: number;
  hasBall: boolean;
  shooting: boolean;
  dunking: boolean;
  driving: boolean;          // sprinting toward the hoop with the ball
  defending: boolean;        // possession === defense
  bracing: boolean;          // box-out held
  staggered: boolean;        // contact/ankle-break stun active
  celebrating?: boolean;
  dejected?: boolean;
}

export interface AnimChoice { state: BasketballAnimState; clip: string; loop: boolean; fadeSec: number }

const CLIP_FOR: Record<BasketballAnimState, { clip: string; loop: boolean; fadeSec: number }> = {
  idle_dribble:    { clip: 'idle_stand', loop: true, fadeSec: 0.18 },
  speed_dribble:   { clip: 'bball_dribble_run', loop: true, fadeSec: 0.14 },
  crossover:       { clip: 'football_juke_left', loop: false, fadeSec: 0.08 },
  protect:         { clip: 'bball_defend_stance', loop: true, fadeSec: 0.2 },
  drive:           { clip: 'run_forward', loop: true, fadeSec: 0.1 },
  gather:          { clip: 'dunk_charge_gather', loop: true, fadeSec: 0.08 },
  shot_release:    { clip: 'bball_shoot_jumper', loop: true, fadeSec: 0.06 },
  layup:           { clip: 'dunk_launch', loop: false, fadeSec: 0.08 },
  dunk:            { clip: 'dunk_launch', loop: false, fadeSec: 0.06 },
  contact_stagger: { clip: 'karate_hit_react', loop: false, fadeSec: 0.06 },
  defend_slide:    { clip: 'strafe_left', loop: true, fadeSec: 0.16 },
  defend_idle:     { clip: 'bball_defend_stance', loop: true, fadeSec: 0.2 },
  box_out:         { clip: 'bball_defend_stance', loop: true, fadeSec: 0.12 },
  celebrate:       { clip: 'bball_score_celebrate', loop: false, fadeSec: 0.15 },
  dejected:        { clip: 'football_tackled_fall', loop: false, fadeSec: 0.2 },
};

/** The single decision: game context in, clip choice out. Pure. */
export function chooseBasketballClip(i: AnimTreeInput): AnimChoice {
  let state: BasketballAnimState;
  if (i.staggered) state = 'contact_stagger';
  else if (i.dunking) state = 'dunk';
  else if (i.shooting) state = 'shot_release';
  else if (i.celebrating) state = 'celebrate';
  else if (i.dejected) state = 'dejected';
  else if (i.defending) {
    state = i.bracing ? 'box_out' : i.speed01 > 0.2 ? 'defend_slide' : 'defend_idle';
  } else if (i.crossover) state = 'crossover';
  else if (i.driving && i.hasBall) state = 'drive';
  else if (i.speed01 > 0.15) state = i.hasBall ? 'speed_dribble' : 'drive';
  else if (i.nearestDefender < 1.4 && i.hasBall) state = 'protect';
  else state = i.hasBall ? 'idle_dribble' : 'defend_idle';
  return { state, ...CLIP_FOR[state] };
}

/** Thin animator wiring: dedupes per-frame play() of the same state and
 *  applies the state's fade time. */
export class BasketballAnimTree {
  private current: BasketballAnimState | null = null;
  constructor(private animator: CharacterAnimator) {}
  update(input: AnimTreeInput): BasketballAnimState {
    const c = chooseBasketballClip(input);
    if (c.state !== this.current) {
      this.animator.play(c.clip, { loop: c.loop, fadeSec: c.fadeSec });
      this.current = c.state;
    }
    return c.state;
  }
  reset(): void { this.current = null; }
}

// ── Foot plant (two-bone IK contact lock) ──────────────────────────────────
export const PLANT_LOCK_SEC = 0.18;

export class FootPlant {
  private lock: { foot: 'Left' | 'Right'; target: TransformNode; left: number; ik: BoneIKController } | null = null;

  constructor(private skeleton: Skeleton, private mesh: Mesh) {}

  /** Which foot is planted (the one currently lower/forward) — captured at
   *  plant start so the cut rotates around a fixed contact point. */
  plant(sceneFootTarget: (name: string) => TransformNode): void {
    if (this.lock) return;
    const lf = this.skeleton.bones.find((b) => b.name === 'LeftFoot');
    const rf = this.skeleton.bones.find((b) => b.name === 'RightFoot');
    if (!lf || !rf) return;
    const ly = lf.getTransformNode()?.getAbsolutePosition().y ?? 0;
    const ry = rf.getTransformNode()?.getAbsolutePosition().y ?? 0;
    const side = ly <= ry ? 'Left' : 'Right';
    const footBone = side === 'Left' ? lf : rf;
    const footNode = footBone.getTransformNode();
    if (!footNode) return;
    const target = sceneFootTarget(`plantTarget_${side}`);
    target.position.copyFrom(footNode.getAbsolutePosition());
    // BoneIKController has no enabled flag — it applies on update() only.
    // We call update() each frame while the lock is held; on release the
    // animator's per-frame bone writes take back over (no snap-back needed).
    const ik = new BoneIKController(this.mesh, footBone, { targetMesh: target as never, poleTargetMesh: undefined });
    this.lock = { foot: side, target, left: PLANT_LOCK_SEC, ik };
  }

  /** Advance; applies the IK pin and releases when the plant window ends. */
  update(dt: number): void {
    if (!this.lock) return;
    this.lock.ik.update();
    this.lock.left -= dt;
    if (this.lock.left <= 0) this.release();
  }

  release(): void {
    if (!this.lock) return;
    this.lock.target.dispose();
    this.lock = null;
  }

  get active(): boolean { return this.lock !== null; }
  dispose(): void { this.release(); }
}
