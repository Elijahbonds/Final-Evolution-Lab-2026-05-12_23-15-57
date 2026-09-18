// KART DRESSING — the kerbs and the obstacles, resolved off the racing line.
//
// kartCircuits declares WHERE these are as distance-along-the-lap plus a sideways offset, which is the only form
// that survives a course being reshaped: move a line point and the kerbs and barrels move with it, because none of
// them know their own coordinates. This module turns those declarations into world positions once, at mount.
//
// OBSTACLES ARE A CHOICE, NOT A TAX. Every one is placed off the racing line and inside the road, so the fast line
// is always clear and an obstacle is something you are choosing to risk when you take a wider or tighter line than
// the ideal one. An obstacle ON the line would be a wall with extra steps, and kartCircuits.test.ts asserts none of
// them is within 2 m of the centre.
//
// Two families, because they answer different questions:
//   SOLID   barrel, cone, crate, planter — hitting one scrubs speed and breaks the rear loose. The cost is the
//           time you lose, not a respawn: a race that stops for a cone is not a race.
//   SURFACE puddle, gravel — no impact at all, but grip falls while you are in them, so a corner taken through
//           gravel slides whether you asked it to or not. This is the one place the grip floor is allowed to be
//           broken, because the player drove into it.
//
// Pure placement and hit-testing here; the mesh building takes a scene and is the only part that does.

import { Color3, MeshBuilder, PBRMaterial, TransformNode, type Mesh, type Scene, Vector3 } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import type { KartCircuit, KartObstacle } from './kartCircuits';
import { pointAlong } from './racingLine';

export type ObstacleFamily = 'solid' | 'surface';

export interface PlacedObstacle {
  kind: KartObstacle['kind'];
  family: ObstacleFamily;
  pos: Vector3;
  /** Collision radius, metres. */
  radius: number;
  /** Solid: fraction of speed kept on contact. Surface: grip multiplier while inside. */
  effect: number;
}

const SPEC: Record<KartObstacle['kind'], { family: ObstacleFamily; radius: number; effect: number; color: string }> = {
  // a cone is the cheap one — clip it and you lose a little; a planter is the one you do not want to meet
  cone: { family: 'solid', radius: 0.7, effect: 0.82, color: '#ff7a3d' },
  barrel: { family: 'solid', radius: 0.9, effect: 0.7, color: '#e8e4d8' },
  crate: { family: 'solid', radius: 1.1, effect: 0.62, color: '#9a6b3f' },
  planter: { family: 'solid', radius: 1.4, effect: 0.45, color: '#4a6b3a' },
  // no impact, but the road stops holding you
  puddle: { family: 'surface', radius: 3.4, effect: 0.55, color: '#4a6b86' },
  gravel: { family: 'surface', radius: 4.0, effect: 0.4, color: '#8d8375' },
};

export function placeObstacles(circuit: KartCircuit): PlacedObstacle[] {
  return circuit.obstacles.map((o) => {
    const at = pointAlong(circuit.line, o.dist);
    const spec = SPEC[o.kind];
    return {
      kind: o.kind,
      family: spec.family,
      pos: at.pos.add(at.right.scale(o.lateral)),
      radius: spec.radius,
      effect: spec.effect,
    };
  });
}

export interface ObstacleContact {
  hit: PlacedObstacle | null;
  /** Solid contact: speed multiplier to apply once. 1 when nothing was hit. */
  impact: number;
  /** Surface: grip multiplier for this frame. 1 on clean road. */
  grip: number;
}

const CLEAN: ObstacleContact = { hit: null, impact: 1, grip: 1 };

/**
 * What the kart is touching this frame.
 *
 * A solid contact is reported ONCE — the caller passes what it already hit so a barrel cannot scrub the same kart
 * sixty times a second while it is resting against it, which is how a single clip becomes a dead stop.
 */
export function obstacleContact(
  placed: readonly PlacedObstacle[],
  pos: { x: number; z: number },
  kartRadius = 1.1,
  alreadyHit: PlacedObstacle | null = null,
): ObstacleContact {
  let grip = 1;
  let solid: PlacedObstacle | null = null;

  for (const o of placed) {
    const d = Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z);
    if (d > o.radius + kartRadius) continue;
    if (o.family === 'surface') grip = Math.min(grip, o.effect);
    else if (!solid && o !== alreadyHit) solid = o;
  }

  if (!solid && grip === 1) return CLEAN;
  return { hit: solid, impact: solid ? solid.effect : 1, grip };
}

