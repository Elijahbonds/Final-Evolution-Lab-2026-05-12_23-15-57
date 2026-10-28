// LobMarker — DUNK-FLAGSHIP (b), the owner's "better lobs" (playtest 2026-10-27). Visual only: never moves the ball, the catch or
// the slam window.
//
// A lob had nothing that said where it was going: the ball flew in from off-frame or straight up, and the catch either happened
// or was LOST. Two quiet reads, both on the ball's own geometry:
//   · THE CATCH RING — a thin ring at the point the throw is aimed at (where the ball hand will be on the catch beat). It fades in
//     while the ball is in the air and tightens as the ball closes on it, so the eye learns where to meet it; on the catch it
//     flashes and opens out, on a lost lob it drops away.
//   · THE BALL'S SHADOW — a soft dark disc on the floor straight under the ball, smaller and stronger as the ball comes down
//     (the oldest read for "where will it land" there is; Babylon's shadow map does not draw a fast small ball well at phone tier).
// Two meshes, two unlit materials, built once and hidden between lobs (zero per-frame allocation).
import { Color3, Mesh, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

/** The ring's look: its radius, how long the catch flash and the drop take (s). */
export const LOB_RING_RADIUS = 0.32, LOB_RING_POP_SEC = 0.28;
/** The shadow's radius at the floor and at 4 m up, and its strongest alpha. */
export const LOB_SHADOW_NEAR = 0.16, LOB_SHADOW_FAR = 0.34, LOB_SHADOW_ALPHA = 0.45;

/** The ring's scale and alpha for a ball `distM` from the catch point (the closer, the tighter and brighter). */
export function ringRead(distM: number): { scale: number; alpha: number } {
  const k = Math.min(1, Math.max(0, distM / 4));
  return { scale: 0.75 + 0.6 * k, alpha: 0.85 - 0.45 * k };
}
/** The shadow's radius and alpha for a ball `heightM` over the floor. */
export function shadowRead(heightM: number): { radius: number; alpha: number } {
  const k = Math.min(1, Math.max(0, heightM / 4));
  return { radius: LOB_SHADOW_NEAR + (LOB_SHADOW_FAR - LOB_SHADOW_NEAR) * k, alpha: LOB_SHADOW_ALPHA * (1 - 0.6 * k) };
}

export class LobMarker {
  private readonly ring: Mesh;
  private readonly shadow: Mesh;
  private readonly ringMat: StandardMaterial;
  private readonly shadowMat: StandardMaterial;
  private readonly target = new Vector3();
  private live = false;
  private pop = -1; private popCaught = false;

  constructor(scene: Scene) {
    this.ring = MeshBuilder.CreateTorus('lob_catch_ring', { diameter: LOB_RING_RADIUS * 2, thickness: 0.025, tessellation: 32 }, scene);
    this.ringMat = new StandardMaterial('lob_catch_ring_m', scene);
    this.ringMat.emissiveColor = Color3.FromHexString('#FFE3A3'); this.ringMat.disableLighting = true; this.ringMat.diffuseColor = Color3.Black();
    this.ring.material = this.ringMat; this.ring.isPickable = false; this.ring.isVisible = false;
    this.shadow = MeshBuilder.CreateDisc('lob_ball_shadow', { radius: 1, tessellation: 20 }, scene);
    this.shadow.rotation.x = Math.PI / 2;
    this.shadowMat = new StandardMaterial('lob_ball_shadow_m', scene);
    this.shadowMat.emissiveColor = Color3.Black(); this.shadowMat.diffuseColor = Color3.Black(); this.shadowMat.disableLighting = true; this.shadowMat.backFaceCulling = false;
    this.shadow.material = this.shadowMat; this.shadow.isPickable = false; this.shadow.isVisible = false;
  }

  /** A lob left the hand (or was re-aimed): the ring goes where it is aimed. */
  aim(at: Vector3): void { this.target.copyFrom(at); this.live = true; this.pop = -1; }
  /** The lob ended: caught (the ring flashes open) or lost (it drops away). */
  end(caught: boolean): void { if (!this.live) return; this.live = false; this.pop = 0; this.popCaught = caught; this.shadow.isVisible = false; }
  /** Nothing left of it (a reset between attempts). */
  clear(): void { this.live = false; this.pop = -1; this.ring.isVisible = false; this.shadow.isVisible = false; }

  /** Every frame: `ball` world position and the floor's height under it. `faceYaw` turns the ring's open face toward the runway. */
  update(dt: number, ball: Vector3, floorY: number, faceYaw: number): void {
    if (this.live) {
      const r = ringRead(Vector3.Distance(ball, this.target));
      this.ring.isVisible = true; this.ring.position.copyFrom(this.target);
      this.ring.rotation.set(Math.PI / 2, faceYaw, 0);   // stood up, facing the dunker's run
      this.ring.scaling.setAll(r.scale); this.ringMat.alpha = r.alpha;
      const h = Math.max(0, ball.y - floorY), s = shadowRead(h);
      this.shadow.isVisible = true; this.shadow.position.set(ball.x, floorY + 0.012, ball.z);
      this.shadow.scaling.set(s.radius, s.radius, 1); this.shadowMat.alpha = s.alpha;
      return;
    }
    if (this.pop >= 0) {
      this.pop += dt; const u = Math.min(1, this.pop / LOB_RING_POP_SEC);
      this.ring.isVisible = u < 1;
      if (this.popCaught) { this.ring.scaling.setAll(0.75 + 1.1 * u); this.ringMat.alpha = 0.95 * (1 - u); }
      else { this.ring.position.y = this.target.y - 0.6 * u * u; this.ringMat.alpha = 0.5 * (1 - u); }
      if (u >= 1) this.pop = -1;
    }
  }

  dispose(): void { this.ring.dispose(); this.shadow.dispose(); this.ringMat.dispose(); this.shadowMat.dispose(); }
}
