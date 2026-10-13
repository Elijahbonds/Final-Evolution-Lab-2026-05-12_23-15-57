// WEAPON TRAILS — the streak a blade or a staff leaves in the air (visual pass, lane/vis-combat, 2026-10-13).
//
// A weapon swing was a prop carried on a hand bone through a body clip: nothing said it was moving fast, or where it had
// been. A trail is the oldest read in a weapon fighter — a bright tapering streak behind the tip for the length of the swing
// and a beat after it. One TrailMesh per weapon, following a tip node on the prop; it is only drawn while the swing is fast
// (the end of the wind-up, the active window and a breath of recovery), so a held guard leaves nothing. The same unlit
// PBR trail pattern premium/BoostFx and racing/speedFx use. Colour is the fighter's: the player's blue against the rival's red.

import { Color3, PBRMaterial, TrailMesh, TransformNode } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';

export type TrailWeapon = 'blade' | 'staff' | 'gauntlet' | 'fists';

/** The look of each weapon's trail, as one table: width (m), length (samples), peak alpha, and where on the prop the tip is (prop-local y). */
export const TRAIL_LOOK: Record<TrailWeapon, { width: number; length: number; alpha: number; tipY: number } | null> = {
  blade:    { width: 0.1,  length: 22, alpha: 0.8,  tipY: 0.475 },
  staff:    { width: 0.15, length: 28, alpha: 0.7,  tipY: 0.9 },
  gauntlet: null,   // a fist: it leaves no streak (and a heavy glove's weight is read through the hit, not the air)
  fists: null,
};

/** The wind-up's last stretch the trail is already drawn for: the arm is at speed before the blow opens. */
export const TRAIL_LEAD_SEC = 0.14;

export type SwingPhase = 'startup' | 'active' | 'recovery' | 'done' | null;

/** Pure: is the swing fast enough to draw? `secToActive` is only read during the startup. */
export function trailWanted(phase: SwingPhase, secToActive = Infinity): boolean {
  if (phase === 'active') return true;
  if (phase === 'startup') return secToActive <= TRAIL_LEAD_SEC;
  return false;
}

/** Pure: the next strength of the trail (0..1): it rises in a few frames and falls over about a tenth of a second. */
export function trailStep(k: number, wanted: boolean, dt: number): number {
  const rate = wanted ? 22 : 11;
  const next = k + ((wanted ? 1 : 0) - k) * Math.min(1, dt * rate);
  return next < 0.01 ? 0 : Math.min(1, next);
}

export interface WeaponTrail {
  /** Call every frame: the swing's phase (null = not swinging) and, in the startup, the seconds to the active window. */
  drive(dt: number, phase: SwingPhase, secToActive?: number): void;
  /** Hold the trail on for a mode that only knows "is swinging". */
  driveSwinging(dt: number, swinging: boolean): void;
  dispose(): void;
}

/** A trail off the tip of `prop` (a mesh parented to a hand bone). Null when the weapon leaves none or the trail cannot be built. */
export function mountWeaponTrail(scene: Scene, prop: Mesh, weapon: TrailWeapon | string, hex: string, tipY?: number): WeaponTrail | null {
  const look = TRAIL_LOOK[weapon as TrailWeapon];
  if (!look) return null;
  let tip: TransformNode, trail: TrailMesh, mat: PBRMaterial;
  try {
    tip = new TransformNode(`${prop.name}_tip`, scene);
    tip.parent = prop; tip.position.set(0, tipY ?? look.tipY, 0);
    trail = new TrailMesh(`${prop.name}_trail`, tip, scene, { diameter: look.width, length: look.length, autoStart: true });
    const c = Color3.FromHexString(hex);
    mat = new PBRMaterial(`${prop.name}_trail_m`, scene);
    mat.unlit = true; mat.albedoColor = c; mat.emissiveColor = c; mat.alpha = 0; mat.backFaceCulling = false; mat.disableDepthWrite = true;
    mat.alphaMode = 1;   // additive: a streak of light, it brightens what it crosses
    trail.material = mat; trail.isPickable = false; trail.isVisible = false; trail.receiveShadows = false;
  } catch { return null; }
  let k = 0, gone = false;
  const apply = (): void => { trail.isVisible = k > 0.02; mat.alpha = look.alpha * k; };
  return {
    drive(dt, phase, secToActive) { if (gone) return; k = trailStep(k, trailWanted(phase, secToActive), dt); apply(); },
    driveSwinging(dt, swinging) { if (gone) return; k = trailStep(k, swinging, dt); apply(); },
    dispose() { if (gone) return; gone = true; trail.dispose(); mat.dispose(); tip.dispose(); },
  };
}
