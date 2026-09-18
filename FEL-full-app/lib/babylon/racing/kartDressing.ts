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

import { Color3, Mesh, MeshBuilder, PBRMaterial, TransformNode, type Scene, Vector3, Matrix, Quaternion } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import type { KartCircuit, KartObstacle } from './kartCircuits';
import { locate, pointAlong } from './racingLine';
import type { PropPlacement } from '../visual/venuePropSets';

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
  // MAP EXPANSION (2026-09-18): a tyre stack is the corner's furniture and hits like a barrel; a hay bale is soft
  tyres: { family: 'solid', radius: 1.0, effect: 0.66, color: '#1c1f24' },
  haybale: { family: 'solid', radius: 1.2, effect: 0.78, color: '#d9b45a' },
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
    } else if (o.kind === 'tyres') {
      // three tyres stacked: a torus per tyre, merged
      const tyres = [0, 1, 2].map((k) => { const t = MeshBuilder.CreateTorus(`obs_${i}_t${k}`, { diameter: o.radius * 1.6, thickness: 0.34, tessellation: 12 }, scene); t.position.y = 0.17 + k * 0.34; return t; });
      m = Mesh.MergeMeshes(tyres, true, true, undefined, false, false) ?? tyres[0];
      m.position.set(o.pos.x, o.pos.y, o.pos.z);
    } else if (o.kind === 'haybale') {
      m = MeshBuilder.CreateCylinder(`obs_${i}`, { diameter: o.radius * 1.5, height: 1.6, tessellation: 14 }, scene);
      m.rotation.z = Math.PI / 2; m.rotation.y = (o.pos.x * 0.7 + o.pos.z * 0.3) % Math.PI;
      m.position.set(o.pos.x, o.pos.y + o.radius * 0.75, o.pos.z);
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


// ── DETAIL PASS (owner, 2026-09-18) ──────────────────────────────────────────────────────────────────────────

/**
 * CHEVRON BOARDS on the OUTSIDE of every kerbed corner, every ~6 m, pointing the way the corner turns — the one
 * piece of trackside furniture every kart game has, because it is the read a corner is taken on: you brake for the
 * boards, not the kerb. Derived from the kerbs, so a reshaped corner keeps its boards. One mesh, thin-instanced.
 */
export interface Chevron { pos: Vector3; yaw: number; turn: -1 | 1 }
export function chevronsFor(circuit: KartCircuit, step = 6): Chevron[] {
  const out: Chevron[] = [];
  for (const kerb of circuit.kerbs) {
    const len = kerb.to - kerb.from;
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const at = pointAlong(circuit.line, kerb.from + (i / n) * len);
      // the OUTSIDE of the corner: the kerb sits on the apex side, so the board is across the road from it
      out.push({ pos: at.pos.add(at.right.scale(-kerb.side * (circuit.halfWidth + 2.6))), yaw: Math.atan2(at.tangent.x, at.tangent.z), turn: kerb.side });
    }
  }
  return out;
}
export function buildChevrons(scene: Scene, circuit: KartCircuit): TransformNode {
  const root = new TransformNode(`kart_chevrons_${circuit.course.id}`, scene);
  const list = chevronsFor(circuit);
  if (!list.length) return root;
  // the board: a red panel with a white chevron painted as three boxes — no texture to ship
  const red = VenueKit.paint(scene, 'kart_chev_red', '#d23a2a', 0.18, 0.7) as PBRMaterial;
  const white = VenueKit.paint(scene, 'kart_chev_white', '#f4f4f0', 0.35, 0.6) as PBRMaterial;
  const panel = MeshBuilder.CreateBox('kart_chevron', { width: 1.8, height: 0.9, depth: 0.08 }, scene);
  panel.material = red; panel.isPickable = false;
  const stroke = (name: string, x: number, rot: number) => { const b = MeshBuilder.CreateBox(name, { width: 0.16, height: 0.62, depth: 0.1 }, scene); b.position.set(x, 0, 0.02); b.rotation.z = rot; b.material = white; b.isPickable = false; return b; };
  const arrow = Mesh.MergeMeshes([stroke('kart_chev_a', -0.18, 0.7), stroke('kart_chev_b', 0.18, -0.7)], true, true, undefined, false, false)!;
  arrow.isPickable = false;
  const post = MeshBuilder.CreateBox('kart_chevron_post', { width: 0.1, height: 1.1, depth: 0.1 }, scene);
  post.material = VenueKit.paint(scene, 'kart_chev_post', '#3a3f48', 0.04, 0.8); post.isPickable = false;
  const mats: Matrix[] = [], arrowMats: Matrix[] = [], postMats: Matrix[] = [];
  for (const c of list) {
    const q = Quaternion.FromEulerAngles(0, c.yaw + Math.PI / 2, 0);   // the board faces along the road, read from behind
    const flip = Quaternion.FromEulerAngles(0, c.yaw + Math.PI / 2, c.turn > 0 ? Math.PI : 0);   // the chevron points the way the corner turns
    mats.push(Matrix.Compose(Vector3.One(), q, new Vector3(c.pos.x, c.pos.y + 1.55, c.pos.z)));
    arrowMats.push(Matrix.Compose(Vector3.One(), flip, new Vector3(c.pos.x, c.pos.y + 1.55, c.pos.z)));
    postMats.push(Matrix.Compose(Vector3.One(), q, new Vector3(c.pos.x, c.pos.y + 0.55, c.pos.z)));
  }
  const pack = (m: Mesh, list: Matrix[]) => { const buf = new Float32Array(list.length * 16); list.forEach((x, i) => x.copyToArray(buf, i * 16)); m.thinInstanceSetBuffer('matrix', buf, 16, true); m.parent = root; };
  pack(panel, mats); pack(arrow, arrowMats); pack(post, postMats);
  return root;
}

