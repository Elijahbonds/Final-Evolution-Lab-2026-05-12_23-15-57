// dunkObstacleProps — the scene side of DunkObstacles (DUNK-CONTROL-JUICE, 2026-09-08): load the readable mesh for an
// obstacle kind, park it on the runway, and sample its HEIGHT PROFILE along the runway off the loaded geometry so the
// clear test (core/DunkObstacles.clipsObstacle) is the visible mesh and nothing else. The owner's sedan comes through
// meshyProps (a baked Meshy asset, untouched); the barrier and the block come from the Kenney kits under
// public/models/props (CC0, the same files VenueProps dresses venues with). No CreateBox stand-in survives a load.
import { Color3, MeshBuilder, PBRMaterial, Ray, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Mesh, Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { spawnMeshyProp } from '../visual/meshyProps';
import { CharacterPipeline } from '../core/characterPipeline';
import { neverBindPose } from '../anim/importSanitizer';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
/** Where the rider's own root sits so his hips land on the base's shoulders (the base's shoulder ≈ 1.42, hips ≈ 0.96). */
export const STACK_SEAT_Y = 0.46;
import { OBSTACLE_SPECS, ROW_SPACING_M, ROW_ALONG_SPACING_M, DUBBLE_BALL_Y, DUBBLE_HELPER_GAP_M, DUBBLE_KNEEL_SPACING_M, DUBBLE_KNEEL_H, dubbleKneelSpan, boxProfile, type HeightProfile, type ObstacleKind, type ObstacleSpec } from '../core/DunkObstacles';

export interface DunkObstacle {
  kind: ObstacleKind;
  spec: ObstacleSpec;
  root: TransformNode;
  /** Height profile along the runway (world z, descending toward the rim) — the hitbox. */
  profile: HeightProfile;
  /** The mesh's top under the runway centreline. */
  peak: number;
  /** World z of the obstacle's near and far edges on the runway. */
  nearZ: number; farZ: number;
  /** Per-frame: a topple (the barrier / the crate go over) or a rock (the car takes the hit on its suspension). */
  tick(dt: number): void;
  /** The dunker caught it. */
  hit(): void;
  /** THE RUN-UP STARTS IT (owner, 2026-09-16: "have the bike and skateboard approach on the run up press"). A moving
   *  prop waits at its mark until the player commits to the run, then comes. Nothing to do for a prop that stands. */
  start(): void;
  dispose(): void;
  /** DUNK MOTION phase 10: THE DUBBLE UP — the helper (the ball on his head) and where the ball sits. Only on a dubble. */
  dubble?: { holderZ: number; ballAnchor: TransformNode; holderRoot: TransformNode };
}

const KIT_PALETTE: Record<string, string> = { leafsGreen: '#3F9A55', grass: '#4C9E58', woodBark: '#8B5E3C', dirt: '#8A6A4A' };

/**
 * BUILT PROPS (owner, 2026-09-16: "add more prop dunks, ladder, bike…").
 *
 * There is no ladder and no bicycle in any kit here. The rule at the top of this file — no CreateBox stand-in survives
 * a load — is about not shipping a grey box that is pretending to be a car, and it stands. These are not stand-ins: a
 * step ladder IS two rails and a set of rungs, and a bike IS two wheels and a frame, so they are built out of the
 * shapes they are actually made of. Both read at runway speed, which is the only test that matters for an obstacle,
 * and both are sampled for their hitbox by the same ray sweep as every loaded mesh.
 */
function matteMaterial(scene: Scene, name: string, hex: string): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(hex); m.metallic = 0; m.roughness = 0.75;
  return m;
}

