// SWING TRAIL (vis-court, wave 2, 2026-10-13) — the streak a racket, a bat or a club leaves in the air.
//
// The audit's tennis item ("a racquet swoosh trail (TrailMesh on the racquet tip)") and the derby's ("a bat swing trail"). One
// TrailMesh following a tip node, drawn only while the swing is fast: it rises in a few frames, holds through the swing and
// falls over about a tenth of a second, so a ready stance leaves nothing. Additive and unlit (a streak of light brightens what
// it crosses), never a shadow caster. The same shape as the combat weapon trail, written here so the court modes import
// nothing from the combat folder. Visual only; it reads a boolean and a node.

import { Color3, Engine, StandardMaterial, TrailMesh, TransformNode } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

/** Pure: the next strength of the trail (0..1). Rises fast (22/s), falls slower (11/s); under 1 % it is off. */
export function swingTrailStep(k: number, swinging: boolean, dt: number): number {
  const rate = swinging ? 22 : 11;
  const next = k + ((swinging ? 1 : 0) - k) * Math.min(1, dt * rate);
  return next < 0.01 ? 0 : Math.min(1, next);
}

export interface SwingTrailHandle {
  /** Every frame: is the swing live. */
  drive(dt: number, swinging: boolean): void;
  readonly strength: number;
  dispose(): void;
}

export interface SwingTrailOpts { color: string; width: number; length: number; alpha: number; name: string }

/** A trail off `tip` (a transform on the racket head / the bat's barrel end / the club head). Null when it cannot be built. */
export function mountSwingTrail(scene: Scene, tip: TransformNode, o: SwingTrailOpts): SwingTrailHandle | null {
  let trail: TrailMesh, mat: StandardMaterial;
  try {
    const c = Color3.FromHexString(o.color);
    trail = new TrailMesh(`fel_decal_trail_${o.name}`, tip, scene, o.width, o.length, true);
    mat = new StandardMaterial(`fel_decal_trail_${o.name}_m`, scene);
    mat.disableLighting = true; mat.emissiveColor = c; mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black();
    mat.alpha = 0; mat.backFaceCulling = false; mat.alphaMode = Engine.ALPHA_ADD;
    trail.material = mat; trail.isPickable = false; trail.isVisible = false; trail.receiveShadows = false;
  } catch { return null; }
  let k = 0, gone = false;
  return {
    drive(dt, swinging) {
      if (gone) return;
      k = swingTrailStep(k, swinging, dt);
      trail.isVisible = k > 0.02; mat.alpha = o.alpha * k;
    },
    get strength() { return k; },
    dispose() { if (gone) return; gone = true; trail.dispose(); mat.dispose(); },
  };
}

/**
 * A tip node that rides `ext` metres past a hand along the forearm's line (a racket's head, a club's), updated after every
 * animation writer so it is where the body was drawn. The hand and forearm are the rig's bone nodes (the mode finds them).
 */
export function followTip(scene: Scene, hand: TransformNode, fore: TransformNode, ext: number, name: string): { tip: TransformNode; dispose(): void } {
  const tip = new TransformNode(`fel_decal_tip_${name}`, scene);
  const obs = scene.onAfterAnimationsObservable.add(() => {
    const h = hand.getAbsolutePosition(), f = fore.getAbsolutePosition();
    const dx = h.x - f.x, dy = h.y - f.y, dz = h.z - f.z, l = Math.hypot(dx, dy, dz) || 1;
    tip.position.set(h.x + dx / l * ext, h.y + dy / l * ext, h.z + dz / l * ext);
  });
  return { tip, dispose() { scene.onAfterAnimationsObservable.remove(obs); tip.dispose(); } };
}
