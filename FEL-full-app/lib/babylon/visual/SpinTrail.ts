// SPIN TRAILS (vis-board, visual wave 2, 2026-10-13) — Part B bigair: "Spin trails: a board-tip ribbon plus snow dust off the
// lip." A 720 off a kicker is a picture only while the spin is drawn: the body turns, the board turns with it, and nothing says
// how far. Two ribbons — one off the nose, one off the tail — are left in the air behind the board's tips while a trick is on, so
// a spin writes a spiral across the sky and a flat air writes two straight lines. Babylon's TrailMesh (a ribbon that samples its
// generator node every frame), one additive emissive material, one draw each. Off the ground and out of the run-up: `setActive`
// starts them at take-off (cleared, so no line joins the last landing to this lip) and stops and clears them at touchdown.
// Reduced motion leaves them off (they are streaks that follow a fast spin). Cosmetic only.

import { Color3, Engine, StandardMaterial, TransformNode, TrailMesh } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { motionPolicy } from '../../a11y/reducedMotion';
import { unlitDiffuse } from './unlit';

export const TRAIL_LENGTH = 34;
export const TIP_OFFSET_M = 0.44;

/** Pure: should the ribbons run? Only in the air, only while a trick is on, never under reduced motion. */
export function trailWanted(inAir: boolean, trickOn: boolean, flashOk: boolean): boolean { return inAir && trickOn && flashOk; }

export class SpinTrail {
  private tips: TransformNode[] = [];
  private trails: TrailMesh[] = [];
  private mat: StandardMaterial;
  private on = false;

  /** `board` is the board's mesh (or its root); the tips are anchored a board-half-length fore and aft of its centre. */
  constructor(scene: Scene, board: TransformNode, colorHex = '#7dd3fc') {
    this.mat = new StandardMaterial('spin_trail_m', scene);
    const c = Color3.FromHexString(colorHex);
    this.mat.emissiveColor = c; this.mat.diffuseColor = unlitDiffuse(); this.mat.specularColor = Color3.Black(); this.mat.disableLighting = true;
    this.mat.alpha = 0.55; this.mat.alphaMode = Engine.ALPHA_ADD; this.mat.backFaceCulling = false; this.mat.disableDepthWrite = true;
    for (const sign of [1, -1]) {
      const tip = new TransformNode(`spin_trail_tip_${sign > 0 ? 'nose' : 'tail'}`, scene);
      tip.parent = board; tip.position.set(0, 0.05, sign * TIP_OFFSET_M);
      const t = new TrailMesh(`spin_trail_${sign > 0 ? 'nose' : 'tail'}`, tip, scene, { diameter: 0.16, length: TRAIL_LENGTH, segments: 28, sections: 4, autoStart: false });
      t.material = this.mat; t.isPickable = false; t.setEnabled(false); t.receiveShadows = false;
      this.tips.push(tip); this.trails.push(t);
    }
  }

  /** Start (cleared) or stop (cleared) the ribbons. Idempotent. */
  setActive(on: boolean): void {
    if (on && !motionPolicy().flash) on = false;
    if (on === this.on) return;
    this.on = on;
    for (const t of this.trails) {
      if (on) { t.reset(); t.setEnabled(true); t.start(); }
      else { t.stop(); t.reset(); t.setEnabled(false); }
    }
  }

  get active(): boolean { return this.on; }

  dispose(): void {
    for (const t of this.trails) t.dispose();
    for (const n of this.tips) n.dispose();
    this.mat.dispose();
    this.trails = []; this.tips = [];
  }
}