/** A step ladder: two A-frame legs, five rungs, a top plate. 1.5 m to the plate. */
function buildLadder(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const alu = matteMaterial(scene, `${name}_alu`, '#B9C0C7');
  const top = matteMaterial(scene, `${name}_top`, '#D9711F');
  const H = 1.5, SPREAD = 0.46;
  for (const side of [-1, 1]) {           // the two A-frame legs, splayed front to back
    for (const x of [-0.26, 0.26]) {
      const rail = MeshBuilder.CreateBox(`${name}_rail`, { width: 0.05, height: H + 0.06, depth: 0.05 }, scene);
      rail.parent = root; rail.material = alu; rail.isPickable = false;
      rail.position.set(x, H / 2, side * SPREAD / 2);
      rail.rotation.x = side * Math.atan2(SPREAD / 2, H);   // lean the legs in to the apex
    }
  }
  for (let i = 1; i <= 4; i++) {           // the rungs, on the front leg only, as a step ladder has
    const y = (H / 5) * i;
    const rung = MeshBuilder.CreateBox(`${name}_rung`, { width: 0.52, height: 0.035, depth: 0.12 }, scene);
    rung.parent = root; rung.material = alu; rung.isPickable = false;
    rung.position.set(0, y, -SPREAD / 2 + (y / H) * (SPREAD / 2));
  }
  const plate = MeshBuilder.CreateBox(`${name}_plate`, { width: 0.56, height: 0.04, depth: 0.34 }, scene);
  plate.parent = root; plate.material = top; plate.isPickable = false; plate.position.set(0, H, 0);
  return root;
}

/** A bike, side on to the runway: two wheels, a frame triangle, bars and a saddle. ~1.05 m to the bars. */
function buildBike(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const frame = matteMaterial(scene, `${name}_frame`, '#C8102E');
  const rubber = matteMaterial(scene, `${name}_rubber`, '#23262B');
  const R = 0.34;
  for (const z of [-0.52, 0.52]) {
    const wheel = MeshBuilder.CreateTorus(`${name}_wheel`, { diameter: R * 2, thickness: 0.05, tessellation: 20 }, scene);
    wheel.parent = root; wheel.material = rubber; wheel.isPickable = false;
    wheel.position.set(0, R, z); wheel.rotation.z = Math.PI / 2;   // the wheels stand up, rolling along z
  }
  const bar = (n: string, len: number, y: number, z: number, tilt: number) => {
    const b = MeshBuilder.CreateBox(`${name}_${n}`, { width: 0.045, height: 0.045, depth: len }, scene);
    b.parent = root; b.material = frame; b.isPickable = false; b.position.set(0, y, z); b.rotation.x = tilt;
    return b;
  };
  bar('down', 0.86, 0.52, 0.10, 0.50);          // down tube
  bar('topbar', 0.62, 0.80, -0.06, 0.16);       // top tube
  bar('seatpost', 0.46, 0.72, -0.34, -0.22);    // seat tube
  bar('fork', 0.60, 0.62, 0.42, -0.22);         // fork
  const bars = MeshBuilder.CreateBox(`${name}_bars`, { width: 0.44, height: 0.04, depth: 0.04 }, scene);
  bars.parent = root; bars.material = frame; bars.isPickable = false; bars.position.set(0, 1.02, 0.30);
  const saddle = MeshBuilder.CreateBox(`${name}_saddle`, { width: 0.12, height: 0.05, depth: 0.26 }, scene);
  saddle.parent = root; saddle.material = rubber; saddle.isPickable = false; saddle.position.set(0, 0.92, -0.46);
  return root;
}

