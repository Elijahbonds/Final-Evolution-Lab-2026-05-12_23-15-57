/**
 * The story's worlds, drawn (Phase B; Babylon). The sim never sees this file: it reads the same pieces through the host.
 * Each world's pieces become meshes merged by look (a handful of draw calls per world), plus the rails (A1's rail mesh),
 * the hub's gates (a ring each: open, sealed by flight, or leading nowhere yet), and the decor boxes.
 *
 * The flats are drawn as thick slabs, so the voids between them read as drops and the worlds as islands. Placeholder
 * looks: plain colours per world until the owner's art direction (plan decision 3); nothing from a feel reference.
 * Budget (plan: ≤ 450 draws / ≤ 300 active meshes on a phone): about 4 merged meshes per world, one per gate, the rails.
 */

import { Color3, Mesh, MeshBuilder, StandardMaterial, type Scene } from '@babylonjs/core';
import { buildRailMeshes } from '../../rails/view';
import type { GroundPiece } from '../pieces';
import type { StoryMap } from './storyMap';
import type { HubGates } from '../../story/gates';

/** Per world: the ground, the raised blocks, the walls. Placeholder palette. [PLACEHOLDER] */
const LOOK: Readonly<Record<string, { ground: string; block: string; wall: string }>> = {
  hub: { ground: '#334155', block: '#475569', wall: '#94a3b8' },
  w1: { ground: '#2f3a2c', block: '#57534e', wall: '#a8a29e' },
};
const DEFAULT_LOOK = { ground: '#3f3f46', block: '#52525b', wall: '#a1a1aa' };
/** The slab under a flat, metres (the cliff a void shows). [TUNE] */
const SLAB_DEPTH = 6;
const GATE_OPEN = '#22d3ee', GATE_FLIGHT = '#a78bfa', GATE_SHUT = '#57534e';

export interface StoryView {
  /** Re-colour the gates from their state (call when a flag changes; cheap). */
  syncGates(o: { flight: boolean; reached: (id: string) => boolean }): void;
  dispose(): void;
  readonly meshCount: number;
}

function mat(scene: Scene, name: string, hex: string, emissive = 0): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.06, 0.06, 0.06);
  if (emissive > 0) m.emissiveColor = Color3.FromHexString(hex).scale(emissive);
  return m;
}

function pieceMesh(scene: Scene, p: GroundPiece): Mesh {
  const w = p.maxX - p.minX, d = p.maxZ - p.minZ, cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
  if (p.kind === 'flat') {
    const m = MeshBuilder.CreateBox(`story_${p.id}`, { width: w, height: SLAB_DEPTH, depth: d }, scene);
    m.position.set(cx, p.y - SLAB_DEPTH / 2, cz);
    return m;
  }
  if (p.kind === 'block') {
    const h = Math.max(0.05, p.top - p.y0);
    const m = MeshBuilder.CreateBox(`story_${p.id}`, { width: w, height: h, depth: d }, scene);
    m.position.set(cx, p.y0 + h / 2, cz);
    return m;
  }
  const along = p.axis === 'z' ? d : w, rise = p.y1 - p.y0;
  const len = Math.hypot(along, rise), ang = Math.atan2(rise, along);
  const m = MeshBuilder.CreateBox(`story_${p.id}`, p.axis === 'z' ? { width: w, height: 0.3, depth: len } : { width: len, height: 0.3, depth: d }, scene);
  m.position.set(cx, (p.y0 + p.y1) / 2 - 0.15, cz);
  if (p.axis === 'z') m.rotation.x = -ang; else m.rotation.z = ang;
  return m;
}

export function buildStoryView(scene: Scene, map: StoryMap, gates: HubGates): StoryView {
  const owned: { dispose(): void }[] = [];
  const merge = (name: string, meshes: Mesh[], hex: string) => {
    if (!meshes.length) return;
    const merged = meshes.length === 1 ? meshes[0] : Mesh.MergeMeshes(meshes, true, true);
    if (!merged) return;
    merged.name = name;
    merged.material = mat(scene, `${name}_mat`, hex);
    merged.isPickable = false;
    merged.receiveShadows = true;
    merged.freezeWorldMatrix();
    owned.push(merged, merged.material);
  };
  for (const w of map.worlds.values()) {
    const look = LOOK[w.id] ?? DEFAULT_LOOK;
    const groups: Record<'ground' | 'block' | 'wall', Mesh[]> = { ground: [], block: [], wall: [] };
    for (const p of w.pieces) {
      // a run-wall reads lighter than the rest of the blocks (its id names it)
      const g = p.kind === 'flat' || p.kind === 'ramp' ? 'ground' : /(^|\.)wall$/.test(p.id) ? 'wall' : 'block';
      groups[g].push(pieceMesh(scene, p));
    }
    for (const d of w.decor ?? []) {
      const m = MeshBuilder.CreateBox(`story_${w.id}_decor`, { width: d.w, height: d.h, depth: d.d }, scene);
      m.position.set(d.x, (d.y ?? 0) + d.h / 2, d.z);
      m.material = mat(scene, `story_${w.id}_decor_${d.color}`, d.color, 0.35);
      m.isPickable = false;
      m.freezeWorldMatrix();
      owned.push(m, m.material);
    }
    merge(`story_${w.id}_ground`, groups.ground, look.ground);
    merge(`story_${w.id}_block`, groups.block, look.block);
    merge(`story_${w.id}_wall`, groups.wall, look.wall);
  }
  const rails = buildRailMeshes(scene, map.rails, { diameter: 0.12, color: '#e2e8f0' });
  if (rails) owned.push(rails);

  // the gates: a standing ring each, coloured by its state
  const gateMats = { open: mat(scene, 'story_gate_open', GATE_OPEN, 0.6), flight: mat(scene, 'story_gate_flight', GATE_FLIGHT, 0.5), shut: mat(scene, 'story_gate_shut', GATE_SHUT, 0.1) };
  owned.push(gateMats.open, gateMats.flight, gateMats.shut);
  const rings: { id: string; mesh: Mesh }[] = [];
  for (const w of map.worlds.values()) {
    for (const g of w.gates) {
      const ring = MeshBuilder.CreateTorus(`story_gate_${g.id}`, { diameter: g.radius * 2, thickness: 0.35, tessellation: 24 }, scene);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(g.pos.x, g.pos.y + g.radius + 0.2, g.pos.z);
      ring.isPickable = false;
      rings.push({ id: g.id, mesh: ring });
      owned.push(ring);
    }
  }
  const view: StoryView = {
    meshCount: scene.meshes.length,
    syncGates(o): void {
      for (const r of rings) {
        const st = gates.stateOf(r.id, o);
        r.mesh.material = st?.open ? gateMats.open : st?.shut === 'flight' ? gateMats.flight : gateMats.shut;
      }
    },
    dispose(): void { for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose(); },
  };
  return view;
}
