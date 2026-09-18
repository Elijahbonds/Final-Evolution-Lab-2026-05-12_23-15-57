// ARENA BUILD — the meshes for a combat arena (combat/arenas.ts): its walls, ropes, pillars, hazards, and for a drop
// arena the platform and the pit under it. Everything under one root, so dispose() is total (the NexusVenue rule).
//
// Walls are named `wall_arena_*` so the CameraDirector's occlusion probe sees them (it keys on the 'wall_' prefix, see
// NexusWebScene's wall prop). The venue paints the floor and the sky (mountVenue with the `arena` option); this builds
// only what the fight touches.

import { Color3, Mesh, MeshBuilder, PBRMaterial, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { CombatArena } from './arenas';

export interface ArenaHandle {
  root: TransformNode;
  /** Advance the hazard flames and the rope glow. */
  tick(dt: number): void;
  dispose(): void;
}

export interface ArenaBuildOptions {
  /** Build the raised platform + the pit for a DROP arena (Mixed / Duel). Default true for drop edges. */
  platform?: boolean;
  /** How far the platform's top sits above y 0 (Duel stands its bodies on DISC_LIFT). */
  lift?: number;
}

function pbr(scene: Scene, name: string, hex: string, rough = 0.85, metal = 0): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(hex); m.roughness = rough; m.metallic = metal; m.environmentIntensity = 0.35;
  return m;
}
function glow(scene: Scene, name: string, hex: string, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.emissiveColor = Color3.FromHexString(hex); m.disableLighting = true; m.alpha = alpha;
  return m;
}

