/**
 * The test yard, drawn (A4; Babylon). The sim never sees this file: it reads world/pieces through the host. Here the
 * same pieces become meshes — merged by material so the yard is a handful of draw calls — plus A1's rail mesh, and
 * placeholder bodies for what has no art yet (monsters, the boss, a creature partner: plan decision 3, "creature art",
 * is the owner's; until then a body is a few primitives in the archetype's colour).
 *
 * Budget (plan: ≤ 450 draws / ≤ 300 active meshes on a phone): the static yard is ~6 merged meshes; each placeholder
 * body 1–3 meshes sharing one material per archetype; the boss's weak points two small spheres.
 */

import {
  Color3, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, type AbstractMesh, type Scene,
} from '@babylonjs/core';
import type { ActorId, AdventureActor, Element } from '../contracts';
import type { MonsterArchetype } from '../combat/monsters/defs';
import { PLACEHOLDER_BOSS } from '../combat/bosses/defs';
import { buildRailMeshes } from '../rails/view';
import type { GroundPiece } from './pieces';
import type { SandboxSpec } from './sandbox';

/** Generic placeholder colours (no franchise palette). */
const MONSTER_COLOR: Readonly<Record<MonsterArchetype | 'boss', string>> = {
  brute: '#7f1d1d', skitter: '#a16207', caster: '#4c1d95', flyer: '#155e75', swarm: '#3f6212', boss: '#44403c',
};
const ELEMENT_BODY: Readonly<Record<Element, string>> = {
  fire: '#ea580c', water: '#0284c7', earth: '#a16207', wind: '#34d399', lightning: '#facc15', ice: '#7dd3fc',
  light: '#fde68a', shadow: '#7c3aed',
};

export interface YardView {
  /** The gate's mesh follows the gate piece (shown while shut). */
  sync(): void;
  dispose(): void;
  readonly meshCount: number;
}

function mat(scene: Scene, name: string, hex: string, emissive = 0): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.08, 0.08, 0.08);
  if (emissive > 0) m.emissiveColor = Color3.FromHexString(hex).scale(emissive);
  return m;
}

/** One piece as a mesh (a block as a box, a ramp as a tilted slab; flats are the ground plane's). */
function pieceMesh(scene: Scene, p: GroundPiece): Mesh | null {
  const w = p.maxX - p.minX, d = p.maxZ - p.minZ, cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
  if (p.kind === 'block') {
    const h = Math.max(0.05, p.top - p.y0);
    const m = MeshBuilder.CreateBox(`yard_${p.id}`, { width: w, height: h, depth: d }, scene);
    m.position.set(cx, p.y0 + h / 2, cz);
    return m;
  }
  if (p.kind === 'ramp') {
    const along = p.axis === 'z' ? d : w, rise = p.y1 - p.y0;
    const len = Math.hypot(along, rise), ang = Math.atan2(rise, along);
    const m = MeshBuilder.CreateBox(`yard_${p.id}`, p.axis === 'z' ? { width: w, height: 0.3, depth: len } : { width: len, height: 0.3, depth: d }, scene);
    m.position.set(cx, (p.y0 + p.y1) / 2 - 0.15, cz);
    // Babylon's +x rotation tips +z down (left-handed): a ramp rising toward +z turns by −angle; along x, +z rotation lifts +x
    if (p.axis === 'z') m.rotation.x = -ang; else m.rotation.z = ang;
    return m;
  }
  return null;
}

