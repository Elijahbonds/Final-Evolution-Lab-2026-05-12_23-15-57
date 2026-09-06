// Venice boardwalk — the concept photo (public/backdrops/dunk.jpg) rebuilt as scenery, not used as a texture (owner
// 2026-09-05: "recreate that background picture as the background environment; that just gives you the concept").
//
// Reading the concept: the court sits on a concrete apron; to the WEST the grass gives way to sand and the Pacific with
// the sun low over the water; to the EAST a concrete boardwalk lined with shop fronts, market tents and lamp posts; palm
// rows on both sides and a second line of shops closing the far end behind the hoop. The pieces here are procedural
// (apron, grass, sand, ocean, sun); the props (shops, tents, palms, lamps, bus, sedan) are placements in prop set
// 'venice-court-meshy' (venuePropSets.ts). Runs for the basketball venues under Venice only — a picked location brings
// its own environment. Everything hangs under the venue root and dies with it.
import { Color3, Mesh, MeshBuilder, PBRMaterial, StandardMaterial, TransformNode } from '@babylonjs/core';
import { courtLogoTexture, groundTextureFor, signTexture, TILE_M, type GroundKind } from '../visual/groundTextures';
import { HOOP_SCAN, spawnMeshyProp } from '../visual/meshyProps';
import type { Scene } from '@babylonjs/core';

const COURT = { hx: 8, hz: 14 };                 // 16 × 28 court slab (venueSpecs basketball_*)
export const BOARDWALK = { apron: 3, grass: 5, walkW: 9, sandW: 34 };

function flat(scene: Scene, name: string, w: number, d: number, x: number, z: number, y: number, hex: string, holder: TransformNode, rough = 1, kind?: GroundKind): Mesh {
  const g = MeshBuilder.CreateGround(name, { width: w, height: d }, scene);
  g.position.set(x, y, z); g.parent = holder; g.isPickable = false; g.receiveShadows = true;
  // PBR like every kit prop: a StandardMaterial under the venue sun + grade blew the grass to lime and the sand to white
  const m = new PBRMaterial(`${name}_mat`, scene);
  m.albedoColor = Color3.FromHexString(hex); m.roughness = rough; m.metallic = 0; m.environmentIntensity = 0.35;
  if (kind) {
    // Pass 7 phase 2: a tiling procedural albedo (groundTextures.ts) — the flat colour becomes grass, sand or concrete
    m.albedoTexture = groundTextureFor(scene, kind, w / TILE_M[kind], d / TILE_M[kind]); m.albedoColor = Color3.White();
  }
  g.material = m;
  return g;
}