/** The START / FINISH gantry: two towers and a beam across the road with a checkered banner, at the start line. */
export function buildGantry(scene: Scene, circuit: KartCircuit): TransformNode {
  const root = new TransformNode(`kart_gantry_${circuit.course.id}`, scene);
  const at = pointAlong(circuit.line, 0);
  const yaw = Math.atan2(at.tangent.x, at.tangent.z);
  const half = circuit.halfWidth + 2.2;
  const steel = VenueKit.paint(scene, 'kart_gantry_steel', '#c9ced6', 0.06, 0.45) as PBRMaterial; steel.metallic = 0.6;
  for (const s of [-1, 1]) {
    const tower = MeshBuilder.CreateBox(`kart_gantry_tower_${s}`, { width: 0.7, height: 7.2, depth: 0.7 }, scene);
    tower.position.copyFrom(at.pos.add(at.right.scale(s * half))); tower.position.y = at.pos.y + 3.6;
    tower.material = steel; tower.isPickable = false; tower.parent = root;
  }
  const beam = MeshBuilder.CreateBox('kart_gantry_beam', { width: half * 2 + 0.7, height: 0.6, depth: 0.7 }, scene);
  beam.position.copyFrom(at.pos); beam.position.y = at.pos.y + 7.2; beam.rotation.y = yaw; beam.material = steel; beam.isPickable = false; beam.parent = root;
  const black = VenueKit.paint(scene, 'kart_check_b', '#15171c', 0.02, 0.8), white = VenueKit.paint(scene, 'kart_check_w', '#f7f7f2', 0.12, 0.8);
  const n = 14, w = (half * 2) / n;
  for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) {
    const tile = MeshBuilder.CreateBox('kart_check', { width: w, height: 0.9, depth: 0.16 }, scene);
    tile.position.copyFrom(at.pos.add(at.right.scale(-half + w * (i + 0.5)))); tile.position.y = at.pos.y + 6.4 - r * 0.9;
    tile.rotation.y = yaw; tile.material = (i + r) % 2 ? black : white; tile.isPickable = false; tile.parent = root;
  }
  // the finish line painted across the road
  const line = MeshBuilder.CreateBox('kart_finish_line', { width: circuit.halfWidth * 2, height: 0.03, depth: 1.2 }, scene);
  line.position.copyFrom(at.pos); line.position.y = at.pos.y + 0.085; line.rotation.y = yaw; line.material = white; line.isPickable = false; line.parent = root;
  return root;
}