/** A kangaroo, upright: the body, the head and ears, the tail out behind, two big feet. It faces −z (down the lane, at the rim). */
function buildKangaroo(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const fur = matteMaterial(scene, `${name}_fur`, '#b08a5a'), belly = matteMaterial(scene, `${name}_belly`, '#e5d3b3'), dark = matteMaterial(scene, `${name}_dark`, '#4a3524');
  const part = (m: Mesh, mat: PBRMaterial, x: number, y: number, z: number): Mesh => { m.parent = root; m.material = mat; m.isPickable = false; m.position.set(x, y, z); return m; };
  const body = part(MeshBuilder.CreateSphere(`${name}_body`, { diameter: 1, segments: 12 }, scene), fur, 0, 0.8, 0); body.scaling.set(0.55, 0.95, 0.6); body.rotation.x = 0.25;
  const chest = part(MeshBuilder.CreateSphere(`${name}_chest`, { diameter: 0.5, segments: 10 }, scene), belly, 0, 0.75, -0.16); chest.scaling.set(0.8, 1.3, 0.5);
  const head = part(MeshBuilder.CreateBox(`${name}_head`, { width: 0.26, height: 0.28, depth: 0.42 }, scene), fur, 0, 1.32, -0.25); head.rotation.x = 0.15;
  for (const dx of [-0.09, 0.09]) part(MeshBuilder.CreateBox(`${name}_ear`, { width: 0.07, height: 0.3, depth: 0.04 }, scene), fur, dx, 1.55, -0.15).rotation.z = dx * 3;
  const tail = part(MeshBuilder.CreateCylinder(`${name}_tail`, { diameterTop: 0.08, diameterBottom: 0.2, height: 1.1, tessellation: 10 }, scene), fur, 0, 0.35, 0.6); tail.rotation.x = -1.15;
  for (const dx of [-0.16, 0.16]) { part(MeshBuilder.CreateBox(`${name}_foot`, { width: 0.14, height: 0.1, depth: 0.62 }, scene), dark, dx, 0.05, -0.05); part(MeshBuilder.CreateCylinder(`${name}_shin`, { diameter: 0.14, height: 0.5, tessellation: 8 }, scene), fur, dx, 0.32, 0.12).rotation.x = 0.35; }
  for (const dx of [-0.2, 0.2]) part(MeshBuilder.CreateCylinder(`${name}_arm`, { diameter: 0.07, height: 0.32, tessellation: 8 }, scene), fur, dx, 0.95, -0.28).rotation.x = -0.6;
  return root;
}

