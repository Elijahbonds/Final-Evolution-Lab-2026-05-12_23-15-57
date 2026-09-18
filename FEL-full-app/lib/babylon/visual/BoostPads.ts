// BoostPads — the course half of the boost economy (FINISH-RELEASE, 2026-09-14). Owner: the meter fills from skill
// "plus boost pads on the course".
//
// ONE ITEM (SHARD-PICKUP, owner 2026-09-16: "instead of floating bananas make it shards... the item needs to be
// uniform"). This drew two different things for one mechanic: a cyan chevron decal on the ground for boards and kart,
// and a fat unlit GOLD torus in the air for aero — and gold is the coin colour, so the aero pickup read as currency
// floating in the sky when it pays no currency at all. Now every mode shows the same cyan shard.
//
// The aero gate keeps its shape, because the shape is the gameplay: its radius is 7 m and a flyer passes THROUGH it,
// so a single solid crystal in the middle would be a thing to dodge rather than a gate to line up. The ring is built
// from shards instead — same mesh, same colour, arranged around the opening — and merged into one mesh so visibility,
// position and dispose all stay one object. Ground pads are a single shard hovering over the surface.
//
// A pad is a shard on the ground (boards, kart) or a ring of shards in the air (aero). Ride through it and it pays
// BOOST_PAD_FILL into the meter, flashes, and goes dark for RESPAWN_SEC so a pad is a line choice, not a tap you camp.
// Placement is the MODE's call (its course knows where a straight or a run-in is); this file only draws, pulses and
// detects. Unlit PBR, like every other marker on a PBR-lit venue.

import { Color3, Mesh, MeshBuilder, PBRMaterial, Vector3 } from '@babylonjs/core';
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
    for (const [i, s] of spots.entries()) {
      const spot: Required<BoostPadSpot> = { pos: s.pos.clone(), yaw: s.yaw ?? 0, kind: s.kind ?? 'pad', radius: s.radius ?? (s.kind === 'ring' ? 7 : 2.4) };
      const mat = new PBRMaterial(`boostPadMat${i}`, scene);
      mat.unlit = true;
      // ONE colour for the mechanic, and deliberately NOT gold: gold is what a coin is, and
      // a boost pickup pays no currency. Cyan was already the boost colour on five of the six.
      mat.albedoColor = Color3.FromHexString(color);
      mat.emissiveColor = mat.albedoColor.clone();
      mat.backFaceCulling = false;
      let mesh: Mesh;
      if (spot.kind === 'ring') {
        mesh = shardRing(scene, `boostRing${i}`, spot.radius * 0.8);
        mesh.rotation.set(0, spot.yaw, 0);
      } else {
        mesh = shard(scene, `boostPad${i}`, 0.9);
        mesh.rotation.y = spot.yaw;
        spot.pos.y += 0.9;    // hovers over the surface rather than lying on it
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
      // A crystal that hangs dead still reads as scenery; a slow turn says "take me".
      p.mesh.rotation.y += dt * (p.spot.kind === 'ring' ? 0.5 : 1.6);
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

/**
 * The pickup itself: an elongated octahedron — a crystal shard. One mesh shape for the whole
 * boost mechanic, on the ground and in the air, so a player learns it once.
 */
function shard(scene: Scene, name: string, height: number): Mesh {
  const m = MeshBuilder.CreatePolyhedron(name, { type: 1, size: height * 0.32 }, scene);
  m.scaling.set(1, 1.9, 1);          // stretch the octahedron into a crystal
  return m;
}

/**
 * The aero gate: shards stood around the opening rather than one crystal in the middle of it.
 * Merged into a single mesh so the pad bookkeeping (visibility, position, dispose) keeps
 * treating a gate as one object.
 */
function shardRing(scene: Scene, name: string, radius: number): Mesh {
  const COUNT = 10;
  const parts: Mesh[] = [];
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2;
    const s = shard(scene, `${name}_${i}`, 1.7);
    // stand the ring up: the shards ring the opening in the plane a flyer passes through
    s.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    s.rotation.z = a;                // points outward, so the ring reads as a rim
    parts.push(s);
  }
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (merged) { merged.name = name; return merged; }
  return parts[0];
}
