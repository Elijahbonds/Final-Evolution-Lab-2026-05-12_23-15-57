// Venice boardwalk — the concept photo (public/backdrops/dunk.jpg) rebuilt as scenery, not used as a texture (owner
// 2026-09-05: "recreate that background picture as the background environment; that just gives you the concept").
//
// Reading the concept: the court sits on a concrete apron; to the WEST the grass gives way to sand and the Pacific with
// the sun low over the water; to the EAST a concrete boardwalk lined with shop fronts, market tents and lamp posts; palm
// rows on both sides and a second line of shops closing the far end behind the hoop. The pieces here are procedural
// (apron, grass, sand, ocean, sun); the props (shops, tents, palms, lamps, bus, sedan) are placements in prop set
// 'venice-court-meshy' (venuePropSets.ts). Runs for the basketball venues under Venice only — a picked location brings
// its own environment. Everything hangs under the venue root and dies with it.
//
// DUNK-VENICE-ENV-RENDER (2026-09-28): the dunk's Venice ('venice-dunk') has no lawn — the green planes were the eye's
// "green ground" — but beach to the water, the bike path, the Ocean Front Walk and a plaza, a court in the Venice kit's blue,
// and its own prop set ('venice-dunk': tall palms, vendors, boats on the water). The sky and sun are the look pass's
// (visual/veniceSurroundVisibility.ts). 1v1, 3v3, three-point and the carnival keep the lawn build unchanged.
import { Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { mountStreetCourt, STREET_COURT_PALETTE, VENICE_DUNK_COURT_PALETTE } from '../visual/CourtSurface';
import { courtLogoTexture, groundTextureFor, signTexture, TILE_M, type GroundKind } from '../visual/groundTextures';
import { HOOP_SCAN, spawnMeshyProp } from '../visual/meshyProps';
import { Onlookers } from '../visual/Onlookers';
import type { Scene } from '@babylonjs/core';

const COURT = { hx: 8, hz: 14 };                 // 16 × 28 court slab (venueSpecs basketball_*)
export const BOARDWALK = { apron: 3, grass: 5, walkW: 9, sandW: 34 };

/**
 * DUNK-VENICE-ENV-RENDER (2026-09-28): the Venice dunk's ground, east of the court (+x) — no lawn. The grass planes were
 * the green field the eye read around the dunk court (and 190 m of it to the eastern horizon); Venice is concrete and sand:
 * a planting strip of sand for the palm row, the beach BIKE PATH (dark asphalt, dashed yellow centre line), the Ocean Front
 * Walk (a 14 m concrete promenade) and a paved plaza behind it where the vendors stand. West and north of the court it is
 * beach to the water. x edges in metres.
 */
export const DUNK_BOARDWALK = { bikeX: [13.5, 17] as const, walkX: [17, 31] as const, plazaX0: 31, northSand: -57 };

/** Which Venice: 'lawn' is the shared hoops boardwalk (1v1, 3v3, three-point, carnival); 'venice-dunk' is the dunk's own. */
export type BoardwalkEnv = 'lawn' | 'venice-dunk';

function flat(scene: Scene, name: string, w: number, d: number, x: number, z: number, y: number, hex: string, holder: TransformNode, rough = 1, kind?: GroundKind, mul?: string): Mesh {
  const g = MeshBuilder.CreateGround(name, { width: w, height: d }, scene);
  g.position.set(x, y, z); g.parent = holder; g.isPickable = false; g.receiveShadows = true;
  // PBR like every kit prop: a StandardMaterial under the venue sun + grade blew the grass to lime and the sand to white
  const m = new PBRMaterial(`${name}_mat`, scene);
  m.albedoColor = Color3.FromHexString(hex); m.roughness = rough; m.metallic = 0; m.environmentIntensity = 0.35;
  if (kind) {
    // Pass 7 phase 2: a tiling procedural albedo (groundTextures.ts) — the flat colour becomes grass, sand or concrete
    // (`hex` is not used once a kind paints the albedo; `mul` multiplies the texture — the Venice dunk sets its sand, walk and
    // plaza apart in VALUE this way, since two concretes share one texture)
    m.albedoTexture = groundTextureFor(scene, kind, w / TILE_M[kind], d / TILE_M[kind]); m.albedoColor = mul ? Color3.FromHexString(mul) : Color3.White();
  }
  g.material = m;
  return g;
}

/**
 * `scanShiftZ`: how far the venue map is slid along z for this mode (NexusVenue). The scan is mounted for the half-court modes
 * (its north baseline meets the ones/threes rim at z −1.32); dunk's rim sits at z −11, so dunk slides the scan −9 and the
 * aprons, far hoop, centre logo and gate sign slide with it — the owner's Luma reference (2026-09-06) shows both hoops on
 * the concrete right behind each baseline.
 */
export function decorateVeniceBoardwalk(scene: Scene, root: TransformNode, scanShiftZ = 0, env: BoardwalkEnv = 'lawn'): TransformNode {
  const holder = new TransformNode('venice_boardwalk', scene); holder.parent = root;
  const { apron, grass, walkW, sandW } = BOARDWALK;
  // concrete apron around the slab (a hair above the scan's painted ground), then the boardwalk strip to the east
  const ax = COURT.hx + apron, az = COURT.hz + apron;
  flat(scene, 'vb_apron_w', apron, az * 2, -(COURT.hx + apron / 2), 0, 0.012, '#B9AFA0', holder, 1, 'concrete');
  flat(scene, 'vb_apron_e', apron, az * 2, COURT.hx + apron / 2, 0, 0.012, '#B9AFA0', holder, 1, 'concrete');
  // the scan is 26 m long under a 28 m court: the baseline aprons start where the scan's paint ends (owner: "the court is cut off")
  // measured 2026-09-05: the scan's mesh is centred at z ≈ 10.9 and spans 26 m — its paint runs from z −2 (the dunk hoop's
  // baseline) to z +24, ten metres past the gameplay court. The south apron starts where the paint ends.
  const SCAN_N = -2.1 + scanShiftZ, SCAN_S = 23.9 + scanShiftZ, SCAN_MID = 10.9 + scanShiftZ;
  flat(scene, 'vb_apron_n', ax * 2, apron, 0, SCAN_N - apron / 2, 0.012, '#B9AFA0', holder, 1, 'concrete');
  flat(scene, 'vb_apron_s', ax * 2, apron, 0, SCAN_S + apron / 2, 0.012, '#B9AFA0', holder, 1, 'concrete');
  // one continuous surround out to the dome wall (190 m): grass east of the apron, the boardwalk, more grass to the shop line;
  // the coast wraps the NORTH (behind the hoop, where the dunk camera looks) and the WEST — sand, then water to the horizon
  const L = 190, GRASS = '#3A5233', GRASS2 = '#3E5838';   // inside the 400 m sky sphere (radius 200); greyed greens — the grade pushes greens toward lime
  const northSand = -(az + 40), northSea = northSand - 14;            // shop line at z −50, sand from −57, water from −71
  const westSand = -(ax + grass), westSea = westSand - sandW;
  const zSpanN = (northSand - (-L)) ;                                  // (unused span helper kept readable)
  const dunkEnv = env === 'venice-dunk';
  const grassN0 = SCAN_N - apron;
  if (dunkEnv) {
    // DUNK-VENICE-ENV-RENDER: sand from the aprons out to the water (west and north) and under the palm strip, then the bike
    // path, the promenade and the plaza to the east. Six planes where the lawn build laid eight, and not one of them green.
    // Multipliers over the shared ground textures, so the court stays the lit thing in the frame: the low sun and the hemi
    // fill blew the plain sand to white-beige, and the walk and the plaza (one concrete texture) read as one slab.
    const D = DUNK_BOARDWALK, far = L + 25, SAND = '#C4B39A';
    flat(scene, 'vb_sand', D.bikeX[0] - westSea, L - northSea, (westSea + D.bikeX[0]) / 2, (northSea + L) / 2, 0.008, SAND, holder, 1, 'sand', SAND);
    flat(scene, 'vb_sand_n', far - D.bikeX[0], D.northSand - northSea, (D.bikeX[0] + far) / 2, (northSea + D.northSand) / 2, 0.008, SAND, holder, 1, 'sand', SAND);
    const eastLen = L - D.northSand, eastMid = (D.northSand + L) / 2;
    flat(scene, 'vb_bikepath', D.bikeX[1] - D.bikeX[0], eastLen, (D.bikeX[0] + D.bikeX[1]) / 2, eastMid, 0.011, '#8C8484', holder, 0.85, 'asphalt', '#8C8484');
    flat(scene, 'vb_walk', D.walkX[1] - D.walkX[0], eastLen, (D.walkX[0] + D.walkX[1]) / 2, eastMid, 0.011, '#E2D8CA', holder, 1, 'concrete', '#E2D8CA');
    flat(scene, 'vb_plaza', far - D.plazaX0, eastLen, (D.plazaX0 + far) / 2, eastMid, 0.01, '#857A70', holder, 1, 'concrete', '#857A70');
    // the bike path's dashed centre line: one plane, the dashes are its alpha-tested texture (3 m dash, 3 m gap)
    const dashTex = new DynamicTexture('vb_bike_dash_tex', { width: 16, height: 64 }, scene, false);
    { const c = dashTex.getContext() as CanvasRenderingContext2D; c.clearRect(0, 0, 16, 64); c.fillStyle = '#E8B83A'; c.fillRect(0, 0, 16, 32); dashTex.update(false); dashTex.hasAlpha = true; }
    dashTex.vScale = eastLen / 6;
    const dash = MeshBuilder.CreateGround('vb_bike_line', { width: 0.14, height: eastLen }, scene);
    dash.position.set((D.bikeX[0] + D.bikeX[1]) / 2, 0.014, eastMid); dash.parent = holder; dash.isPickable = false; dash.receiveShadows = true;
    const dm = new PBRMaterial('vb_bike_line_mat', scene); dm.albedoTexture = dashTex; dm.useAlphaFromAlbedoTexture = true; dm.transparencyMode = 1; dm.alphaCutOff = 0.5;
    dm.albedoColor = Color3.White(); dm.roughness = 0.8; dm.metallic = 0; dm.environmentIntensity = 0.35; dash.material = dm;
  } else {
    flat(scene, 'vb_grass_e', grass, L * 2, ax + grass / 2, 0, 0.01, GRASS, holder, 1, 'grass');
    flat(scene, 'vb_walk', walkW, L * 2, ax + grass + walkW / 2, 0, 0.011, '#C8BFB0', holder, 1, 'concrete');
    flat(scene, 'vb_grass_far_e', L, L * 2, ax + grass + walkW + L / 2, 0, 0.01, GRASS2, holder, 1, 'grass');
    // DUNK-VISUAL-POLISH: the northern grass used to stop at −az (the SLAB's edge) while the north apron ends at
    // SCAN_N − apron, which is a different z on every mode — a 2.9 m strip of nothing behind the dunk baseline and a
    // 12 m one behind the ones/threes hoop, straight through to the void. It runs from the apron it actually meets.
    flat(scene, 'vb_grass_n', ax * 2, grassN0 - northSand, 0, (northSand + grassN0) / 2, 0.01, GRASS, holder, 1, 'grass');
    flat(scene, 'vb_grass_s', ax * 2, L - (SCAN_S + apron), 0, SCAN_S + apron + (L - (SCAN_S + apron)) / 2, 0.01, GRASS, holder, 1, 'grass');
    flat(scene, 'vb_grass_w', grass, L * 2, -(ax + grass / 2), 0, 0.01, GRASS, holder, 1, 'grass');
    // sand: a strip down the west side and a strip across the north, then water beyond both
    flat(scene, 'vb_sand_w', sandW, L * 2, westSand - sandW / 2, 0, 0.008, '#CDB48C', holder, 1, 'sand');
    flat(scene, 'vb_sand_n', ax * 2 + grass * 2 + walkW + L, northSand - northSea, (westSand + ax + grass + walkW + L) / 2, (northSand + northSea) / 2, 0.008, '#CDB48C', holder, 1, 'sand');
  }
  // the sea: under the Venice dunk's sunset it is the photo's slate blue with the sun's warmth in it, not the lawn build's
  // lavender (which read as a lilac slab against the new sky)
  const seaMat = new PBRMaterial('vb_sea_mat', scene);
  // (PBR albedo is LINEAR: the lawn build's raw '#3B3A6E' is a mid lavender, and a raw navy under the low sun and hemi fill
  // still rendered as a pale grey band on the horizon — the dunk's navy is converted, so it lands as the dark sea it names)
  seaMat.albedoColor = dunkEnv ? Color3.FromHexString('#1B2740').toLinearSpace() : Color3.FromHexString('#3B3A6E');
  seaMat.roughness = dunkEnv ? 0.3 : 0.35; seaMat.metallic = 0; seaMat.environmentIntensity = dunkEnv ? 0.3 : 0.6;
  seaMat.emissiveColor = dunkEnv ? new Color3(0.06, 0.035, 0.025) : new Color3(0.10, 0.06, 0.12);
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
  post('vb_gate_post_l', 7.1, SCAN_S + 3.6, 3.4); post('vb_gate_post_r', 10.9, SCAN_S + 3.6, 3.4);   // owner: back off the paint, to the right
  sign('vb_gate_sign', 4.2, 1.0, [9, 3.0, SCAN_S + 3.6], Math.PI, signTexture(scene, ['VENICE BEACH COURTS', 'FINAL EVOLUTION LAB · EST. 2026'], { bg: '#1E2A44', accent: '#F2B84B' }));
  sign('vb_scoreboard', 4.8, 1.3, [7.5, 3.0, SCAN_N - 17.4], Math.PI, signTexture(scene, ['FLIGHT NIGHT', 'VENICE · OPEN RUN · ALL LEVELS'], { bg: '#141826', fg: '#FFE9B0', accent: '#FF6B3D' }));
  const flagTex = signTexture(scene, ['FEL'], { bg: '#B03A2E', fg: '#FFF4E0', accent: '#F2B84B', w: 256, h: 640 });
  for (let i = 0; i < 4; i++) { const z = -36 + i * 24; sign(`vb_flag_${i}`, 0.5, 1.25, [19.55, 4.0, z + 0.5], Math.PI / 2, flagTex); }
  // Pass 7 phase 5 — air: six gulls wheel over the northern water on slow ellipses (billboards on a painted chevron).
  // Cheap: six unlit planes and one observer.
  const gullTex = new DynamicTexture('vb_gull_tex', 64, scene, false);
  { const c = gullTex.getContext() as CanvasRenderingContext2D; c.clearRect(0, 0, 64, 64); c.strokeStyle = '#2A2630'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(6, 40); c.quadraticCurveTo(20, 22, 32, 34); c.quadraticCurveTo(44, 22, 58, 40); c.stroke(); gullTex.update(false); gullTex.hasAlpha = true; }
  const gullMat = new StandardMaterial('vb_gull_mat', scene); gullMat.emissiveTexture = gullTex; gullMat.opacityTexture = gullTex; gullMat.emissiveColor = Color3.Black(); gullMat.diffuseColor = Color3.Black(); gullMat.disableLighting = true; gullMat.backFaceCulling = false;
  const gulls = Array.from({ length: 6 }, (_, i) => { const g = MeshBuilder.CreatePlane(`vb_gull_${i}`, { size: 1.6 }, scene); g.material = gullMat; g.billboardMode = Mesh.BILLBOARDMODE_ALL; g.parent = holder; g.isPickable = false; return g; });
  // (drifting cloud planes read as hard white blobs against the dome — the painted dome carries the clouds; the gulls stay)
  let ta = 0;
  const air = scene.onBeforeRenderObservable.add(() => {
    ta += scene.getEngine().getDeltaTime() / 1000;
    gulls.forEach((g, i) => { const ph = ta * (0.22 + i * 0.03) + i * 1.1; g.position.set(-30 + Math.cos(ph) * (22 + i * 4), 14 + i * 1.6 + Math.sin(ta * 1.3 + i) * 0.8, -95 + Math.sin(ph) * (14 + i * 3)); g.scaling.y = 0.75 + 0.25 * Math.sin(ta * 9 + i * 2); });
  });
  holder.onDisposeObservable.add(() => { scene.onBeforeRenderObservable.remove(air); gullTex.dispose(); });
  // Pass 7 phase 1: a half-court logo decal on the scan (centre circle, 3.6 m), matte, alpha-blended
  const logo = MeshBuilder.CreateGround('vb_court_logo', { width: 3.6, height: 3.6 }, scene);
  logo.position.set(0, 0.035, SCAN_MID); logo.parent = holder; logo.isPickable = false;   // the centre circle, above the painted court (y 0.02)

  // DUNK-VISUAL-POLISH: the PLAYING SURFACE is painted, not scanned. The baked scan under this court is a 1024² texture
  // over 26 m (39 texels a metre) lit at environmentIntensity 0.02 by the map's matteFloor rule — measured on 3083e17 it
  // renders as a near-black slick with the photogrammetry's own smears reading as oil on water. mountStreetCourt lays a
  // clean 2048² sealed-blacktop albedo with rulebook markings over it, edge to edge with the aprons (x ±8) and baseline
  // to baseline with the scan's own paint (SCAN_N…SCAN_S), so nothing of the scan's surface is left showing.
  //
  // It replaces the two key patches this file used to paint: those existed only to cover the ghost rectangles the scan's
  // flattened hoop stands left over both keys (scripts/map/cut-scan-stands.py), and the painted court now covers them
  // with a real key.
  mountStreetCourt(scene, holder, [-COURT.hx, COURT.hx], [SCAN_N, SCAN_S], 0.02, dunkEnv ? VENICE_DUNK_COURT_PALETTE : STREET_COURT_PALETTE);

  // Pass 7 phase 6 — life: a rail of onlookers on the boardwalk's inner edge, facing the court (roster bodies, cap 8, the
  // same people every session). They idle and bob; the modes' cheer hooks are not wired here — this is scenery.
  const railX = COURT.hx + apron - 0.7;   // on the east apron, inside the scan's baked fence — on the walk they stood behind it, unseen from the court
  const rail = new Onlookers(scene, Array.from({ length: 9 }, (_, i) => new Vector3(railX + (i % 2) * 0.7, 0, SCAN_N + 1.5 + i * 3.0)), '#2b3550', new Vector3(0, 0, SCAN_MID));
  const life = scene.onBeforeRenderObservable.add(() => rail.update(scene.getEngine().getDeltaTime() / 1000));
  holder.onDisposeObservable.add(() => { scene.onBeforeRenderObservable.remove(life); rail.dispose(); });
  // DUNK-VISUAL-POLISH: a DynamicTexture on a Ground lands MIRRORED along u for a camera looking down −z (every
  // basketball camera here) — the centre logo read "HƆA38 3ƆIИ3V" backwards. It was unreadable mush on the old scan,
  // so nobody could see it was wrong. Flip u on this copy (measured both ways, 2026-09-09: u alone reads "FEL").
  const logoTex = courtLogoTexture(scene);
  logoTex.uScale = -1; logoTex.uOffset = 1;
  const lm = new PBRMaterial('vb_court_logo_mat', scene); lm.albedoTexture = logoTex; lm.useAlphaFromAlbedoTexture = true; lm.transparencyMode = 2; lm.roughness = 0.9; lm.metallic = 0; lm.albedoColor = Color3.White(); lm.environmentIntensity = 0.3;
  logo.material = lm;
  console.info(dunkEnv ? '[FEL-VENICE] dunk boardwalk built (apron, beach, bike path, promenade, plaza, ocean) — props from venice-dunk'
    : '[FEL-VENICE] boardwalk scenery built (apron, grass, boardwalk, sand, ocean, sun) — props from venice-court-meshy');
  return holder;
}