/** Build the yard: the ground, the rim and arena walls, the slope, the run-walls, the gate, the rails, the lane lines. */
export function buildYardView(scene: Scene, spec: SandboxSpec): YardView {
  const owned: { dispose(): void }[] = [];
  const yard = spec.pieces.find((p) => p.id === 'yard')!;
  const ground = MeshBuilder.CreateGround('yard_ground', { width: yard.maxX - yard.minX, height: yard.maxZ - yard.minZ, subdivisions: 1 }, scene);
  ground.position.set((yard.minX + yard.maxX) / 2, 0, (yard.minZ + yard.maxZ) / 2);
  ground.material = mat(scene, 'yard_ground_mat', '#3f4a3a');
  ground.receiveShadows = true;
  owned.push(ground, ground.material);

  const groups: Record<string, { color: string; meshes: Mesh[] }> = {
    rim: { color: '#57534e', meshes: [] }, slope: { color: '#78716c', meshes: [] }, wall: { color: '#94a3b8', meshes: [] },
  };
  let gate: Mesh | null = null;
  for (const p of spec.pieces) {
    if (p.kind === 'flat') continue;
    const m = pieceMesh(scene, p);
    if (!m) continue;
    if (p === spec.gate) { gate = m; continue; }
    const g = p.id.startsWith('slope') ? 'slope' : p.id.startsWith('wall.') ? 'wall' : 'rim';
    groups[g].meshes.push(m);
  }
  // the lane lines down the straight: where the run builds speed
  for (const x of [-6, 6]) {
    const l = MeshBuilder.CreateGround(`yard_lane_${x}`, { width: 0.15, height: 150 }, scene);
    l.position.set(x, 0.01, 75);
    groups.wall.meshes.push(l);
  }
  for (const [k, g] of Object.entries(groups)) {
    if (!g.meshes.length) continue;
    const merged = g.meshes.length === 1 ? g.meshes[0] : Mesh.MergeMeshes(g.meshes, true, true);
    if (!merged) continue;
    merged.name = `yard_${k}`;
    merged.material = mat(scene, `yard_${k}_mat`, g.color);
    merged.isPickable = false;
    merged.freezeWorldMatrix();
    owned.push(merged, merged.material);
  }
  if (gate) {
    gate.material = mat(scene, 'yard_gate_mat', '#b45309', 0.25);
    gate.isPickable = false;
    owned.push(gate, gate.material);
  }
  const rails = buildRailMeshes(scene, spec.rails, { diameter: 0.12, color: '#e2e8f0' });
  if (rails) owned.push(rails);
  const meshCount = scene.meshes.length;
  return {
    meshCount,
    sync(): void { if (gate) gate.setEnabled(!spec.gate.off); },
    dispose(): void { for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose(); },
  };
}

// ── Placeholder bodies ───────────────────────────────────────────────────────────────────────────────────────────────

export interface PlaceholderBody {
  root: TransformNode;
  /** The node A1's movement view may tilt (the spin ball, the bank). */
  pose: TransformNode;
  meshes: AbstractMesh[];
  dispose(): void;
}

const matCache = new WeakMap<Scene, Map<string, StandardMaterial>>();
function sharedMat(scene: Scene, key: string, hex: string, emissive = 0): StandardMaterial {
  let m = matCache.get(scene);
  if (!m) { m = new Map(); matCache.set(scene, m); }
  let x = m.get(key);
  if (!x || x.getScene() !== scene) { x = mat(scene, `adv_body_${key}`, hex, emissive); m.set(key, x); }
  return x;
}