export function decorateVeniceBoardwalk(scene: Scene, root: TransformNode): TransformNode {
  const holder = new TransformNode('venice_boardwalk', scene); holder.parent = root;
  const { apron, grass, walkW, sandW } = BOARDWALK;
  // concrete apron around the slab (a hair above the scan's painted ground), then the boardwalk strip to the east
  const ax = COURT.hx + apron, az = COURT.hz + apron;
  flat(scene, 'vb_apron_w', apron, az * 2, -(COURT.hx + apron / 2), 0, 0.012, '#B9AFA0', holder, 1, 'concrete');
  flat(scene, 'vb_apron_e', apron, az * 2, COURT.hx + apron / 2, 0, 0.012, '#B9AFA0', holder, 1, 'concrete');
  // the scan is 26 m long under a 28 m court: the baseline aprons start where the scan's paint ends (owner: "the court is cut off")
  // measured 2026-09-05: the scan's mesh is centred at z ≈ 10.9 and spans 26 m — its paint runs from z −2 (the dunk hoop's
  // baseline) to z +24, ten metres past the gameplay court. The south apron starts where the paint ends.
  const SCAN_N = -2.1, SCAN_S = 23.9;
  flat(scene, 'vb_apron_n', ax * 2, apron, 0, SCAN_N - apron / 2, 0.012, '#B9AFA0', holder, 1, 'concrete');
  flat(scene, 'vb_apron_s', ax * 2, apron, 0, SCAN_S + apron / 2, 0.012, '#B9AFA0', holder, 1, 'concrete');
  // one continuous surround out to the dome wall (190 m): grass east of the apron, the boardwalk, more grass to the shop line;
  // the coast wraps the NORTH (behind the hoop, where the dunk camera looks) and the WEST — sand, then water to the horizon
  const L = 190, GRASS = '#3A5233', GRASS2 = '#3E5838';   // inside the 400 m sky sphere (radius 200); greyed greens — the grade pushes greens toward lime
  const northSand = -(az + 40), northSea = northSand - 14;            // shop line at z −50, sand from −57, water from −71
  const westSand = -(ax + grass), westSea = westSand - sandW;
  const zSpanN = (northSand - (-L)) ;                                  // (unused span helper kept readable)
  flat(scene, 'vb_grass_e', grass, L * 2, ax + grass / 2, 0, 0.01, GRASS, holder, 1, 'grass');
  flat(scene, 'vb_walk', walkW, L * 2, ax + grass + walkW / 2, 0, 0.011, '#C8BFB0', holder, 1, 'concrete');
  flat(scene, 'vb_grass_far_e', L, L * 2, ax + grass + walkW + L / 2, 0, 0.01, GRASS2, holder, 1, 'grass');
  flat(scene, 'vb_grass_n', ax * 2, -northSand - az, 0, (northSand - az) / 2, 0.01, GRASS, holder, 1, 'grass');
  flat(scene, 'vb_grass_s', ax * 2, L - (SCAN_S + apron), 0, SCAN_S + apron + (L - (SCAN_S + apron)) / 2, 0.01, GRASS, holder, 1, 'grass');
  flat(scene, 'vb_grass_w', grass, L * 2, -(ax + grass / 2), 0, 0.01, GRASS, holder, 1, 'grass');
  // sand: a strip down the west side and a strip across the north, then water beyond both
  flat(scene, 'vb_sand_w', sandW, L * 2, westSand - sandW / 2, 0, 0.008, '#CDB48C', holder, 1, 'sand');
  flat(scene, 'vb_sand_n', ax * 2 + grass * 2 + walkW + L, northSand - northSea, (westSand + ax + grass + walkW + L) / 2, (northSand + northSea) / 2, 0.008, '#CDB48C', holder, 1, 'sand');
  const seaMat = new PBRMaterial('vb_sea_mat', scene);
  seaMat.albedoColor = Color3.FromHexString('#3B3A6E'); seaMat.roughness = 0.35; seaMat.metallic = 0; seaMat.environmentIntensity = 0.6;
  seaMat.emissiveColor = new Color3(0.10, 0.06, 0.12);
  const seaW = MeshBuilder.CreateGround('vb_sea_w', { width: L, height: L * 2 }, scene); seaW.position.set(westSea - L / 2, 0, 0); seaW.parent = holder; seaW.material = seaMat; seaW.isPickable = false;
  const seaN = MeshBuilder.CreateGround('vb_sea_n', { width: L * 2, height: L }, scene); seaN.position.set(0, 0, northSea - L / 2); seaN.parent = holder; seaN.material = seaMat; seaN.isPickable = false;
  // The sun is PAINTED into the beach dome (scripts/backdrop/paint-beach-dome.py, u≈0.33): a 3D disc at the dome wall rendered as a
  // navy coin from the threes and ones cameras (depth against the dome at 190 m) while it read white from dunk's. No disc.
  void zSpanN;
  // a slow shimmer on the water: the specular highlight drifts
  let t = 0;
  const obs = scene.onBeforeRenderObservable.add(() => { t += scene.getEngine().getDeltaTime() / 1000; seaMat.roughness = 0.35 + Math.sin(t * 0.7) * 0.06; });
  holder.onDisposeObservable.add(() => scene.onBeforeRenderObservable.remove(obs));
  // Owner 2026-09-05: the far baseline carries the scanned hoop as well, mirrored — the court reads as a full court
  void spawnMeshyProp(scene, 'hoop', holder, 'vb_far_hoop').then((root) => {
    if (!root) return;
    const s = 3.05 / HOOP_SCAN.rimY; root.scaling.setAll(s); root.rotation.y = Math.PI;
    root.position.set(0, 0, SCAN_S - 0.6 + HOOP_SCAN.rimZ * s);   // owner: on the south key's baseline, where the paint ends
  });
  // Pass 7 phase 4 — signage with real names: an entrance sign at the south gate, a scoreboard plate behind the far hoop,
  // flags on the boardwalk lamp posts (unlit boards so the paint reads under the grade; ~10 draws)
  const sign = (name: string, w: number, h: number, pos: [number, number, number], yaw: number, tex: ReturnType<typeof signTexture>) => {
    const plane = MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
    plane.position.set(pos[0], pos[1], pos[2]); plane.rotation.y = yaw; plane.parent = holder; plane.isPickable = false;
    const m = new StandardMaterial(`${name}_mat`, scene); m.emissiveTexture = tex; m.emissiveColor = Color3.Black(); m.disableLighting = true; m.backFaceCulling = false;
    plane.material = m; return plane;
  };
  const post = (name: string, x: number, z: number, hgt: number) => { const c = MeshBuilder.CreateCylinder(name, { height: hgt, diameter: 0.14 }, scene); c.position.set(x, hgt / 2, z); c.parent = holder; c.isPickable = false; const pm = new PBRMaterial(`${name}_mat`, scene); pm.albedoColor = Color3.FromHexString('#2A2E37'); pm.roughness = 0.6; pm.metallic = 0.4; c.material = pm; return c; };
  post('vb_gate_post_l', 7.1, 27.5, 3.4); post('vb_gate_post_r', 10.9, 27.5, 3.4);   // owner: back off the paint, to the right
  sign('vb_gate_sign', 4.2, 1.0, [9, 3.0, 27.5], Math.PI, signTexture(scene, ['VENICE BEACH COURTS', 'FINAL EVOLUTION LAB · EST. 2026'], { bg: '#1E2A44', accent: '#F2B84B' }));
  sign('vb_scoreboard', 4.8, 1.3, [7.5, 3.0, -19.5], Math.PI, signTexture(scene, ['FLIGHT NIGHT', 'VENICE · OPEN RUN · ALL LEVELS'], { bg: '#141826', fg: '#FFE9B0', accent: '#FF6B3D' }));
  const flagTex = signTexture(scene, ['FEL'], { bg: '#B03A2E', fg: '#FFF4E0', accent: '#F2B84B', w: 256, h: 640 });
  for (let i = 0; i < 4; i++) { const z = -36 + i * 24; sign(`vb_flag_${i}`, 0.5, 1.25, [19.55, 4.0, z + 0.5], Math.PI / 2, flagTex); }
  // Pass 7 phase 1: a half-court logo decal on the scan (centre circle, 3.6 m), matte, alpha-blended
  const logo = MeshBuilder.CreateGround('vb_court_logo', { width: 3.6, height: 3.6 }, scene);
  logo.position.set(0, 0.03, 10.9); logo.parent = holder;   // the scan's centre circle logo.isPickable = false;
  const lm = new PBRMaterial('vb_court_logo_mat', scene); lm.albedoTexture = courtLogoTexture(scene); lm.useAlphaFromAlbedoTexture = true; lm.transparencyMode = 2; lm.roughness = 0.9; lm.metallic = 0; lm.albedoColor = Color3.White(); lm.environmentIntensity = 0.3;
  logo.material = lm;
  console.info('[FEL-VENICE] boardwalk scenery built (apron, grass, boardwalk, sand, ocean, sun) — props from venice-court-meshy');
  return holder;
}
