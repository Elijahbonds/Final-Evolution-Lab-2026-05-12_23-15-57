/**
 * VENICE V1: the courts district, drawn (docs/VENICE-HUB-PLAN.md §4 "Assets"; the prototype's measurement, §5.2).
 *
 * The shipped Venice kit, called read-only exactly as the hoops modes call it:
 *   the painted court   visual/CourtSurface.mountStreetCourt with the dunk's Venice palette — painted ONCE and drawn at all
 *                       four courts as instances of the one mesh (perf.veniceSharedCourt, default 1). The paint itself was already
 *                       cached per scene (CourtSurface); a separate mesh per court added its own material and asphalt detail map:
 *                       +3 textures, about 4 MB on the phone rig (73 → 77 MB measured, scripts/probes/venice-hub/hub-rig.mts).
 *   the hoops           visual/meshyProps.spawnMeshyProp('hoop'), one per court, rim facing the court
 *   the dressing        nexus/veniceBoardwalk.mountVeniceDunkDressing (the baked palms, the boardwalk row), laid round Court 3
 *                       as the dunk lays it round its court; palms that would stand on another court are hidden.
 * Around them: a concrete park slab, sand, the bike path and the sea, as flat tiled planes (visual/groundTextures, one shared
 * texture per surface), and a ring and a sign at each court's walk-up spot.
 */

import {
  Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, TransformNode, type AbstractMesh, type Scene,
} from '@babylonjs/core';
import { mountStreetCourt, VENICE_DUNK_COURT_PALETTE } from '@/lib/babylon/visual/CourtSurface';
import { spawnMeshyProp } from '@/lib/babylon/visual/meshyProps';
import { mountVeniceDunkDressing } from '@/lib/babylon/nexus/veniceBoardwalk';
import { groundTexture, TILE_M, type GroundKind } from '@/lib/babylon/visual/groundTextures';
import { feel } from '@/lib/feel-panel/feel';
import { courtsRect, v1Area, v1Spots } from './hubWorld';

/** perf.veniceSharedCourt: 1 = one court mesh drawn at every court as instances (new); 0 = a mesh, material and detail map per court (the prototype's way). */
export const VENICE_SHARED_COURT = 1;
/** The painted court's size (m): the shipped 16 × 28 court slab (nexus/veniceBoardwalk COURT). */
export const COURT_HALF = { w: 8, l: 14 } as const;
/** How far inside a court's edge a dressing palm may not stand (m). */
const PALM_CLEAR = { w: 11, l: 17 } as const;

export interface CourtsView { root: TransformNode; courtTextures: number; ready: Promise<void>; dispose(): void }

