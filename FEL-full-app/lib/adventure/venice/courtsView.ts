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
  Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, StandardMaterial, TransformNode, type AbstractMesh, type Material, type Scene,
} from '@babylonjs/core';
import { mountStreetCourt, VENICE_DUNK_COURT_PALETTE } from '@/lib/babylon/visual/CourtSurface';
import { spawnMeshyProp } from '@/lib/babylon/visual/meshyProps';
import { mountVeniceDunkDressing } from '@/lib/babylon/nexus/veniceBoardwalk';
import { groundTexture, TILE_M, type GroundKind } from '@/lib/babylon/visual/groundTextures';
import { feel } from '@/lib/feel-panel/feel';
import { courtsRect, v1Area, v1Spots } from './hubWorld';
import { mountCourtsDressing, VENICE_LOOK_V2 } from './courtsDressing';

/** perf.veniceSharedCourt: 1 = one court mesh drawn at every court as instances (new); 0 = a mesh, material and detail map per court (the prototype's way). */
export const VENICE_SHARED_COURT = 1;
/** venue.deferScenery (improvement pass phase 3): 1 = the courts show their plain court colour and the far scenery (the palms,
 *  the boardwalk row) waits until the player can move, then the paint and the scenery arrive (new); 0 = everything during the
 *  load, as V1. */
export const VENICE_DEFER_SCENERY = 1;
/** The painted court's size (m): the shipped 16 × 28 court slab (nexus/veniceBoardwalk COURT). */
export const COURT_HALF = { w: 8, l: 14 } as const;
/** How far inside a court's edge a dressing palm may not stand (m). */
const PALM_CLEAR = { w: 11, l: 17 } as const;

export interface CourtsView {
  root: TransformNode;
  /** Painted court textures made so far (1 once painted with the court shared). */
  readonly courtTextures: number;
  /** What the load waits for (the hoops; with deferral off, the dressing too). */
  ready: Promise<void>;
  /** Called once the player can move: the deferred paint and scenery arrive. Idempotent; resolves when they have landed. */
  afterPlayable(): Promise<void>;
  dispose(): void;
}

export function mountCourtsView(scene: Scene, parent: TransformNode | null = null): CourtsView {
  const root = new TransformNode('venice_courts', scene);
  root.parent = parent;
  const mats: Material[] = [], texs: DynamicTexture[] = [];
  // phase 5 (venue.veniceLookV2): lit (PBR) grounds and sea under the scene's sky light, and the park's furniture
  const look2 = feel('venue.veniceLookV2', VENICE_LOOK_V2) >= 0.5;
  const ROUGH: Record<string, number> = { sand: 0.96, concrete: 0.82, asphalt: 0.9 };
  // lit by the golden-hour sky, V1's warm-grey concrete read as sand (phase 5's first phone shot): a cooler grey keeps the slab and
  // the sand apart
  const LIT_TINT: Record<string, string> = { concrete: '#A9AEB3' };
  const surface = (name: string, kind: GroundKind | null, hex: string, w: number, d: number, x: number, z: number, y: number): Mesh => {
    const g = MeshBuilder.CreateGround(name, { width: w, height: d }, scene);
    g.position.set(x, y, z); g.parent = root; g.isPickable = false; g.receiveShadows = true;
    if (look2) {
      const m = new PBRMaterial(`${name}_mat`, scene);
      m.metallic = 0;
      if (kind) {
        const t = groundTexture(scene, kind, 512);
        t.uScale = Math.max(1, w / TILE_M[kind]); t.vScale = Math.max(1, d / TILE_M[kind]);
        m.albedoTexture = t; m.albedoColor = Color3.FromHexString(LIT_TINT[kind] ?? hex); m.roughness = ROUGH[kind] ?? 0.9; texs.push(t);
      } else {
        // the sea: dark, smooth, the sky in it (the scene's environment light)
        m.albedoColor = Color3.FromHexString(hex); m.roughness = 0.16; m.environmentIntensity = 0.9;
      }
      g.material = m; mats.push(m);
      g.freezeWorldMatrix();
      return g;
    }
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
  const defer = feel('venue.deferScenery', VENICE_DEFER_SCENERY) >= 0.5;
  const spots = v1Spots();
  let courtTextures = 0;
  // deferred: a plain plate in the court's own base colour at each court until the paint lands (one mesh, instanced)
  let plates: Mesh | null = null;
  if (defer) {
    plates = MeshBuilder.CreateGround('venice_court_plate', { width: COURT_HALF.w * 2, height: COURT_HALF.l * 2 }, scene);
    const pm = new StandardMaterial('venice_court_plate_mat', scene);
    pm.diffuseColor = Color3.FromHexString(VENICE_DUNK_COURT_PALETTE.base); pm.specularColor = Color3.Black(); mats.push(pm);
    plates.material = pm; plates.parent = root; plates.isPickable = false; plates.position.set(spots[0].at[0], 0.02, spots[0].at[1]);
    for (const s of spots.slice(1)) { const i = plates.createInstance(`venice_court_plate_${s.id}`); i.parent = root; i.position.set(s.at[0], 0.02, s.at[1]); i.isPickable = false; }
  }
  const paintCourts = (): void => {
  const courts: AbstractMesh[] = [];
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
  };
  if (!defer) paintCourts();

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
    if (!look2) {   // V1's floating name sign (phase 5: the name boards replace it)
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
  }

  // the dressing round Court 3 (the dunk's own layout); palms that would stand on a court are hidden
  const flight = spots.find((s) => s.id === 'court.flight') ?? spots[0];
  const onCourt = (x: number, z: number) => spots.some((s) => Math.abs(x - s.at[0]) < PALM_CLEAR.w && Math.abs(z - s.at[1]) < PALM_CLEAR.l);
  const dressing = (): Promise<unknown> => {
    if (root.isDisposed()) return Promise.resolve();
    const dress = new TransformNode('venice_dressing', scene);
    dress.parent = root; dress.position.set(flight.at[0], 0, flight.at[1] - COURT_HALF.l + 1.32);
    return mountVeniceDunkDressing(scene, dress, { crowdCards: false, phoneRail: true }).then(() => {
      for (const n of scene.transformNodes) if (/^vb_palm_\d+$/.test(n.name)) { const p = n.getAbsolutePosition(); if (onCourt(p.x, p.z)) n.setEnabled(false); }
    }).catch((e) => console.warn('[VENICE] dressing', e));
  };
  let furniture: { dispose(): void } | null = null;
  const furnish = (): void => { if (look2 && !furniture && !root.isDisposed()) furniture = mountCourtsDressing(scene, root); };
  if (!defer) { jobs.push(dressing()); furnish(); }

  let later: Promise<void> | null = null;
  return {
    root,
    get courtTextures() { return courtTextures; },
    ready: Promise.allSettled(jobs).then(() => undefined),
    afterPlayable() {
      if (!defer) return Promise.resolve();
      if (later) return later;
      later = (async () => {
        if (root.isDisposed()) return;
        const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
        paintCourts();
        if (plates) { plates.dispose(); plates = null; }
        furnish();
        await dressing();
        console.info(`[VENICE] deferred scenery landed in ${Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0)} ms`);
      })();
      return later;
    },
    dispose() { furniture?.dispose(); for (const t of texs) t.dispose(); for (const m of mats) m.dispose(); root.dispose(false, true); },
  };
}