/** Still resting against the thing we just hit? Used to hold the once-only rule open. */
export function stillTouching(
  o: PlacedObstacle | null, pos: { x: number; z: number }, kartRadius = 1.1,
): boolean {
  if (!o) return false;
  return Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z) <= o.radius + kartRadius + 0.5;
}

// ── meshes ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Kerbs on the apex of every corner the geometry found.
 *
 * kartCircuits derives these from the measured radius rather than from anybody's judgement, so a course reshaped
 * later gets its kerbs moved for free — and a corner that stops being a corner loses its kerb without a human
 * noticing it should.
 */
export function buildKerbs(scene: Scene, circuit: KartCircuit): TransformNode {
  const root = new TransformNode(`kart_kerbs_${circuit.course.id}`, scene);
  const red = VenueKit.paint(scene, 'kart_kerb_red', '#c8412f', 0.04, 0.7) as PBRMaterial;
  const white = VenueKit.paint(scene, 'kart_kerb_white', '#e9edf2', 0.04, 0.7) as PBRMaterial;

  for (const kerb of circuit.kerbs) {
    const len = kerb.to - kerb.from;
    const blocks = Math.max(2, Math.round(len / 3));
    for (let i = 0; i < blocks; i++) {
      const at = pointAlong(circuit.line, kerb.from + (i / blocks) * len);
      const slab = MeshBuilder.CreateBox(`kerb_${kerb.from}_${i}`, { width: 1.4, height: 0.14, depth: 3 }, scene);
      slab.position.copyFrom(at.pos.add(at.right.scale(kerb.side * (circuit.halfWidth + 0.7))));
      slab.position.y = at.pos.y + 0.07;
      slab.rotation.y = Math.atan2(at.tangent.x, at.tangent.z);
      slab.material = i % 2 ? white : red;
      slab.isPickable = false;
      slab.parent = root;
    }
  }
  return root;
}

export function buildObstacles(scene: Scene, placed: readonly PlacedObstacle[], id: string): TransformNode {
  const root = new TransformNode(`kart_obstacles_${id}`, scene);
  placed.forEach((o, i) => {
    const spec = SPEC[o.kind];
    let m: Mesh;
    if (o.family === 'surface') {
      m = MeshBuilder.CreateDisc(`obs_${i}`, { radius: o.radius, tessellation: 20 }, scene);
      m.rotation.x = Math.PI / 2;
      m.position.set(o.pos.x, o.pos.y + 0.03, o.pos.z);
    } else if (o.kind === 'cone') {
      m = MeshBuilder.CreateCylinder(`obs_${i}`, { diameterTop: 0.05, diameterBottom: o.radius * 1.5, height: 0.8, tessellation: 10 }, scene);
      m.position.set(o.pos.x, o.pos.y + 0.4, o.pos.z);
    } else if (o.kind === 'barrel') {
      m = MeshBuilder.CreateCylinder(`obs_${i}`, { diameter: o.radius * 1.7, height: 1.1, tessellation: 12 }, scene);
      m.position.set(o.pos.x, o.pos.y + 0.55, o.pos.z);
    } else {
      const h = o.kind === 'planter' ? 0.9 : 1.0;
      m = MeshBuilder.CreateBox(`obs_${i}`, { width: o.radius * 1.8, height: h, depth: o.radius * 1.8 }, scene);
      m.position.set(o.pos.x, o.pos.y + h / 2, o.pos.z);
    }
    const mat = VenueKit.paint(scene, `obs_mat_${o.kind}`, spec.color, 0.05, 0.8) as PBRMaterial;
    if (o.family === 'surface') { mat.alpha = 0.72; mat.emissiveColor = Color3.FromHexString(spec.color).scale(0.06); }
    m.material = mat;
    m.isPickable = false;
    m.receiveShadows = o.family !== 'surface';
    m.parent = root;
  });
  return root;
}