/**
 * THE SCENERY a kart course is dressed with, as Kenney racing-kit placements (VenueProps): grandstands and tents at
 * the start, banner towers on the gantry, flags on the outside of every corner, barrier walls along the tight ones,
 * light posts down the straights on the courses run at night. Pure; the kit is mounted by the mode.
 */
export function kartSceneryFor(circuit: KartCircuit): PropPlacement[] {
  const out: PropPlacement[] = [];
  const L = circuit.line.length, hw = circuit.halfWidth;
  const start = pointAlong(circuit.line, 0);
  const put = (model: string, at: { pos: Vector3; right: Vector3; tangent: Vector3 }, side: number, off: number, scale: number, yawExtra = 0, tint?: string) => {
    const p = at.pos.add(at.right.scale(side * (hw + off)));
    out.push({ kit: 'racing', model, at: [p.x, 0, p.z], yaw: Math.atan2(at.tangent.x, at.tangent.z) + yawExtra, scale, ...(tint ? { tint } : {}) });
  };
  // the start: a grandstand each side a little before the line, tents behind them, banner towers at the gantry
  for (const s of [-1, 1]) {
    put(s < 0 ? 'grandStandCovered' : 'grandStand', pointAlong(circuit.line, circuit.line.loop ? L - 34 : 30), s, 16, 3.2, s < 0 ? Math.PI / 2 : -Math.PI / 2);
    put('tent', pointAlong(circuit.line, circuit.line.loop ? L - 70 : 62), s, 22, 2.6, s < 0 ? Math.PI / 2 : -Math.PI / 2);
    put(s < 0 ? 'bannerTowerRed' : 'bannerTowerGreen', start, s, 4.5, 2.4);
  }
  // flags on the outside of every corner, barriers along the ones tighter than grip
  for (const kerb of circuit.kerbs) {
    const mid = pointAlong(circuit.line, (kerb.from + kerb.to) / 2);
    put(kerb.radius < 40 ? 'flagRed' : 'flagCheckers', mid, -kerb.side, 6.5, 2.4);
    if (kerb.radius < 45) for (let d = kerb.from - 6; d <= kerb.to + 6; d += 5.2) put('barrierWall', pointAlong(circuit.line, d), -kerb.side, 4.4, 2.4, Math.PI / 2);
  }
  // lights down the road on the night courses, light-post towers every ~70 m elsewhere
  const night = circuit.course.mood === 'nightGame';
  for (let d = 40; d < L - 30; d += night ? 46 : 74) {
    const at = pointAlong(circuit.line, d);
    put(night ? 'lightPostModern' : 'lightPostLarge', at, d % 2 ? 1 : -1, 7, 2.6);
  }
  // the overhead lights across the line on a night course
  if (night) { const p = start.pos; out.push({ kit: 'racing', model: 'overheadLights', at: [p.x, 0, p.z], yaw: Math.atan2(start.tangent.x, start.tangent.z), scale: 2.8 }); }
  return out;
}

// ── THE SETTING (owner, 2026-09-18: "add more detail to the maps, pay attention to viewpoints and setting") ────────

/** A pine forest for the slope courses, off the road: [x, z, scale, yaw] per tree, deterministic for a seed. */
export function forestFor(circuit: KartCircuit, count = 520, seed = 7, reach = 300): [number, number, number, number][] {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const out: [number, number, number, number][] = [];
  const keep = circuit.halfWidth + 14;   // the verge, the kerbs and the chevron boards stay clear
  for (let i = 0; i < count * 6 && out.length < count; i++) {
    const x = -reach + rnd() * reach * 2, z = -reach + rnd() * reach * 2;
    if (Math.abs(locate(circuit.line, x, z).lateral) < keep) continue;
    out.push([x, z, 0.75 + rnd() * 1.0, rnd() * Math.PI * 2]);
  }
  return out;
}

/**
 * The forest as two thin-instanced meshes (trunks, canopies) standing on `heightAt` — the world ground's relief, so
 * the trees climb the mountain with the road instead of floating over the valley or sinking into the ridge.
 */
