// BoostPads — the course half of the boost economy (FINISH-RELEASE, 2026-09-14). Owner: the meter fills from skill
// "plus boost pads on the course".
//
// A pad is a glowing chevron on the ground (boards, kart) or a gold ring in the air (aero). Ride through it and it pays
// BOOST_PAD_FILL into the meter, flashes, and goes dark for RESPAWN_SEC so a pad is a line choice, not a tap you camp.
// Placement is the MODE's call (its course knows where a straight or a run-in is); this file only draws, pulses and
// detects. Unlit PBR, like every other marker on a PBR-lit venue.

import { Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import type { BoostKit } from '../core/BoostKit';
import { SoundKit } from '../audio/SoundKit';

export const BOOST_PAD_RESPAWN_SEC = 6;

export interface BoostPadSpot {
  pos: Vector3;
  /** Heading the chevrons point along (radians, 0 = +z). */
  yaw?: number;
  /** 'pad' lies on the ground; 'ring' stands up for a flyer to pass through. */
  kind?: 'pad' | 'ring';
  /** Pickup radius, metres. */
  radius?: number;
}

interface Pad { spot: Required<BoostPadSpot>; mesh: Mesh; mat: PBRMaterial; cooldown: number }

export class BoostPads {
  private pads: Pad[] = [];
  private t = 0;

  constructor(private scene: Scene, spots: BoostPadSpot[], color = '#22d3ee') {
    const tex = chevronTexture(scene);
    for (const [i, s] of spots.entries()) {
      const spot: Required<BoostPadSpot> = { pos: s.pos.clone(), yaw: s.yaw ?? 0, kind: s.kind ?? 'pad', radius: s.radius ?? (s.kind === 'ring' ? 7 : 2.4) };
      const mat = new PBRMaterial(`boostPadMat${i}`, scene);
      mat.unlit = true;
      mat.albedoColor = Color3.FromHexString(spot.kind === 'ring' ? '#ffd75e' : color);
      mat.emissiveColor = mat.albedoColor.clone();
      mat.backFaceCulling = false;
      let mesh: Mesh;
      if (spot.kind === 'ring') {
        mesh = MeshBuilder.CreateTorus(`boostRing${i}`, { diameter: spot.radius * 1.6, thickness: 0.6, tessellation: 32 }, scene);
        mesh.rotation.set(Math.PI / 2, spot.yaw, 0);
      } else {
        mesh = MeshBuilder.CreateGround(`boostPad${i}`, { width: 2.6, height: 3.4 }, scene);
        mat.albedoTexture = tex; mat.opacityTexture = tex; mat.useAlphaFromAlbedoTexture = true;
        mesh.rotation.y = spot.yaw;
        spot.pos.y += 0.04;   // just above the surface, never z-fighting it
      }
      mesh.material = mat;
      mesh.position.copyFrom(spot.pos);
      mesh.isPickable = false;
      this.pads.push({ spot, mesh, mat, cooldown: 0 });
    }
  }

  /** Every frame: pulse the live pads, count down the spent ones, and pay the meter for a pass. Returns pads taken. */
  update(dt: number, riderPos: Vector3, boost: BoostKit): number {
    this.t += dt;
    let taken = 0;
    for (const p of this.pads) {
      if (p.cooldown > 0) {
        p.cooldown = Math.max(0, p.cooldown - dt);
        p.mesh.visibility = p.cooldown > 0 ? 0.15 : 1;
        continue;
      }
      const pulse = 0.75 + 0.25 * Math.sin(this.t * 6 + p.spot.pos.x);
      p.mesh.visibility = pulse;
      const d = p.spot.kind === 'ring' ? Vector3.Distance(riderPos, p.spot.pos) : Math.hypot(riderPos.x - p.spot.pos.x, riderPos.z - p.spot.pos.z);
      const vertOk = p.spot.kind === 'ring' || Math.abs(riderPos.y - p.spot.pos.y) < 2.5;
      if (d <= p.spot.radius && vertOk) {
        boost.pad();
        p.cooldown = BOOST_PAD_RESPAWN_SEC;
        taken++;
        SoundKit.play('powerUp', { pitch: 1.3, volume: 0.6 });
      }
    }
    return taken;
  }

  get count(): number { return this.pads.length; }

  /** Move pad `i` (a course that moves — surf's pads ride the wave with the pocket). */
  place(i: number, pos: Vector3): void {
    const p = this.pads[i]; if (!p) return;
    p.spot.pos.copyFrom(pos);
    if (p.spot.kind === 'pad') p.spot.pos.y += 0.04;
    p.mesh.position.copyFrom(p.spot.pos);
  }

  dispose(): void {
    for (const p of this.pads) { p.mesh.dispose(); p.mat.dispose(); }
    this.pads = [];
  }
}

let chevron: WeakMap<Scene, DynamicTexture> = new WeakMap();
function chevronTexture(scene: Scene): DynamicTexture {
  const hit = chevron.get(scene); if (hit) return hit;
  const tex = new DynamicTexture('boostChevron', { width: 128, height: 168 }, scene, true);
  const g = tex.getContext() as CanvasRenderingContext2D;
  g.clearRect(0, 0, 128, 168);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(6, 6, 116, 156);
  g.strokeStyle = 'white'; g.lineWidth = 14; g.lineJoin = 'round';
  for (const y of [120, 80, 40]) { g.beginPath(); g.moveTo(20, y + 22); g.lineTo(64, y - 10); g.lineTo(108, y + 22); g.stroke(); }
  tex.hasAlpha = true; tex.update();
  chevron.set(scene, tex);
  scene.onDisposeObservable.addOnce(() => { chevron.delete(scene); });
  return tex;
}
