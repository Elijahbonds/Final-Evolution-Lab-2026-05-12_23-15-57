// THE TRACKS GET A WORLD (vis-board, visual wave 2, 2026-10-13) — Part B freerun: "Theme the course pieces ... Rooftop: AC units,
// billboards (signTexture), neon; Dam: pipes and overgrowth; Terminal: containers; Temple: columns and statue." The audit's own
// verdict on the mode: "coloured PBR boxes (graybox) ... no crowd, no props, no ambient FX".
//
// This is the code half of that list: kit-bashed from primitives (no new art), placed OUTSIDE the slab the runner uses, on a yard deck below it (YARD_DROP) — the
// course (a 20 m slab, three lanes, x −10 … +10) is untouched, so no collider, route or tuned number changes. Per track:
//   neon-rooftop      AC units and fan housings, billboards on legs with neon signs (named `neon_sign_*`: the shared glow layer
//                     draws their halo), antenna masts with red warning bulbs (`lantern_mast_*`: a small light each, desktop)
//   hydro-dam         pipe runs with rust bands and valve wheels, concrete blocks, overgrowth (squashed green masses)
//   freight-terminal  container stacks in four liveries, and gantry cranes standing over the yard
//   sunken-temple     columns (some broken), a statue every so often, moss on the stone
// Everything but the signs and bulbs is merged per material — a handful of draws for a whole track. Placement is pure (seeded by
// the track and the course's length, so a rebuild is the same world; spots that would touch a course piece are dropped) and tested
// without a scene. Phones get a third of the props: the same read, a third of the draws.

import { Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import { lookFeatureOff } from '../scene/graphicsSetting';   // vis-board: ?lookoff=… switches one feature off for a one-build A/B
import { settleEmissive, unlitDiffuse } from './unlit';

export interface CoursePiece { kind: string; x: number; y: number; z: number; w: number; h: number; d: number }
export type DressKind = 'ac' | 'billboard' | 'mast' | 'pipe' | 'valve' | 'block' | 'overgrowth' | 'container' | 'crane' | 'column' | 'broken' | 'statue';
export interface DressSpot { kind: DressKind; x: number; z: number; yaw: number; scale: number; variant: number }

/** The runner's slab is 20 m wide; props stand past this. */
export const SLAB_EDGE = 10;
export const PROP_MARGIN = 3;
/** The yard the props stand on: a deck either side of the course, YARD_DROP below the slab's top. Beyond the slab there is nothing
 *  but the far-off world, so a prop built at the slab's height hung in the air; this gives it a floor, and gives the runner
 *  the read of a course running along a ledge, with the track's world laid out below. Cosmetic: no collider, nothing to land on. */
export const YARD_DROP = 5;
export const YARD_INNER = SLAB_EDGE + 1.5;
export const YARD_OUTER = 38;
const YARD_HEX: Record<string, string> = { 'neon-rooftop': '#121724', 'hydro-dam': '#3a443e', 'freight-terminal': '#2b2e34', 'sunken-temple': '#4f4636' };

/** Which prop kinds a track gets, in the weights they are drawn at. */
export const TRACK_KINDS: Record<string, readonly [DressKind, number][]> = {
  'neon-rooftop': [['ac', 5], ['billboard', 3], ['mast', 2]],
  'hydro-dam': [['pipe', 5], ['valve', 1], ['block', 3], ['overgrowth', 4]],
  'freight-terminal': [['container', 7], ['crane', 1]],
  'sunken-temple': [['column', 5], ['broken', 3], ['statue', 1]],
};

/** mulberry32 — a seeded stream, so the same course dresses the same way every build. */
function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

/** Pure: the footprint half-size of a prop (so two props, or a prop and a piece, are kept apart). */
export function footprint(kind: DressKind, scale: number): number {
  switch (kind) {
    case 'ac': return 1.6 * scale; case 'billboard': return 3.6 * scale; case 'mast': return 0.6 * scale;
    case 'pipe': return 4.5 * scale; case 'valve': return 0.8 * scale; case 'block': return 2 * scale; case 'overgrowth': return 2.2 * scale;
    case 'container': return 3.2 * scale; case 'crane': return 5 * scale;
    case 'column': return 0.9 * scale; case 'broken': return 1 * scale; case 'statue': return 2 * scale;
  }
}

/**
 * Pure: where the props go. Down both sides of the course every 14–24 m, at 3–16 m past the slab's edge; a spot whose footprint
 * touches a course piece (a wall that overhangs the slab, a gate) is dropped, as is one inside another prop's footprint.
 * `density` (0..1) thins the list for a phone.
 */
export function dressingSpots(trackId: string, pieces: readonly CoursePiece[], density = 1): DressSpot[] {
  const kinds = TRACK_KINDS[trackId];
  if (!kinds) return [];
  const finish = pieces.find((p) => p.kind === 'finish');
  const zEnd = (finish?.z ?? Math.max(0, ...pieces.map((p) => p.z))) + 12;
  const rand = rng(hashStr(trackId) ^ Math.round(zEnd));
  const total = kinds.reduce((a, [, w]) => a + w, 0);
  const pick = (): DressKind => { let r = rand() * total; for (const [k, w] of kinds) { r -= w; if (r <= 0) return k; } return kinds[0][0]; };
  const out: DressSpot[] = [];
  const clear = (x: number, z: number, r: number): boolean => {
    for (const p of pieces) {
      if (p.kind === 'gap') continue;
      if (Math.abs(x - p.x) < p.w / 2 + r + 1 && Math.abs(z - p.z) < p.d / 2 + r + 1) return false;
    }
    for (const o of out) { if (Math.hypot(o.x - x, o.z - z) < footprint(o.kind, o.scale) + r) return false; }
    return true;
  };
  for (let z = -6; z < zEnd; z += 14 + rand() * 10) {
    for (const side of [-1, 1]) {
      if (rand() > Math.max(0, Math.min(1, density))) continue;
      const kind = pick();
      const scale = 0.85 + rand() * 0.5;
      const x = side * (SLAB_EDGE + PROP_MARGIN + rand() * 13);
      const zz = z + (rand() - 0.5) * 6;
      if (!clear(x, zz, footprint(kind, scale))) continue;
      out.push({ kind, x, z: zz, yaw: (rand() - 0.5) * 0.6 + (kind === 'pipe' ? Math.PI / 2 : 0), scale, variant: Math.floor(rand() * 4) });
    }
  }
  return out;
}

export interface DressHandle { readonly draws: number; readonly spots: number; dispose(): void }

function canvasTex(scene: Scene, name: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): DynamicTexture | null {
  try {
    const t = new DynamicTexture(name, { width: w, height: h }, scene, true);
    paint(t.getContext() as unknown as CanvasRenderingContext2D);
    t.update(true);
    return t;
  } catch { return null; }
}

const SIGNS: { text: string; color: string }[] = [
  { text: 'OPEN 24H', color: '#22d3ee' }, { text: 'HOTEL', color: '#f472b6' }, { text: 'NOODLE', color: '#fbbf24' }, { text: 'FEL', color: '#a78bfa' },
];

export function mountFreeRunDressing(scene: Scene, trackId: string, pieces: readonly CoursePiece[], tier: string | null | undefined, palette: Record<string, string> = {}): DressHandle {
  const spots = lookFeatureOff('dress') ? [] : dressingSpots(trackId, pieces, tier === 'mobile' ? 0.34 : 1);
  const owned: { dispose(): void }[] = [];
  const singles: AbstractMesh[] = [];
  const groups = new Map<string, { mat: PBRMaterial; parts: Mesh[] }>();
  const mat = (key: string, hex: string, emissive = 0.04, rough = 0.8, metal = 0.1): PBRMaterial => {
    const g = groups.get(key);
    if (g) return g.mat;
    const m = new PBRMaterial(`fr_dress_${key}_m`, scene);
    m.albedoColor = Color3.FromHexString(hex); m.emissiveColor = Color3.FromHexString(hex).scale(emissive); m.metallic = metal; m.roughness = rough;
    owned.push(m); groups.set(key, { mat: m, parts: [] });
    return m;
  };
  const add = (key: string, hex: string, m: Mesh, emissive?: number, rough?: number, metal?: number): Mesh => {
    mat(key, hex, emissive, rough, metal); groups.get(key)!.parts.push(m); return m;
  };
  const tex: (DynamicTexture | null)[] = trackId === 'neon-rooftop' ? SIGNS.map((s, i) => canvasTex(scene, `fr_sign_tex_${i}`, 512, 192, (g) => {
    g.fillStyle = '#05060c'; g.fillRect(0, 0, 512, 192);
    g.strokeStyle = s.color; g.lineWidth = 10; g.strokeRect(14, 14, 484, 164);
    g.fillStyle = s.color; g.font = 'bold 92px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = s.color; g.shadowBlur = 26; g.fillText(s.text, 256, 100);
  })) : [];
  for (const t of tex) if (t) owned.push(t);
  const base = -YARD_DROP;   // props stand on the yard deck below the slab, not in the air beside it

  spots.forEach((s, n) => {
    const x = s.x, z = s.z, k = s.scale, side = Math.sign(x) || 1;
    const place = (m: Mesh, dx: number, y: number, dz: number, ry = 0): Mesh => {
      // a prop is built about its own centre then turned by its yaw: rotate the offset, not the mesh, so a group stays together
      const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      m.position.set(x + dx * c + dz * sn, base + y, z - dx * sn + dz * c); m.rotation.y = s.yaw + ry;
      return m;
    };
    switch (s.kind) {
      case 'ac': {
        add('ac', '#3a4150', place(MeshBuilder.CreateBox('fr_ac', { width: 2.6 * k, height: 1.3 * k, depth: 1.7 * k }, scene), 0, 0.65 * k, 0), 0.02, 0.6, 0.5);
        add('acfan', '#161a22', place(MeshBuilder.CreateCylinder('fr_acfan', { diameter: 1.1 * k, height: 0.18 * k, tessellation: 14 }, scene), -0.5 * k, 1.38 * k, 0), 0, 0.5, 0.7);
        add('acfan', '#161a22', place(MeshBuilder.CreateCylinder('fr_acfan', { diameter: 1.1 * k, height: 0.18 * k, tessellation: 14 }, scene), 0.6 * k, 1.38 * k, 0), 0, 0.5, 0.7);
        break;
      }
      case 'billboard': {
        for (const lx of [-2.2, 2.2]) add('bbleg', '#232733', place(MeshBuilder.CreateBox('fr_bbleg', { width: 0.3, height: 4.2 * k, depth: 0.3 }, scene), lx * k, 2.1 * k, 0), 0, 0.5, 0.6);
        add('bbleg', '#232733', place(MeshBuilder.CreateBox('fr_bbframe', { width: 6.1 * k, height: 2.5 * k, depth: 0.25 }, scene), 0, 5.2 * k, 0), 0, 0.5, 0.6);
        // the sign stands in front of the frame, on the course's side, its face toward x = 0 (a plane's front looks down −z: +π/2 turns
        // it to face −x, −π/2 to face +x)
        const sign = MeshBuilder.CreatePlane(`neon_sign_${n}`, { width: 5.7 * k, height: 2.1 * k }, scene);
        sign.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        sign.position.set(x - side * 0.2, base + 5.2 * k, z);
        const m = new StandardMaterial(`neon_sign_m_${n}`, scene);
        m.disableLighting = true; m.diffuseColor = unlitDiffuse(); m.specularColor = Color3.Black(); m.emissiveColor = new Color3(0.95, 0.95, 1); m.backFaceCulling = false;
        const t = tex[s.variant % tex.length]; if (t) { m.emissiveTexture = t; settleEmissive(m); } else m.emissiveColor = Color3.FromHexString(SIGNS[s.variant % SIGNS.length].color);
        sign.material = m; owned.push(m); sign.isPickable = false; singles.push(sign);
        break;
      }
      case 'mast': {
        add('mast', '#2b303c', place(MeshBuilder.CreateCylinder('fr_mast', { diameter: 0.22, height: 9 * k, tessellation: 6 }, scene), 0, 4.5 * k, 0), 0, 0.5, 0.6);
        const bulb = MeshBuilder.CreateSphere(`lantern_mast_${n}`, { diameter: 0.42, segments: 6 }, scene);
        bulb.position.set(x, base + 9.1 * k, z);
        const bm = new StandardMaterial(`lantern_mast_m_${n}`, scene); bm.disableLighting = true; bm.diffuseColor = unlitDiffuse(); bm.specularColor = Color3.Black(); bm.emissiveColor = new Color3(1, 0.17, 0.33);
        bulb.material = bm; owned.push(bm); bulb.isPickable = false; singles.push(bulb);
        break;
      }
      case 'pipe': {
        const len = 8 * k;
        for (let r = 0; r < 2; r++) {
          const p = place(MeshBuilder.CreateCylinder('fr_pipe', { diameter: 1.1 * k, height: len, tessellation: 12 }, scene), 0, (0.6 + r * 1.15) * k, 0);
          p.rotation.x = Math.PI / 2;
          add('pipe', '#6d7f72', p, 0.02, 0.55, 0.5);
          for (const t of [-0.34, 0.1, 0.38]) {
            const band = place(MeshBuilder.CreateCylinder('fr_pipeband', { diameter: 1.18 * k, height: 0.22, tessellation: 12 }, scene), 0, (0.6 + r * 1.15) * k, t * len);
            band.rotation.x = Math.PI / 2; add('rust', '#8a5a3a', band, 0, 0.9, 0.2);
          }
        }
        break;
      }
      case 'valve': {
        add('rust', '#8a5a3a', place(MeshBuilder.CreateCylinder('fr_valvestem', { diameter: 0.3 * k, height: 1.6 * k, tessellation: 8 }, scene), 0, 0.8 * k, 0), 0, 0.9, 0.2);
        const wheel = place(MeshBuilder.CreateTorus('fr_valve', { diameter: 1.3 * k, thickness: 0.14 * k, tessellation: 16 }, scene), 0, 1.7 * k, 0); add('valve', '#b3382c', wheel, 0.05, 0.6, 0.3);
        break;
      }
      case 'block': {
        add('block', '#7c837d', place(MeshBuilder.CreateBox('fr_block', { width: 3.4 * k, height: 2.4 * k + (s.variant % 2) * 1.2, depth: 2.6 * k }, scene), 0, 1.2 * k + (s.variant % 2) * 0.6, 0), 0, 0.95, 0);
        break;
      }
      case 'overgrowth': {
        for (let i = 0; i < 4; i++) {
          const b = place(MeshBuilder.CreateSphere('fr_growth', { diameter: (1.6 + (i % 2) * 0.9) * k, segments: 6 }, scene), Math.cos(i * 1.9) * 1.4 * k, 0.5 * k, Math.sin(i * 1.9) * 1.3 * k);
          b.scaling.y = 0.55; add('growth', i % 2 ? '#3f7a44' : '#2f6a3a', b, 0.01, 0.95, 0);
        }
        break;
      }
      case 'container': {
        const hexes = ['#b3382c', '#2f6db3', '#d98a1f', '#3f8a5a'];
        const n2 = 1 + (s.variant % 3);
        for (let i = 0; i < n2; i++) {
          const c = place(MeshBuilder.CreateBox('fr_container', { width: 2.5 * k, height: 2.6 * k, depth: 6.1 * k }, scene), 0, (1.3 + i * 2.65) * k, 0);
          add(`cont${(s.variant + i) % 4}`, hexes[(s.variant + i) % 4], c, 0.02, 0.6, 0.35);
          add('contrib', '#d8dde4', place(MeshBuilder.CreateBox('fr_contdoor', { width: 2.5 * k + 0.04, height: 0.14, depth: 0.14 }, scene), 0, (2.35 + i * 2.65) * k, 3.0 * k), 0, 0.6, 0.3);
        }
        break;
      }
      case 'crane': {
        for (const dz of [-3.5, 3.5]) for (const dx of [-3, 3]) add('crane', '#c9a227', place(MeshBuilder.CreateBox('fr_craneleg', { width: 0.5, height: 15 * k, depth: 0.5 }, scene), dx * k, 7.5 * k, dz * k), 0.02, 0.5, 0.5);
        add('crane', '#c9a227', place(MeshBuilder.CreateBox('fr_cranebeam', { width: 7 * k, height: 0.9, depth: 9 * k }, scene), 0, 15.2 * k, 0), 0.02, 0.5, 0.5);
        break;
      }
      case 'column': {
        const h = (6 + (s.variant % 3)) * k;
        add('stone', '#cdb98f', place(MeshBuilder.CreateCylinder('fr_column', { diameterTop: 1.0 * k, diameterBottom: 1.15 * k, height: h, tessellation: 14 }, scene), 0, h / 2, 0), 0.01, 0.9, 0);
        add('stone', '#cdb98f', place(MeshBuilder.CreateBox('fr_colbase', { width: 1.7 * k, height: 0.4 * k, depth: 1.7 * k }, scene), 0, 0.2 * k, 0), 0.01, 0.9, 0);
        add('stone', '#cdb98f', place(MeshBuilder.CreateBox('fr_colcap', { width: 1.8 * k, height: 0.45 * k, depth: 1.8 * k }, scene), 0, h + 0.22 * k, 0), 0.01, 0.9, 0);
        break;
      }
      case 'broken': {
        const h = (2 + (s.variant % 3)) * k;
        const c = place(MeshBuilder.CreateCylinder('fr_broken', { diameterTop: 1.0 * k, diameterBottom: 1.15 * k, height: h, tessellation: 12 }, scene), 0, h / 2, 0); add('stone', '#bfab82', c, 0.01, 0.95, 0);
        const drum = place(MeshBuilder.CreateCylinder('fr_drum', { diameter: 1.0 * k, height: 1.1 * k, tessellation: 12 }, scene), 1.3 * k, 0.5 * k, 0.8 * k); drum.rotation.z = Math.PI / 2 - 0.15; add('stone', '#bfab82', drum, 0.01, 0.95, 0);
        add('growth', '#4d8a52', (() => { const m = place(MeshBuilder.CreateSphere('fr_moss', { diameter: 1.2 * k, segments: 5 }, scene), 0.5 * k, 0.3 * k, 0.4 * k); m.scaling.y = 0.4; return m; })(), 0.01, 0.95, 0);
        break;
      }
      case 'statue': {
        add('stone2', '#9a8a6a', place(MeshBuilder.CreateBox('fr_plinth', { width: 2.4 * k, height: 1.4 * k, depth: 2.4 * k }, scene), 0, 0.7 * k, 0), 0.01, 0.9, 0);
        add('stone2', '#9a8a6a', place(MeshBuilder.CreateBox('fr_torso', { width: 1.3 * k, height: 2.6 * k, depth: 0.8 * k }, scene), 0, 2.7 * k, 0), 0.01, 0.9, 0);
        add('stone2', '#9a8a6a', place(MeshBuilder.CreateSphere('fr_head', { diameter: 0.9 * k, segments: 8 }, scene), 0, 4.45 * k, 0), 0.01, 0.9, 0);
        add('stone2', '#9a8a6a', place(MeshBuilder.CreateBox('fr_arm', { width: 0.4 * k, height: 2.0 * k, depth: 0.4 * k }, scene), 0.95 * k, 3.0 * k, 0.3 * k), 0.01, 0.9, 0);
        break;
      }
    }
  });

  if (spots.length) {   // the yard: one deck each side, long enough to hold every prop and the view past the finish
    const zLo = Math.min(...pieces.map((p) => p.z - p.d / 2)) - 24, zHi = Math.max(...pieces.map((p) => p.z + p.d / 2)) + 30;
    for (const side of [-1, 1]) {
      const deck = MeshBuilder.CreateBox('fr_yard', { width: YARD_OUTER - YARD_INNER, height: 1.4, depth: zHi - zLo }, scene);
      deck.position.set(side * (YARD_INNER + YARD_OUTER) / 2, base - 0.7, (zLo + zHi) / 2);
      add('yard', YARD_HEX[trackId] ?? '#4b4f55', deck, 0.01, 0.92, 0);
    }
  }

  const merged: Mesh[] = [];
  for (const [key, g] of groups) {
    if (!g.parts.length) continue;
    for (const p of g.parts) p.computeWorldMatrix(true);
    const one = g.parts.length === 1 ? g.parts[0] : Mesh.MergeMeshes(g.parts, true, true);
    if (!one) continue;
    one.name = `fr_dress_${key}`; one.material = g.mat; one.isPickable = false; one.receiveShadows = true; one.freezeWorldMatrix();
    merged.push(one);
  }
  for (const m of singles) { m.isPickable = false; m.receiveShadows = false; m.freezeWorldMatrix(); }
  void palette;
  return {
    draws: merged.length + singles.length, spots: spots.length,
    dispose() { for (const m of merged) m.dispose(); for (const m of singles) m.dispose(); for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose(); merged.length = 0; singles.length = 0; },
  };
}
