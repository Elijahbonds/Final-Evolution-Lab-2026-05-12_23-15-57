// dunkObstacleProps — the scene side of DunkObstacles (DUNK-CONTROL-JUICE, 2026-09-08): load the readable mesh for an
// obstacle kind, park it on the runway, and sample its HEIGHT PROFILE along the runway off the loaded geometry so the
// clear test (core/DunkObstacles.clipsObstacle) is the visible mesh and nothing else. The owner's sedan comes through
// meshyProps (a baked Meshy asset, untouched); the barrier and the block come from the Kenney kits under
// public/models/props (CC0, the same files VenueProps dresses venues with). No CreateBox stand-in survives a load.
import { Color3, PBRMaterial, Ray, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { spawnMeshyProp } from '../visual/meshyProps';
import { CharacterPipeline } from '../core/characterPipeline';
import { neverBindPose } from '../anim/importSanitizer';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
/** Where the rider's own root sits so his hips land on the base's shoulders (the base's shoulder ≈ 1.42, hips ≈ 0.96). */
export const STACK_SEAT_Y = 0.46;
import { OBSTACLE_SPECS, boxProfile, type HeightProfile, type ObstacleKind, type ObstacleSpec } from '../core/DunkObstacles';

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
  dispose(): void;
}

const KIT_PALETTE: Record<string, string> = { leafsGreen: '#3F9A55', grass: '#4C9E58', woodBark: '#8B5E3C', dirt: '#8A6A4A' };

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
  if ('bodies' in spec.source) {
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
  else model = await loadKit(scene, spec.source.kit, spec.source.model, `${name}_${spec.source.model}`);
  if (scene.isDisposed) { holder.dispose(); throw new Error('scene disposed'); }
  let rock = 0, toppleT = -1;
  let profile: HeightProfile;
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
    profile = sampleProfile(scene, model, 0.6, boxProfile(centerZ, 0.5, spec.nominalHeight, 0.6));
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
  const peak = Math.max(0, ...profile.h);
  const nearZ = Math.max(profile.z[0], profile.z[profile.z.length - 1]), farZ = Math.min(profile.z[0], profile.z[profile.z.length - 1]);
  console.info(`[DUNK-PROP] ${spec.label} ${model ? 'mesh' : 'BOX STAND-IN'} at z ${centerZ.toFixed(2)} (${nearZ.toFixed(2)} … ${farZ.toFixed(2)}), top ${peak.toFixed(2)} m, half-width ${profile.halfWidth.toFixed(2)}`);
  return {
    kind, spec, root: holder, profile, peak, nearZ, farZ,
    tick(dt: number) {
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
    hit() { if (spec.topples) toppleT = 0; else rock = 1; },
    dispose() {
      for (const b of bodies) b.dispose(); holder.dispose(false, true); },
  };
}