/** A monster's or the boss's placeholder: primitives sized to its capsule, in its archetype's colour. */
export function buildMonsterBody(scene: Scene, a: AdventureActor, archetype: MonsterArchetype | 'boss'): PlaceholderBody {
  const root = new TransformNode(`adv_${a.id}`, scene);
  const pose = new TransformNode(`adv_${a.id}_pose`, scene);
  pose.parent = root;
  const m = sharedMat(scene, archetype, MONSTER_COLOR[archetype]);
  const meshes: AbstractMesh[] = [];
  const add = (mesh: Mesh, y: number) => { mesh.parent = pose; mesh.position.y = y; mesh.material = m; mesh.isPickable = false; meshes.push(mesh); };
  const r = a.radius, h = a.height;
  switch (archetype) {
    case 'brute': add(MeshBuilder.CreateBox(`${a.id}_b`, { width: r * 2, height: h, depth: r * 1.6 }, scene), h / 2); break;
    case 'flyer': {
      add(MeshBuilder.CreateSphere(`${a.id}_b`, { diameter: r * 1.6, segments: 8 }, scene), h / 2);
      add(MeshBuilder.CreateBox(`${a.id}_w`, { width: r * 4, height: 0.08, depth: r * 0.9 }, scene), h / 2);
      break;
    }
    case 'swarm': add(MeshBuilder.CreateSphere(`${a.id}_b`, { diameter: r * 2, segments: 6 }, scene), r); break;
    case 'boss': {
      add(MeshBuilder.CreateCapsule(`${a.id}_b`, { radius: r, height: h, tessellation: 12 }, scene), h / 2);
      const wp = sharedMat(scene, 'weakpoint', '#f59e0b', 0.6);
      for (const w of PLACEHOLDER_BOSS.weakPoints) {
        const s = MeshBuilder.CreateSphere(`${a.id}_${w.part}`, { diameter: 0.6, segments: 8 }, scene);
        s.parent = pose; s.position.set(w.offset.x, w.offset.y, w.offset.z); s.material = wp; s.isPickable = false;
        meshes.push(s);
      }
      break;
    }
    default: add(MeshBuilder.CreateCapsule(`${a.id}_b`, { radius: r, height: h, tessellation: 8 }, scene), h / 2);
  }
  return { root, pose, meshes, dispose: () => { for (const x of meshes) x.dispose(); pose.dispose(); root.dispose(); } };
}

/** A creature partner's placeholder: a body and a head in its element's colour, scaled by its stage. [PLACEHOLDER] */
export function buildCreatureBody(scene: Scene, a: AdventureActor, element: Element, stage: number): PlaceholderBody {
  const root = new TransformNode(`adv_${a.id}`, scene);
  const pose = new TransformNode(`adv_${a.id}_pose`, scene);
  pose.parent = root;
  const m = sharedMat(scene, `creature_${element}`, ELEMENT_BODY[element], 0.15);
  // [TUNE] a hatchling ~0.7 m long, a flying stage ~1.6 m (a body a rider can sit on, not one that fills the camera)
  const k = 0.6 + 0.2 * Math.max(0, stage);
  const body = MeshBuilder.CreateCapsule(`${a.id}_body`, { radius: 0.35 * k, height: 1.6 * k, tessellation: 10, orientation: new Vector3(0, 0, 1) }, scene);
  body.parent = pose; body.position.y = 0.55 * k; body.material = m; body.isPickable = false;
  const head = MeshBuilder.CreateSphere(`${a.id}_head`, { diameter: 0.5 * k, segments: 8 }, scene);
  head.parent = pose; head.position.set(0, 0.95 * k, 0.75 * k); head.material = m; head.isPickable = false;
  const meshes: AbstractMesh[] = [body, head];
  if (stage >= 2) {
    const wing = MeshBuilder.CreateBox(`${a.id}_wings`, { width: 2.0 * k, height: 0.05, depth: 0.5 * k }, scene);
    wing.parent = pose; wing.position.set(0, 0.8 * k, 0); wing.material = m; wing.isPickable = false;
    meshes.push(wing);
  }
  return { root, pose, meshes, dispose: () => { for (const x of meshes) x.dispose(); pose.dispose(); root.dispose(); } };
}

/** Place a body's root at its actor (feet at pos, yawed to its facing). Allocation-free. */
export function placeBody(root: TransformNode, a: AdventureActor): void {
  root.position.set(a.pos.x, a.pos.y, a.pos.z);
  root.rotation.y = a.facingYaw;
}

/** Which archetype an actor id belongs to in the yard (the camp's ids name it). */
export function archetypeOf(id: ActorId, spec: SandboxSpec): MonsterArchetype | 'boss' | null {
  if (id === spec.boss.id) return 'boss';
  return spec.camp.find((c) => c.id === id)?.type ?? null;
}