export function buildForest(scene: Scene, circuit: KartCircuit, heightAt: ((x: number, z: number) => number) | null, tint = '#2f5a3e'): TransformNode {
  const root = new TransformNode(`kart_forest_${circuit.course.id}`, scene);
  const trunk = MeshBuilder.CreateCylinder('kart_pine_trunk', { height: 1.8, diameterTop: 0.36, diameterBottom: 0.5, tessellation: 6 }, scene);
  trunk.material = VenueKit.paint(scene, 'kart_pine_trunk_m', '#4a3526', 0.02, 0.9); trunk.isPickable = false; trunk.parent = root;
  const lower = MeshBuilder.CreateCylinder('kart_pine_lower', { height: 4.2, diameterTop: 0.2, diameterBottom: 3.6, tessellation: 7 }, scene);
  const upper = MeshBuilder.CreateCylinder('kart_pine_upper', { height: 3.4, diameterTop: 0, diameterBottom: 2.4, tessellation: 7 }, scene);
  upper.position.y = 2.6;
  const canopy = Mesh.MergeMeshes([lower, upper], true, true, undefined, false, false)!;
  canopy.name = 'kart_pine_canopy';
  canopy.material = VenueKit.paint(scene, 'kart_pine_canopy_m', tint, 0.02, 0.9); canopy.isPickable = false; canopy.parent = root;
  const trees = forestFor(circuit);
  const tBuf = new Float32Array(trees.length * 16), cBuf = new Float32Array(trees.length * 16);
  trees.forEach(([x, z, sc, yaw], i) => {
    const y = heightAt ? heightAt(x, z) : -0.03;
    const q = Quaternion.FromEulerAngles(0, yaw, 0);
    Matrix.Compose(new Vector3(sc, sc, sc), q, new Vector3(x, y + 0.9 * sc, z)).copyToArray(tBuf, i * 16);
    Matrix.Compose(new Vector3(sc, sc, sc), q, new Vector3(x, y + (1.8 + 2.1) * sc, z)).copyToArray(cBuf, i * 16);
  });
  trunk.thinInstanceSetBuffer('matrix', tBuf, 16, true);
  canopy.thinInstanceSetBuffer('matrix', cBuf, 16, true);
  return root;
}

/** Where the night courses' edge lights go: [x, y, z, yaw] every `step` metres down both sides of the road. */
export function edgeLightsFor(circuit: KartCircuit, step = 9): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let d = 0; d < circuit.line.length; d += step) {
    const at = pointAlong(circuit.line, d);
    const right = new Vector3(at.tangent.z, 0, -at.tangent.x);
    const yaw = Math.atan2(at.tangent.x, at.tangent.z);
    for (const side of [-1, 1]) { const p = at.pos.add(right.scale(side * (circuit.halfWidth + 0.7))); out.push([p.x, p.y + 0.1, p.z, yaw]); }
  }
  return out;
}

/** The edge lights themselves: one glowing strip, thin-instanced, in the course's tint. A night lap reads its road by them. */
export function buildEdgeLights(scene: Scene, circuit: KartCircuit): TransformNode {
  const root = new TransformNode(`kart_edge_lights_${circuit.course.id}`, scene);
  const strip = MeshBuilder.CreateBox('kart_edge_light', { width: 0.42, height: 0.16, depth: 3 }, scene);
  const m = VenueKit.paint(scene, `kart_edge_light_m_${circuit.course.id}`, circuit.course.tint, 1.0, 0.4);
  m.unlit = true; m.emissiveColor = Color3.FromHexString(circuit.course.tint);
  strip.material = m; strip.isPickable = false; strip.parent = root;
  const lights = edgeLightsFor(circuit);
  const buf = new Float32Array(lights.length * 16);
  lights.forEach(([x, y, z, yaw], i) => Matrix.Compose(Vector3.One(), Quaternion.FromEulerAngles(0, yaw, 0), new Vector3(x, y, z)).copyToArray(buf, i * 16));
  strip.thinInstanceSetBuffer('matrix', buf, 16, true);
  return root;
}