export function mountCourtsView(scene: Scene, parent: TransformNode | null = null): CourtsView {
  const root = new TransformNode('venice_courts', scene);
  root.parent = parent;
  const mats: StandardMaterial[] = [], texs: DynamicTexture[] = [];
  const surface = (name: string, kind: GroundKind | null, hex: string, w: number, d: number, x: number, z: number, y: number): Mesh => {
    const g = MeshBuilder.CreateGround(name, { width: w, height: d }, scene);
    g.position.set(x, y, z); g.parent = root; g.isPickable = false; g.receiveShadows = true;
    const m = new StandardMaterial(`${name}_mat`, scene);
    m.specularColor = Color3.Black();
    if (kind) {
      const t = groundTexture(scene, kind, 512);
      t.uScale = Math.max(1, w / TILE_M[kind]); t.vScale = Math.max(1, d / TILE_M[kind]);
      m.diffuseTexture = t; m.diffuseColor = Color3.FromHexString(hex); texs.push(t);
    } else m.diffuseColor = Color3.FromHexString(hex);
    g.material = m; mats.push(m);
    g.freezeWorldMatrix();
    return g;
  };

  // the ground: sand under everything walkable, the park's concrete under the courts, the bike path, the sea to the west
  const a = v1Area(), c = courtsRect();
  surface('venice_sand', 'sand', '#E8D3A8', a.maxX - a.minX + 120, a.maxZ - a.minZ + 120, (a.minX + a.maxX) / 2 + 20, (a.minZ + a.maxZ) / 2, -0.02);
  surface('venice_park', 'concrete', '#C9C4BA', c.maxX - c.minX - 8, c.maxZ - c.minZ - 8, (c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2, 0);
  surface('venice_bikepath', 'asphalt', '#5A5F66', 8, a.maxZ - a.minZ + 120, c.maxX + 6, (a.minZ + a.maxZ) / 2, 0.005);
  surface('venice_sea', null, '#1E5A86', 600, 900, a.minX - 330, (a.minZ + a.maxZ) / 2, -0.4);

  // the four courts: ONE painted court, drawn at each spot
  const share = feel('perf.veniceSharedCourt', VENICE_SHARED_COURT) >= 0.5;
  const spots = v1Spots();
  const courts: AbstractMesh[] = [];
  let courtTextures = 0;
  let master: Mesh | null = null;
  for (const s of spots) {
    const x = s.at[0], z = s.at[1];
    if (share && master) {
      const inst = master.createInstance(`venice_court_${s.id}`);
      inst.parent = root; inst.position.set(x, master.position.y, z); inst.isPickable = false; inst.freezeWorldMatrix();
      courts.push(inst);
      continue;
    }
    const m = mountStreetCourt(scene, root, [x - COURT_HALF.w, x + COURT_HALF.w], [z - COURT_HALF.l, z + COURT_HALF.l], 0.02, VENICE_DUNK_COURT_PALETTE);
    courtTextures++;
    courts.push(m);
    if (share) {
      // re-centre the master on its spot so an instance is placed by its spot alone
      master = m;
    }
  }
  if (share && master) {
    // the master's geometry was built at the first spot; instances add their offset from it
    const s0 = spots[0];
    for (let i = 1; i < courts.length; i++) {
      const s = spots[i];
      courts[i].position.set(master.position.x + (s.at[0] - s0.at[0]), master.position.y, master.position.z + (s.at[1] - s0.at[1]));
      courts[i].freezeWorldMatrix();
    }
  }

  // the hoops (rim toward the court), the rings and the signs
  const jobs: Promise<unknown>[] = [];
  const ringMat = new StandardMaterial('venice_ring_mat', scene);
  ringMat.diffuseColor = Color3.FromHexString('#FFD166'); ringMat.emissiveColor = Color3.FromHexString('#FFD166').scale(0.55); ringMat.specularColor = Color3.Black();
  mats.push(ringMat);
  let ringMaster: Mesh | null = null;
  for (const s of spots) {
    const at = new TransformNode(`venice_hoop_at_${s.id}`, scene);
    at.parent = root; at.position.set(s.at[0], 0, s.at[1] - COURT_HALF.l + 0.9);
    jobs.push(spawnMeshyProp(scene, 'hoop', at, `venice_hoop_${s.id}`));
    if (!ringMaster) {
      ringMaster = MeshBuilder.CreateTorus('venice_ring', { diameter: 5, thickness: 0.22, tessellation: 40 }, scene);
      ringMaster.material = ringMat; ringMaster.parent = root; ringMaster.isPickable = false;
      ringMaster.position.set(s.at[0] + COURT_HALF.w + 3, 0.08, s.at[1]);
    } else {
      const r = ringMaster.createInstance(`venice_ring_${s.id}`);
      r.parent = root; r.position.set(s.at[0] + COURT_HALF.w + 3, 0.08, s.at[1]); r.isPickable = false;
    }
    const sign = MeshBuilder.CreatePlane(`venice_sign_${s.id}`, { width: 4.2, height: 1.1, sideOrientation: Mesh.DOUBLESIDE }, scene);
    // the court's name above its far baseline, behind the hoop (where the eye looks across the court, never in front of the camera)
    sign.parent = root; sign.position.set(s.at[0], 5.4, s.at[1] - COURT_HALF.l - 1.6); sign.billboardMode = Mesh.BILLBOARDMODE_Y; sign.isPickable = false;
    const t = new DynamicTexture(`venice_sign_tex_${s.id}`, { width: 512, height: 128 }, scene, false);
    const g = t.getContext() as CanvasRenderingContext2D;
    g.fillStyle = 'rgba(8,10,16,0.9)'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#FFD166'; g.font = 'bold 54px sans-serif'; g.textBaseline = 'middle';
    g.fillText(s.label.replace('[PLACEHOLDER] ', '').slice(0, 18), 20, 66);
    t.update(); texs.push(t);
    const sm = new StandardMaterial(`venice_sign_mat_${s.id}`, scene); sm.disableLighting = true; sm.emissiveTexture = t; sign.material = sm; mats.push(sm);
  }

  // the dressing round Court 3 (the dunk's own layout); palms that would stand on a court are hidden
  const flight = spots.find((s) => s.id === 'court.flight') ?? spots[0];
  const dress = new TransformNode('venice_dressing', scene);
  dress.parent = root; dress.position.set(flight.at[0], 0, flight.at[1] - COURT_HALF.l + 1.32);
  const onCourt = (x: number, z: number) => spots.some((s) => Math.abs(x - s.at[0]) < PALM_CLEAR.w && Math.abs(z - s.at[1]) < PALM_CLEAR.l);
  jobs.push(mountVeniceDunkDressing(scene, dress, { crowdCards: false, phoneRail: true }).then(() => {
    for (const n of scene.transformNodes) if (/^vb_palm_\d+$/.test(n.name)) { const p = n.getAbsolutePosition(); if (onCourt(p.x, p.z)) n.setEnabled(false); }
  }).catch((e) => console.warn('[VENICE] dressing', e)));

  return {
    root,
    courtTextures,
    ready: Promise.allSettled(jobs).then(() => undefined),
    dispose() { for (const t of texs) t.dispose(); for (const m of mats) m.dispose(); root.dispose(false, true); },
  };
}
