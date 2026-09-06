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
import type { Scene } from '@babylonjs/core';

const COURT = { hx: 8, hz: 14 };                 // 16 × 28 court slab (venueSpecs basketball_*)
export const BOARDWALK = { apron: 3, grass: 5, walkW: 9, sandW: 34 };

function flat(scene: Scene, name: string, w: number, d: number, x: number, z: number, y: number, hex: string, holder: TransformNode, rough = 1): Mesh {
  const g = MeshBuilder.CreateGround(name, { width: w, height: d }, scene);
  g.position.set(x, y, z); g.parent = holder; g.isPickable = false; g.receiveShadows = true;
  // PBR like every kit prop: a StandardMaterial under the venue sun + grade blew the grass to lime and the sand to white
  const m = new PBRMaterial(`${name}_mat`, scene);
  m.albedoColor = Color3.FromHexString(hex); m.roughness = rough; m.metallic = 0; m.environmentIntensity = 0.35;
  g.material = m;
  return g;
}

export function decorateVeniceBoardwalk(scene: Scene, root: TransformNode): TransformNode {
  const holder = new TransformNode('venice_boardwalk', scene); holder.parent = root;
  const { apron, grass, walkW, sandW } = BOARDWALK;
  // concrete apron around the slab (a hair above the scan's painted ground), then the boardwalk strip to the east
  const ax = COURT.hx + apron, az = COURT.hz + apron;
  flat(scene, 'vb_apron_w', apron, az * 2, -(COURT.hx + apron / 2), 0, 0.012, '#B9AFA0', holder);
  flat(scene, 'vb_apron_e', apron, az * 2, COURT.hx + apron / 2, 0, 0.012, '#B9AFA0', holder);
  flat(scene, 'vb_apron_n', ax * 2, apron, 0, -(COURT.hz + apron / 2), 0.012, '#B9AFA0', holder);
  flat(scene, 'vb_apron_s', ax * 2, apron, 0, COURT.hz + apron / 2, 0.012, '#B9AFA0', holder);
  // one continuous surround out to the dome wall (190 m): grass east of the apron, the boardwalk, more grass to the shop line;
  // the coast wraps the NORTH (behind the hoop, where the dunk camera looks) and the WEST — sand, then water to the horizon
  const L = 190, GRASS = '#3A5233', GRASS2 = '#3E5838';   // inside the 400 m sky sphere (radius 200); greyed greens — the grade pushes greens toward lime
  const northSand = -(az + 40), northSea = northSand - 14;            // shop line at z −50, sand from −57, water from −71
  const westSand = -(ax + grass), westSea = westSand - sandW;
  const zSpanN = (northSand - (-L)) ;                                  // (unused span helper kept readable)
  flat(scene, 'vb_grass_e', grass, L * 2, ax + grass / 2, 0, 0.01, GRASS, holder);
  flat(scene, 'vb_walk', walkW, L * 2, ax + grass + walkW / 2, 0, 0.011, '#C8BFB0', holder);
  flat(scene, 'vb_grass_far_e', L, L * 2, ax + grass + walkW + L / 2, 0, 0.01, GRASS2, holder);
  flat(scene, 'vb_grass_n', ax * 2, -northSand - az, 0, (northSand - az) / 2, 0.01, GRASS, holder);
  flat(scene, 'vb_grass_s', ax * 2, L - az, 0, az + (L - az) / 2, 0.01, GRASS, holder);
  flat(scene, 'vb_grass_w', grass, L * 2, -(ax + grass / 2), 0, 0.01, GRASS, holder);
  // sand: a strip down the west side and a strip across the north, then water beyond both
  flat(scene, 'vb_sand_w', sandW, L * 2, westSand - sandW / 2, 0, 0.008, '#CDB48C', holder);
  flat(scene, 'vb_sand_n', ax * 2 + grass * 2 + walkW + L, northSand - northSea, (westSand + ax + grass + walkW + L) / 2, (northSand + northSea) / 2, 0.008, '#CDB48C', holder);
  const seaMat = new PBRMaterial('vb_sea_mat', scene);
  seaMat.albedoColor = Color3.FromHexString('#3B3A6E'); seaMat.roughness = 0.35; seaMat.metallic = 0; seaMat.environmentIntensity = 0.6;
  seaMat.emissiveColor = new Color3(0.10, 0.06, 0.12);
  const seaW = MeshBuilder.CreateGround('vb_sea_w', { width: L, height: L * 2 }, scene); seaW.position.set(westSea - L / 2, 0, 0); seaW.parent = holder; seaW.material = seaMat; seaW.isPickable = false;
  const seaN = MeshBuilder.CreateGround('vb_sea_n', { width: L * 2, height: L }, scene); seaN.position.set(0, 0, northSea - L / 2); seaN.parent = holder; seaN.material = seaMat; seaN.isPickable = false;
  // the sun low over the northern water, where the hoop camera looks: a warm disc and a soft glow, just under the dome
  const sun = MeshBuilder.CreateDisc('vb_sun', { radius: 6, tessellation: 48 }, scene);
  sun.position.set(-48, 11, -186); sun.billboardMode = Mesh.BILLBOARDMODE_ALL; sun.parent = holder; sun.isPickable = false;
  const sm = new StandardMaterial('vb_sun_mat', scene); sm.emissiveColor = new Color3(1, 0.93, 0.78); sm.disableLighting = true; sun.material = sm;
  // (an additive glow plane read as a cone against the dome — the disc alone carries the sun; the bake carries the sky)
  void zSpanN;
  // a slow shimmer on the water: the specular highlight drifts
  let t = 0;
  const obs = scene.onBeforeRenderObservable.add(() => { t += scene.getEngine().getDeltaTime() / 1000; seaMat.roughness = 0.35 + Math.sin(t * 0.7) * 0.06; });
  holder.onDisposeObservable.add(() => scene.onBeforeRenderObservable.remove(obs));
  console.info('[FEL-VENICE] boardwalk scenery built (apron, grass, boardwalk, sand, ocean, sun) — props from venice-court-meshy');
  return holder;
}