async function loadKit(scene: Scene, kit: string, model: string, name: string): Promise<TransformNode | null> {
  try {
    const r = await SceneLoader.ImportMeshAsync('', `/models/props/${kit}/`, `${model}.glb`, scene);
    if (scene.isDisposed) { for (const m of r.meshes) m.dispose(); return null; }
    const root = new TransformNode(name, scene);
    for (const m of r.meshes) {
      if (!m.parent) m.parent = root;
      m.isPickable = false; m.receiveShadows = true;
      const mat = m.material;
      if (mat instanceof PBRMaterial) {   // the Kenney export: metallic 1 with no metallic map reads as a dark gem under the IBL (VenueProps' fix)
        if (mat.unlit) mat.unlit = false;
        if (!mat.metallicTexture && (mat.metallic ?? 0) > 0.5) { mat.metallic = 0; mat.roughness = 0.9; }
        const hex = KIT_PALETTE[mat.name]; if (hex && !mat.albedoTexture) mat.albedoColor = Color3.FromHexString(hex);
      }
    }
    return root;
  } catch (e) {
    console.warn(`[FEL-DUNK] obstacle ${kit}/${model} did not load: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
    return null;
  }
}

/** Sample the loaded mesh's top along the runway centreline: a ray from above every 12 cm across the footprint. */
function sampleProfile(scene: Scene, root: TransformNode, halfWidth: number, fallback: HeightProfile): HeightProfile {
  const meshes = root.getChildMeshes(false).filter((m) => m.getTotalVertices() > 0);
  if (!meshes.length) return fallback;
  for (const m of meshes) { m.isPickable = true; m.computeWorldMatrix(true); m.refreshBoundingInfo({}); }
  root.computeWorldMatrix(true);
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of meshes) { const b = m.getBoundingInfo().boundingBox; min.minimizeInPlace(b.minimumWorld); max.maximizeInPlace(b.maximumWorld); }
  const z: number[] = [], h: number[] = [];
  const steps = Math.max(6, Math.ceil((max.z - min.z) / 0.12));
  const down = new Vector3(0, -1, 0);
  const pick = (m: AbstractMesh) => meshes.includes(m);
  for (let i = 0; i <= steps; i++) {
    const zz = max.z - ((max.z - min.z) * i) / steps;
    // three rays across the body's width, the highest wins — the runway is ~0.6 m wide at the feet
    let top = 0;
    for (const dx of [-0.25, 0, 0.25]) {
      const hit = scene.pickWithRay(new Ray(new Vector3(dx, max.y + 2, zz), down, max.y + 3), pick);
      if (hit?.hit && hit.pickedPoint) top = Math.max(top, hit.pickedPoint.y);
    }
    z.push(zz); h.push(top);
  }
  for (const m of meshes) m.isPickable = false;
  // the edges: the first / last sample carry the mesh's own silhouette; a 0 outside the footprint is heightAt's job
  const width = Math.max(halfWidth, (max.x - min.x) / 2);
  return { z, h, halfWidth: width };
}

/** Build the obstacle for `kind` at the rim's runway. Resolves with the loaded mesh, or a box stand-in (still a matching
 *  hitbox) when the file cannot load — never an invisible hitbox. */
export async function spawnDunkObstacle(scene: Scene, kind: ObstacleKind, rim: { x: number; z: number }, name = 'dunk_obstacle', heroUrl = DEFAULT_HERO_URL): Promise<DunkObstacle> {
  const spec = OBSTACLE_SPECS[kind];
  const centerZ = rim.z + spec.zFromRim;
  const holder = new TransformNode(name, scene);
  holder.position.set(rim.x, 0, centerZ);
  let model: TransformNode | null = null;
  /** THE TETRIS is two of the game's own bodies rather than a prop file — spawned, posed and stacked here. */
  const bodies: { dispose(): void }[] = [];
  let dubble: DunkObstacle['dubble'];
  if ('bodies' in spec.source && spec.source.bodies === 'dubble') {
    // THE DUBBLE UP: the helper stands at the obstacle's centre — the RUNWAY end of the line (owner: "put the ball on the first guys head")
    // — with the ball held up over his head; the line runs on from him toward the rim, standing tall, nose to tail
    const n = spec.bodyCount ?? 1;
    const tints = ['#f4a261', '#e76f51', '#e9c46a', '#2a9d8f', '#8ab17d'];
    const helper = await CharacterPipeline.spawnNpc(scene, heroUrl, { position: new Vector3(rim.x, 0, centerZ), tint: '#ffd166', startClip: 'prop_dubble_hold' });
    if (scene.isDisposed) { helper.dispose(); holder.dispose(); throw new Error('scene disposed'); }
    helper.root.parent = holder; helper.root.rotation.y = Math.PI; helper.root.position.set(0, 0, 0);
    neverBindPose(helper.animator, 'prop_dubble_hold'); helper.animator.play('prop_dubble_hold', { loop: true });
    bodies.push(helper);
    const anchor = new TransformNode(`${name}_dubble_ball`, scene); anchor.parent = holder; anchor.position.set(0, DUBBLE_BALL_Y, 0.03);
    dubble = { holderZ: centerZ, ballAnchor: anchor, holderRoot: helper.root };
    for (let i = 1; i < n; i++) {
      const off = -(DUBBLE_HELPER_GAP_M + (i - 1) * DUBBLE_KNEEL_SPACING_M);   // toward the rim (−z)
      const b = await CharacterPipeline.spawnNpc(scene, heroUrl, { position: new Vector3(rim.x, 0, centerZ + off), tint: tints[i % tints.length], startClip: 'prop_row_stand' });
      if (scene.isDisposed) { b.dispose(); for (const d of bodies) d.dispose(); holder.dispose(); throw new Error('scene disposed'); }
      b.root.parent = holder; b.root.rotation.y = Math.PI; b.root.position.set(0, 0, off);
      neverBindPose(b.animator, 'prop_row_stand'); b.animator.play('prop_row_stand', { loop: true });   // they stand tall (owner, 2026-09-24)
      bodies.push(b);
    }
  } else if ('bodies' in spec.source && (spec.source.bodies === 'row' || spec.source.bodies === 'wall')) {
    // A ROW runs LENGTHWISE down the runway (the line you clear the length of); a WALL stands shoulder to shoulder
    // ACROSS it (Jonathan Clark's). Same bodies, ninety degrees apart, and completely different dunks: the row is a long
    // jump over people who are bent over, the wall is a high one over people standing up.
    const along = spec.source.bodies === 'row';
    const n = spec.bodyCount ?? 3;
    const clip = 'prop_row_stand';   // owner, 2026-09-16: the people stand up, in the row as well as the wall
    const gap = along ? ROW_ALONG_SPACING_M : ROW_SPACING_M;
    // tints alternate so the COUNT is readable at speed — five people in one colour is a smear from twelve metres out,
    // and the count is the whole point of the prop
    const tints = ['#f4a261', '#e76f51', '#e9c46a', '#2a9d8f', '#8ab17d'];
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * gap;
      const b = await CharacterPipeline.spawnNpc(scene, heroUrl, {
        position: new Vector3(rim.x + (along ? 0 : off), 0, centerZ + (along ? off : 0)), tint: tints[i % tints.length], startClip: clip,
      });
      if (scene.isDisposed) { b.dispose(); for (const d of bodies) d.dispose(); holder.dispose(); throw new Error('scene disposed'); }
      b.root.parent = holder; b.root.rotation.y = Math.PI;
      b.root.position.set(along ? 0 : off, 0, along ? off : 0);
      neverBindPose(b.animator, clip);
      b.animator.play(clip, { loop: true });
      bodies.push(b);
    }
  } else if ('bodies' in spec.source) {
    const base = await CharacterPipeline.spawnNpc(scene, heroUrl, {
      position: new Vector3(rim.x, 0, centerZ), tint: '#f4a261', startClip: 'prop_stack_base',
    });
    if (scene.isDisposed) { base.dispose(); holder.dispose(); throw new Error('scene disposed'); }
    const rider = await CharacterPipeline.spawnNpc(scene, heroUrl, {
      position: new Vector3(rim.x, STACK_SEAT_Y, centerZ - 0.06), tint: '#e76f51', startClip: 'prop_stack_rider',
    });
    if (scene.isDisposed) { base.dispose(); rider.dispose(); holder.dispose(); throw new Error('scene disposed'); }
    // both face the runway — the dunker comes at them from +z, and a stack that reads from behind is a stack nobody
    // understands until they are already in the air
    for (const b of [base, rider]) { b.root.parent = holder; b.root.rotation.y = Math.PI; }
    base.root.position.set(0, 0, 0);
    rider.root.position.set(0, STACK_SEAT_Y, -0.06);   // hips at the base's shoulders, weight a touch behind his neck
    neverBindPose(base.animator, 'prop_stack_base');
    neverBindPose(rider.animator, 'prop_stack_rider');
    base.animator.play('prop_stack_base', { loop: true });
    rider.animator.play('prop_stack_rider', { loop: true });
    bodies.push(base, rider);
  } else if ('meshy' in spec.source) model = await spawnMeshyProp(scene, spec.source.meshy, holder, `${name}_${spec.source.meshy}`);
  else if ('built' in spec.source) model = spec.source.built === 'ladder' ? buildLadder(scene, `${name}_ladder`) : spec.source.built === 'bike' ? buildBike(scene, `${name}_bike`) : buildKangaroo(scene, `${name}_kangaroo`);
  else model = await loadKit(scene, spec.source.kit, spec.source.model, `${name}_${spec.source.model}`);
  if (scene.isDisposed) { holder.dispose(); throw new Error('scene disposed'); }

  // SOMEBODY ON IT. The seat heights are measured off the props: a bike saddle sits at 0.92 and a board deck at 0.08,
  // and a seated/crouched body's hips land ~0.96 above its root before the pose's own hipsY moves them.
  if (spec.rider) {
    const clip = spec.rider === 'bike' ? 'prop_bike_rider' : 'prop_skate_rider';
    const y = spec.rider === 'bike' ? 0.26 : 0.08;
    const r = await CharacterPipeline.spawnNpc(scene, heroUrl, {
      position: new Vector3(rim.x, y, centerZ), tint: spec.rider === 'bike' ? '#457b9d' : '#e9c46a', startClip: clip,
    });
    if (scene.isDisposed) { r.dispose(); holder.dispose(); throw new Error('scene disposed'); }
    r.root.parent = holder; r.root.position.set(0, y, 0);
    r.root.rotation.y = Math.PI / 2;   // facing the way the thing travels, across the runway
    neverBindPose(r.animator, clip);
    r.animator.play(clip, { loop: true });
    bodies.push(r);
  }

  let rock = 0, toppleT = -1;
  // A moving prop WAITS at its mark — off the near end of its run — until the run-up commits, then it comes. Parked at
  // the middle it would just be an obstacle that happens to wiggle; starting it on the press is what makes it a read.
  let rollDir = spec.towardRim ? -1 : 1, rolling = false, hopT = 0;
  let rollX = spec.towardRim ? (spec.travel ?? 3.4) : -(spec.travel ?? 3.4);   // toward the rim: it starts at the runner's end
  let profile: HeightProfile;
  if (spec.speed) {
    const t = spec.travel ?? 3.4;
    if (spec.axis === 'z') holder.position.z = centerZ + rollX; else holder.position.x = rim.x - t;
  }
  if (model) {
    model.parent = holder;
    model.rotation.y = spec.yaw; model.scaling.set(spec.scale, spec.scale * (spec.scaleY ?? 1), spec.scale);
    // Kenney kit files sit on their own origin, sometimes off-centre (barrierWhite is authored at x −0.2, z −0.7): re-centre
    // the model's footprint on the holder so the obstacle stands where the table says it stands
    holder.computeWorldMatrix(true); model.computeWorldMatrix(true);
    const meshes = model.getChildMeshes(false).filter((m) => m.getTotalVertices() > 0);
    if (meshes.length) {
      for (const m of meshes) { m.computeWorldMatrix(true); m.refreshBoundingInfo({}); }
      const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const m of meshes) { const b = m.getBoundingInfo().boundingBox; min.minimizeInPlace(b.minimumWorld); max.maximizeInPlace(b.maximumWorld); }
      model.position.x -= (min.x + max.x) / 2 - holder.position.x;
      model.position.z -= (min.z + max.z) / 2 - holder.position.z;
      model.position.y -= min.y;   // feet on the floor
      model.computeWorldMatrix(true); for (const m of meshes) m.computeWorldMatrix(true);
    }
    // a ridden prop is measured by its SPEC: the ray sweep can only see the bike or the board, and the thing you have to
    // clear is the person on it
    profile = spec.rider
      ? boxProfile(centerZ, 0.42, spec.nominalHeight, 0.62)
      : sampleProfile(scene, model, 0.6, boxProfile(centerZ, 0.5, spec.nominalHeight, 0.6));
  } else if (dubble) {
    // the hitbox is the kneelers' backs (the feet go over them); the helper is cleared by the HIPS going over his head, which the mode
    // judges itself (a straddle: the feet pass either side of him, so he is not in the feet's profile)
    const span = dubbleKneelSpan(spec.bodyCount ?? 1);
    profile = span ? boxProfile(rim.z + span.center, span.halfDepth, DUBBLE_KNEEL_H, 0.6) : { z: [centerZ + 0.01, centerZ - 0.01], h: [0, 0], halfWidth: 0.2 };
  } else if (bodies.length && 'bodies' in spec.source && (spec.source.bodies === 'row' || spec.source.bodies === 'wall')) {
    const n = spec.bodyCount ?? 3;
    const along = spec.source.bodies === 'row';
    // The line is one person WIDE, and at 0.44 m of half-width a dunker whose run-up curved a foot off the centreline
    // sailed over it without the game ever noticing — no clear, no bonus, measured on rc41. The people are that wide;
    // the READ of going over them is not, so the footprint is generous across and honest along.
    profile = along
      ? boxProfile(centerZ, ((n - 1) * ROW_ALONG_SPACING_M) / 2 + 0.26, spec.nominalHeight, 0.85)
      : boxProfile(centerZ, 0.28, spec.nominalHeight, ((n - 1) * ROW_SPACING_M) / 2 + 0.34);        // one person deep, the whole wall wide
  } else if (bodies.length) {
    // THE HITBOX IS THEIR LAP. The rider's head is 2.3 m up and the dunker's apex is 1.84 — a hitbox at the top of the
    // stack is a dunk nobody in the game can do. `nominalHeight` (1.75) is the highest thing the feet must clear, and
    // the rider ducks under the line as they come over (anim/authored/stackProp).
    profile = boxProfile(centerZ, 0.45, spec.nominalHeight, 0.55);
  } else {
    // the file failed: a visible box the size of the nominal object (never an invisible hitbox)
    const { MeshBuilder } = await import('@babylonjs/core');
    const box = MeshBuilder.CreateBox(`${name}_box`, { width: kind === 'car' ? 4.8 : 1.2, height: spec.nominalHeight, depth: kind === 'car' ? 2.08 : 1.0 }, scene);
    box.parent = holder; box.position.y = spec.nominalHeight / 2; box.isPickable = false;
    profile = boxProfile(centerZ, kind === 'car' ? 1.04 : 0.5, spec.nominalHeight, kind === 'car' ? 2.4 : 0.6);
  }
  // a waiting prop's HITBOX waits with it, off the near end of its run
  if (spec.speed) { const t = spec.travel ?? 3.4; if (spec.axis === 'z') profile.zShift = rollX; else profile.centerX = -t; }
  const peak = Math.max(0, ...profile.h);
  const shift0 = profile.zShift ?? 0;
  const nearZ = Math.max(profile.z[0], profile.z[profile.z.length - 1]) + shift0, farZ = Math.min(profile.z[0], profile.z[profile.z.length - 1]) + shift0;
  console.info(`[DUNK-PROP] ${spec.label} ${model ? 'mesh' : 'BOX STAND-IN'} at z ${centerZ.toFixed(2)} (${nearZ.toFixed(2)} … ${farZ.toFixed(2)}), top ${peak.toFixed(2)} m, half-width ${profile.halfWidth.toFixed(2)}`);
  return {
    kind, spec, root: holder, profile, peak, nearZ, farZ, dubble,
    tick(dt: number) {
      // A MOVING PROP IS A TIMING PROBLEM. It runs across the runway and turns around at the ends, and the HITBOX goes
      // with it (profile.centerX) — otherwise the bike would be drawn eight metres away and still clip the dunker's
      // feet on the centreline, which is the exact bug a moving obstacle invites.
      if (spec.speed && rolling) {
        const travel = spec.travel ?? 3.4;
        rollX += rollDir * spec.speed * dt;
        if (rollX > travel) { rollX = travel; rollDir = -1; }
        if (rollX < -travel) { rollX = -travel; rollDir = 1; }
        // THE HOP: the body and the hitbox ride each hop; the animal faces the way it is going
        if (spec.hop) {
          hopT += dt; const u = (hopT % spec.hop.period) / spec.hop.period; const lift = Math.sin(u * Math.PI) * spec.hop.height;
          holder.position.y = lift; profile.lift = lift;
          if (model) model.rotation.y = spec.yaw + (rollDir < 0 ? 0 : Math.PI);
        }
        if (spec.axis === 'z') {
          // COMING AT YOU (owner, 2026-09-16: "the bike can come towards you"). It runs up and down the runway on the
          // line you are running, so it is not a question of whether it is in your way — it is, the whole time — but of
          // WHERE it is when you leave the floor. The hitbox slides with it.
          holder.position.z = centerZ + rollX;
          holder.rotation.y = rollDir > 0 ? 0 : Math.PI;
          profile.zShift = rollX;
        } else {
          holder.position.x = rim.x + rollX;
          holder.rotation.y = rollDir > 0 ? 0 : Math.PI;   // it faces the way it is going
          profile.centerX = rollX;
        }
      }
      if (toppleT >= 0) {   // the barrier / the crate go over toward the rim
        toppleT = Math.min(1, toppleT + dt * 2.6);
        const k = toppleT * toppleT;
        holder.rotation.x = -1.45 * k;
        if (toppleT >= 1) toppleT = -1;
      }
      if (rock > 0) {   // the car takes the hit on its suspension: a damped nose-dip and roll
        rock = Math.max(0, rock - dt * 1.6);
        const w = rock * rock;
        holder.rotation.x = Math.sin(rock * 22) * 0.035 * w;
        holder.rotation.z = Math.sin(rock * 17) * 0.02 * w;
        holder.position.y = -Math.abs(Math.sin(rock * 22)) * 0.03 * w;
        if (rock === 0) { holder.rotation.x = 0; holder.rotation.z = 0; holder.position.y = 0; }
      }
    },
    start() {
      if (!spec.speed || rolling) return;
      rolling = true; rollDir = 1; rollX = -(spec.travel ?? 3.4);
      console.info(`[DUNK-PROP] ${spec.label} starts its approach`);
    },
    hit() { if (spec.topples) toppleT = 0; else rock = 1; },
    dispose() {
      for (const b of bodies) b.dispose(); holder.dispose(false, true); },
  };
}