export function buildArena(scene: Scene, arena: CombatArena, opts: ArenaBuildOptions = {}): ArenaHandle {
  const root = new TransformNode(`arena_${arena.id}`, scene);
  const lift = opts.lift ?? 0;
  const flames: { mesh: ReturnType<typeof MeshBuilder.CreateSphere>; y0: number; phase: number }[] = [];
  const ropes: StandardMaterial[] = [];

  // ── walls: a stone / steel slab per segment, or a translucent rope panel for a cage ──
  const wallMat = arena.edge === 'ropes'
    ? glow(scene, `arena_${arena.id}_ropes_m`, arena.look.wallColor, 0.28)
    : pbr(scene, `arena_${arena.id}_wall_m`, arena.look.wallColor, 0.92);
  wallMat.backFaceCulling = true;
  if (arena.edge === 'ropes') ropes.push(wallMat as StandardMaterial);
  const railMat = glow(scene, `arena_${arena.id}_rail_m`, arena.look.accent);
  arena.walls.forEach((w, i) => {
    const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, len = Math.hypot(dx, dz);
    const thick = arena.edge === 'ropes' ? 0.06 : 0.35;
    // A PLANE FACING IN, not a box. The fight cameras sit BEHIND the player, so a player backed onto a wall puts the camera
    // outside it — and a box's outer face then fills the frame (measured: a solid green frame on the dojo's north wall).
    // A single-sided plane facing the arena is solid from inside and culled from behind, so the camera looks through it.
    const m = MeshBuilder.CreatePlane(`wall_arena_${arena.id}_${i}`, { width: len + thick, height: w.height, sideOrientation: Mesh.FRONTSIDE }, scene);
    m.position.set((w.a.x + w.b.x) / 2, lift + w.height / 2, (w.a.z + w.b.z) / 2);
    m.rotation.y = Math.atan2(w.nx, w.nz) + Math.PI;   // a plane's front faces −z; turn it to face along the inward normal
    m.material = wallMat; m.isPickable = false; m.parent = root; m.receiveShadows = true;
    if (arena.edge === 'ropes') {
      // the top rail and two cables, so the panel reads as ropes rather than glass
      for (const y of [w.height, w.height * 0.66, w.height * 0.33]) {
        const r = MeshBuilder.CreateBox(`arena_${arena.id}_rail_${i}_${y.toFixed(1)}`, { width: len + 0.12, height: 0.06, depth: 0.08 }, scene);
        r.position.set((w.a.x + w.b.x) / 2, lift + y, (w.a.z + w.b.z) / 2); r.rotation.y = Math.atan2(dx, dz) - Math.PI / 2; r.material = railMat; r.isPickable = false; r.parent = root;
      }
      const post = MeshBuilder.CreateCylinder(`arena_${arena.id}_post_${i}`, { height: w.height + 0.2, diameter: 0.14 }, scene);
      post.position.set(w.a.x, lift + (w.height + 0.2) / 2, w.a.z); post.material = railMat; post.isPickable = false; post.parent = root;
    } else {
      // a cap line along the top, in the arena's accent, so the edge reads from the fight camera
      const cap = MeshBuilder.CreateBox(`arena_${arena.id}_cap_${i}`, { width: len + thick, height: 0.05, depth: thick + 0.04 }, scene);
      cap.position.copyFrom(m.position); cap.position.y = lift + w.height + 0.02; cap.rotation.y = Math.atan2(dx, dz) - Math.PI / 2; cap.material = railMat; cap.isPickable = false; cap.parent = root;
    }
  });

  // ── pillars ──
  const pillarMat = pbr(scene, `arena_${arena.id}_pillar_m`, arena.look.wallColor, 0.8, 0.1);
  arena.pillars.forEach((p, i) => {
    const m = MeshBuilder.CreateCylinder(`wall_arena_${arena.id}_pillar_${i}`, { height: p.h, diameter: p.r * 2, tessellation: 12 }, scene);
    m.position.set(p.x, lift + p.h / 2, p.z); m.material = pillarMat; m.isPickable = false; m.parent = root; m.receiveShadows = true;
    const band = MeshBuilder.CreateTorus(`arena_${arena.id}_pillar_band_${i}`, { diameter: p.r * 2 + 0.06, thickness: 0.05, tessellation: 12 }, scene);
    band.position.set(p.x, lift + Math.min(p.h - 0.1, 1.1), p.z); band.material = railMat; band.isPickable = false; band.parent = root;
  });

  // ── hazards: a glowing floor disc and a few flames that bob ──
  arena.hazards.forEach((h, i) => {
    const disc = MeshBuilder.CreateDisc(`arena_${arena.id}_hazard_${i}`, { radius: h.r, tessellation: 24 }, scene);
    disc.rotation.x = Math.PI / 2; disc.position.set(h.x, lift + 0.015, h.z);
    disc.material = glow(scene, `arena_${arena.id}_hazard_m_${i}`, h.kind === 'fire' ? '#ff5a1f' : '#7dd3fc', 0.75);
    disc.isPickable = false; disc.parent = root;
    const ring = MeshBuilder.CreateTorus(`arena_${arena.id}_hazard_ring_${i}`, { diameter: h.r * 2 + 0.1, thickness: 0.06, tessellation: 24 }, scene);
    ring.position.set(h.x, lift + 0.03, h.z); ring.material = railMat; ring.isPickable = false; ring.parent = root;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2, rr = h.r * 0.55;
      const f = MeshBuilder.CreateSphere(`arena_${arena.id}_flame_${i}_${k}`, { diameter: 0.3 + (k % 2) * 0.12, segments: 6 }, scene);
      f.position.set(h.x + Math.sin(a) * rr, lift + 0.3, h.z + Math.cos(a) * rr);
      f.material = glow(scene, `arena_${arena.id}_flame_m_${i}_${k}`, h.kind === 'fire' ? (k % 2 ? '#ffb347' : '#ff7b3d') : '#bae6fd', 0.9);
      f.isPickable = false; f.parent = root;
      flames.push({ mesh: f, y0: f.position.y, phase: k * 1.3 + i });
    }
  });

  // ── a drop arena stands on a platform over a pit (the fall has to have somewhere to go) ──
  if (arena.edge === 'drop' && (opts.platform ?? true)) {
    const platMat = pbr(scene, `arena_${arena.id}_plat_m`, arena.look.wallColor, 0.9);
    const plat = arena.shape.kind === 'disc'
      ? MeshBuilder.CreateCylinder(`arena_${arena.id}_platform`, { diameter: arena.shape.radius * 2 + 0.6, height: 1.4, tessellation: 8 }, scene)
      : MeshBuilder.CreateBox(`arena_${arena.id}_platform`, { width: arena.shape.halfX * 2 + 0.6, depth: arena.shape.halfZ * 2 + 0.6, height: 1.4 }, scene);
    plat.position.y = lift - 0.7; plat.material = platMat; plat.parent = root; plat.receiveShadows = true;
    const rim = arena.shape.kind === 'disc'
      ? MeshBuilder.CreateTorus(`arena_${arena.id}_rim`, { diameter: arena.shape.radius * 2, thickness: 0.09, tessellation: 8 }, scene)
      : MeshBuilder.CreateBox(`arena_${arena.id}_rim`, { width: arena.shape.halfX * 2, depth: arena.shape.halfZ * 2, height: 0.04 }, scene);
    rim.position.y = lift + 0.02; rim.material = railMat; rim.isPickable = false; rim.parent = root;
    if (arena.shape.kind === 'box') { rim.material = glow(scene, `arena_${arena.id}_rim_m`, arena.look.accent, 0.35); }
    const pit = MeshBuilder.CreateGround(`arena_${arena.id}_pit`, { width: 60, height: 60 }, scene);
    pit.position.y = -6; pit.material = pbr(scene, `arena_${arena.id}_pit_m`, '#101418', 1); pit.parent = root;
  }

  let t = 0;
  return {
    root,
    tick(dt) {
      t += dt;
      for (const f of flames) { f.mesh.position.y = f.y0 + Math.sin(t * 7 + f.phase) * 0.09; const s = 0.85 + Math.sin(t * 11 + f.phase) * 0.15; f.mesh.scaling.set(s, 1.2 + Math.sin(t * 9 + f.phase) * 0.25, s); }
      for (const r of ropes) r.alpha = 0.24 + Math.sin(t * 2.2) * 0.05;
    },
    dispose() {
      for (const m of root.getChildMeshes()) { m.material?.dispose(); m.dispose(); }
      root.dispose();
    },
  };
}

/** Spawn positions for a two-fighter round: facing each other across the arena's short axis, inside it. */
export function duelSpawns(arena: CombatArena, apart = 4.4): [Vector3, Vector3] {
  return [new Vector3(0, 0, apart / 2), new Vector3(0, 0, -apart / 2)];
}
