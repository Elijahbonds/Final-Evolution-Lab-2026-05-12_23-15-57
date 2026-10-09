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
//
// DUNK-VENICE-ENV-2 (2026-09-28), the Venice dunk only: a baked hero palm behind the backboard and a boardwalk row with its
// vendors and crowd behind the hoop (mountVeniceDunkDressing — placements in venuePropSets.ts), the sea as water, a sand with
// no streaks, and the FLIGHT NIGHT sign up on the row's roof.
import { Color3, DynamicTexture, InstancedMesh, Mesh, MeshBuilder, PBRMaterial, SceneLoader, StandardMaterial, Texture, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { mountStreetCourt, STREET_COURT_PALETTE, VENICE_DUNK_COURT_PALETTE } from '../visual/CourtSurface';
import { courtLogoTexture, groundTextureFor, signTexture, TILE_M, type GroundKind } from '../visual/groundTextures';
import { HOOP_SCAN, spawnMeshyProp } from '../visual/meshyProps';
import { Onlookers } from '../visual/Onlookers';
import { heroPalmScale, VENICE_BOARDWALK_ROW, VENICE_ENV2_DIR, VENICE_HERO_PALMS, VENICE_PALM_LODS, VENICE_ROW_PALMS } from '../visual/venuePropSets';
import { veniceSunPosition } from '../visual/veniceSurroundVisibility';
import type { AbstractMesh, Material, Scene } from '@babylonjs/core';

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
  const northSand = -(az + 40);                                        // shop line at z −50, sand from −57, water from −71
  const westSand = -(ax + grass);
  const { westSea, northSea } = veniceWaterline();
  const zSpanN = (northSand - (-L)) ;                                  // (unused span helper kept readable)
  const dunkEnv = env === 'venice-dunk';
  const grassN0 = SCAN_N - apron;
  if (dunkEnv) {
    // DUNK-VENICE-ENV-RENDER: sand from the aprons out to the water (west and north) and under the palm strip, then the bike
    // path, the promenade and the plaza to the east. Six planes where the lawn build laid eight, and not one of them green.
    // Multipliers over the shared ground textures, so the court stays the lit thing in the frame: the low sun and the hemi
    // fill blew the plain sand to white-beige, and the walk and the plaza (one concrete texture) read as one slab.
    const D = DUNK_BOARDWALK, far = L + 25, SAND = '#C4B39A';
    // DUNK-VENICE-ENV-2 (eye VE-5): the dunk's own sand — the shared tile's wind strokes lined up tile after tile into long
    // parallel streaks ("brushed wood decking"); this grain has no direction, and a low-frequency mottle rolls over it
    const beachW = D.bikeX[0] - westSea, beachD = L - northSea, sandNW = far - D.bikeX[0], sandND = D.northSand - northSea;
    veniceSand(scene, flat(scene, 'vb_sand', beachW, beachD, (westSea + D.bikeX[0]) / 2, (northSea + L) / 2, 0.008, SAND, holder, 1), SAND, beachW, beachD);
    veniceSand(scene, flat(scene, 'vb_sand_n', sandNW, sandND, (D.bikeX[0] + far) / 2, (northSea + D.northSand) / 2, 0.008, SAND, holder, 1), SAND, sandNW, sandND);
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
  seaMat.albedoColor = Color3.FromHexString('#3B3A6E');
  seaMat.roughness = 0.35; seaMat.metallic = 0; seaMat.environmentIntensity = 0.6;
  seaMat.emissiveColor = new Color3(0.10, 0.06, 0.12);
  // DUNK-VENICE-ENV-2 (eye VE-2: "a flat dark maroon strip … no water colour, specular or wave detail"). The maroon was the
  // warm emissive over a near-black albedo. The dunk's sea is one material: Pacific blue-teal, glossy enough to carry the
  // sky at a grazing angle — its reflection warmed to the sunset's (the scene's image light is a neutral grey, and a grey
  // mirror at the horizon read as a concrete slab) — and a tiling wave normal map drifting under it. The shore is a surf zone
  // (shoreFoam) and the low sun lays a glitter path on the water under the painted one (sunGlitter).
  const waves = dunkEnv ? seaWaves(scene) : null;
  if (waves) {
    seaMat.albedoColor = Color3.FromHexString('#123C58').toLinearSpace();
    seaMat.roughness = SEA.roughness; seaMat.environmentIntensity = 0.85;
    seaMat.reflectionColor = new Color3(1.0, 0.66, 0.46);
    seaMat.emissiveColor = new Color3(0.004, 0.012, 0.02);
    seaMat.bumpTexture = waves; waves.level = 0.7;
    waves.uScale = waves.vScale = SEA.planeM / SEA.waveM;
  }
  // the dunk's two sea planes are SQUARE and meet without overlapping, so one wave texture tiles both at the same size and no
  // two wave fields z-fight in the corner (the lawn build keeps its planes)
  const seaW = dunkEnv
    ? MeshBuilder.CreateGround('vb_sea_w', { width: SEA.planeM, height: SEA.planeM }, scene)
    : MeshBuilder.CreateGround('vb_sea_w', { width: L, height: L * 2 }, scene);
  const sq = dunkSeaPlanes(westSea, northSea);
  if (dunkEnv) seaW.position.set(sq.west.x, 0, sq.west.z); else seaW.position.set(westSea - L / 2, 0, 0);
  seaW.parent = holder; seaW.material = seaMat; seaW.isPickable = false;
  const seaN = dunkEnv
    ? MeshBuilder.CreateGround('vb_sea_n', { width: SEA.planeM, height: SEA.planeM }, scene)
    : MeshBuilder.CreateGround('vb_sea_n', { width: L * 2, height: L }, scene);
  seaN.position.set(0, 0, dunkEnv ? sq.north.z : northSea - L / 2); seaN.parent = holder; seaN.material = seaMat; seaN.isPickable = false;
  if (dunkEnv) { shoreFoam(scene, holder, westSea, northSea, L + 25, L); sunGlitter(scene, holder, westSea, northSea); }   // north waterline to the east sand's end, west one to the south
  // The sun is PAINTED into the beach dome (scripts/backdrop/paint-beach-dome.py, u≈0.33): a 3D disc at the dome wall rendered as a
  // navy coin from the threes and ones cameras (depth against the dome at 190 m) while it read white from dunk's. No disc.
  void zSpanN;
  // a slow shimmer on the water: the specular highlight drifts (the dunk's waves drift too)
  let t = 0;
  const obs = scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000; t += dt;
    if (!waves) { seaMat.roughness = 0.35 + Math.sin(t * 0.7) * 0.06; return; }
    seaMat.roughness = SEA.roughness + Math.sin(t * 0.7) * 0.025;
    waves.uOffset = (waves.uOffset + dt * 0.011) % 1; waves.vOffset = (waves.vOffset + dt * 0.006) % 1;
  });
  holder.onDisposeObservable.add(() => { scene.onBeforeRenderObservable.remove(obs); waves?.dispose(); });
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
  const flightNight = signTexture(scene, ['FLIGHT NIGHT', 'VENICE · OPEN RUN · ALL LEVELS'], { bg: '#141826', fg: '#FFE9B0', accent: '#FF6B3D' });
  if (dunkEnv) {
    // DUNK-VENICE-ENV-2: the boardwalk row stands where this sign hung (z −28.5, a post-less board 3 m up — it would sit behind
    // the row's walls). It goes up on the row's roof instead, on two posts that rise from behind the wall: a rooftop billboard,
    // grounded, still left of the hoop from the run-up camera — over SURF & SKATE (the file's x −10.5 shop: the glTF loader's
    // handedness flip mirrors the row's layout in x, the signs still read the right way round).
    const R = VENICE_BOARDWALK_ROW.at, sx = R[0] + 10.5, sz = R[2] + VENICE_BOARDWALK_ROW.depth[0] - 0.3;
    post('vb_scoreboard_post_l', sx - 1.9, sz - 0.05, 7.0); post('vb_scoreboard_post_r', sx + 1.9, sz - 0.05, 7.0);
    sign('vb_scoreboard', 4.8, 1.3, [sx, 6.3, sz], Math.PI, flightNight);
  } else {
    // HOOPS-TO-75 HP-10: the dunk billboard north of the scan read through every half-court baseline into 1v1/3v3/3PT
    sign('vb_scoreboard', 4.8, 1.3, [ax + grass + walkW / 2 + 1.5, 3.0, SCAN_MID], -Math.PI / 2, flightNight);
  }
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
  if (dunkEnv) void mountVeniceDunkDressing(scene, holder).catch((e) => console.warn('[FEL-VENICE] dunk dressing failed to load:', (e as Error)?.message ?? e));
  return holder;
}

// ── DUNK-VENICE-ENV-2 (2026-09-28): the Venice dunk's baked dressing, its sea and its sand ──────────────────────────────

/** The dunk sea: square planes (they tile one wave texture at one size), the wave repeat and the gloss. */
export const SEA = { planeM: 480, waveM: 7, roughness: 0.15 } as const;

/** Where the water starts, world metres: the west waterline's x and the north one's z (both builds; the dunk's sand runs to them). */
export function veniceWaterline(): { westSea: number; northSea: number } {
  const { apron, grass, sandW } = BOARDWALK;
  return { westSea: -(COURT.hx + apron + grass) - sandW, northSea: -(COURT.hz + apron + 40) - 14 };
}

/** The dunk sea's two square planes (centre x/z and side): the west one runs south from the north waterline, the north one
 *  spans the whole width past it — they meet at the corner and never overlap (one wave field each, no z-fight). */
export function dunkSeaPlanes(westSea: number, northSea: number, size: number = SEA.planeM) {
  return { west: { x: westSea - size / 2, z: northSea + size / 2, size }, north: { x: 0, z: northSea - size / 2, size } };
}

/** The sun's road on the water: unit direction (x, z) toward the sun's azimuth, and the distances along it from the court
 *  where it starts (2 m past the first waterline the ray crosses) and ends (inside the 200 m sky dome). */
export function sunRoad(westSea: number, northSea: number, toSun: { x: number; z: number }, t1 = 190): { ux: number; uz: number; t0: number; t1: number } {
  const hl = Math.hypot(toSun.x, toSun.z), ux = toSun.x / hl, uz = toSun.z / hl;
  const t0 = Math.min(ux < 0 ? westSea / ux : Infinity, uz < 0 ? northSea / uz : Infinity) + 2;
  return { ux, uz, t0, t1 };
}

/** A tiny deterministic LCG, so the paint is identical every load. */
function lcg(seed: number): () => number { let v = seed >>> 0; return () => ((v = (v * 1664525 + 1013904223) >>> 0) / 4294967296); }

/**
 * A tiling wave normal map: a height field summed from sines whose frequencies are whole cycles per tile (so it wraps with no
 * seam), turned into tangent-space normals. Painted once in JS (a 256² buffer, ~2 ms); a headless canvas leaves it flat.
 */
function seaWaves(scene: Scene): DynamicTexture {
  const N = 256, tex = new DynamicTexture('vb_sea_waves', N, scene, true);
  const c = tex.getContext() as CanvasRenderingContext2D;
  const img = c.getImageData?.(0, 0, N, N);
  if (img) {
    const r = lcg(0x5ea), terms = Array.from({ length: 9 }, (_, i) => ({ kx: Math.round((r() - 0.5) * (4 + i * 3)), ky: Math.round(1 + r() * (3 + i * 2)), a: 1 / (1 + i * 0.7), p: r() * Math.PI * 2 }));
    const h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0; for (const w of terms) v += w.a * Math.sin(((w.kx * x + w.ky * y) / N) * Math.PI * 2 + w.p);
      h[y * N + x] = v;
    }
    const d = img.data, k = 2.2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x + N - 1) % N)], dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
      const nx = -dx * k, ny = -dy * k, l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
      d[i] = Math.round((nx / l * 0.5 + 0.5) * 255); d[i + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); d[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  } else { c.fillStyle = 'rgb(128,128,255)'; c.fillRect(0, 0, N, N); }
  tex.update(false);
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE; tex.anisotropicFilteringLevel = 8;
  return tex;
}

/**
 * The shoreline: a surf zone down each waterline (north z `northSea`, west x `westSea`) — 4 m of wet sand darkening to the
 * swash line, then 10 m of shallow water: a turquoise tint thinning out to sea under two broken bands of foam. It is wide on
 * purpose: from the court the north waterline is 75 m off at a grazing angle, where a 3 m foam line is under a pixel. One small
 * alpha texture, one material, two planes; `vb_` keeps them out of the shadow map.
 */
function shoreFoam(scene: Scene, holder: TransformNode, westSea: number, northSea: number, farX: number, farZ: number): void {
  const W = 128, H = 256, SAND_M = 4, WIDTH = 14, tex = new DynamicTexture('vb_shore_foam_tex', { width: W, height: H }, scene, true);
  const c = tex.getContext() as CanvasRenderingContext2D, r = lcg(0xf0a);
  c.clearRect(0, 0, W, H);
  // u across the strip (0 = the sand side, 1 = the open water), v along the shore
  const line = SAND_M / WIDTH;
  const band = c.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, 'rgba(118,96,68,0)'); band.addColorStop(line * 0.55, 'rgba(104,86,62,0.5)'); band.addColorStop(line, 'rgba(92,80,64,0.62)');
  band.addColorStop(line + 0.005, 'rgba(70,168,170,0.55)'); band.addColorStop(0.55, 'rgba(46,120,140,0.3)'); band.addColorStop(1, 'rgba(30,90,120,0)');
  c.fillStyle = band; c.fillRect(0, 0, W, H);
  const lace = (u0: number, wobble: number, keep: number, a0: number, a1: number, w0: number) => {
    for (let y = 0; y < H; y += 2) {
      const x = W * (u0 + Math.sin((y / H) * Math.PI * 2 * (3 + wobble)) * 0.012 + (r() - 0.5) * 0.01);
      if (r() < keep) { c.fillStyle = `rgba(246,242,232,${a0 + r() * (a1 - a0)})`; c.fillRect(x, y, W * (w0 + r() * w0), 2); }
    }
  };
  lace(line - 0.01, 1, 0.9, 0.75, 0.95, 0.025);   // the swash line, on the wet sand's edge
  lace(0.47, 2, 0.6, 0.45, 0.75, 0.03);           // the first break
  lace(0.72, 0, 0.35, 0.25, 0.5, 0.025);          // the outer one, broken
  tex.update(false); tex.hasAlpha = true;
  tex.wrapU = Texture.CLAMP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE; tex.anisotropicFilteringLevel = 8;
  const m = new PBRMaterial('vb_shore_foam_mat', scene);
  m.albedoTexture = tex; m.useAlphaFromAlbedoTexture = true; m.transparencyMode = 2; m.albedoColor = Color3.White();
  m.roughness = 0.45; m.metallic = 0; m.environmentIntensity = 0.35;
  const strip = (name: string, len: number, x: number, z: number, yaw: number) => {
    const g = MeshBuilder.CreateGround(name, { width: WIDTH, height: len }, scene);
    g.position.set(x, 0.012, z); g.rotation.y = yaw; g.parent = holder; g.isPickable = false; g.material = m;
  };
  const lenN = farX - westSea, lenW = farZ - northSea, mid = WIDTH / 2 - SAND_M;   // the strip's centre sits `mid` out over the water
  strip('vb_shore_foam_n', lenN, (westSea + farX) / 2, northSea - mid, Math.PI / 2);   // local +x → world −z: the water
  strip('vb_shore_foam_w', lenW, westSea - mid, (northSea + farZ) / 2, Math.PI);       // local +x → world −x: the water
  tex.vScale = (lenN + lenW) / 2 / 9;   // one lace texture on both (their lengths are within a few metres): a 9 m repeat
  holder.onDisposeObservable.add(() => { m.dispose(); tex.dispose(); });
}

/**
 * The sun's path on the water: the low sun (the look pass's key light, where the photo's sun is painted) lays a glitter road
 * across the sea toward it. The image light carries no sun, so the sea alone cannot; this is a strip on the water along the
 * sun's azimuth from the shore out to the dome, additive sparkle that shimmers as it scrolls. Every gameplay camera is within
 * a few metres of the court and the strip starts 60 m out, so it sits under the painted sun from all of them. One draw when
 * it is in view (the run-up camera looks 55° away from it).
 */
function sunGlitter(scene: Scene, holder: TransformNode, westSea: number, northSea: number): void {
  const { ux, uz, t0, t1 } = sunRoad(westSea, northSea, veniceSunPosition());
  const W = 64, H = 512, tex = new DynamicTexture('vb_sun_glitter_tex', { width: W, height: H }, scene, true);
  const c = tex.getContext() as CanvasRenderingContext2D, r = lcg(0x6117);
  c.fillStyle = 'rgb(0,0,0)'; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {   // horizontal flecks: brighter and denser down the middle of the road
    const across = (r() + r() + r()) / 3, y = r() * H, x = across * W, core = 1 - Math.abs(across - 0.5) * 2;
    const v = Math.round(120 + 135 * core * r());
    c.fillStyle = `rgb(${v},${Math.round(v * 0.78)},${Math.round(v * 0.5)})`; c.fillRect(x - 2 - core * 3, y, 4 + core * 7, 1 + (r() < 0.3 ? 1 : 0));
  }
  tex.update(false);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.vScale = (t1 - t0) / 24;
  const m = new StandardMaterial('vb_sun_glitter_mat', scene);
  m.emissiveTexture = tex; m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black(); m.disableLighting = true;
  m.opacityTexture = null; m.alphaMode = 1; m.alpha = 0.95; m.backFaceCulling = false;   // ALPHA_ADD: sparkle only brightens the sea
  // a trapezoid: narrow at the shore, widening to the horizon, the way a glitter road opens out with distance
  const pos: number[] = [], nx = -uz, nz = ux, halfW = (t: number) => 1.5 + (t - t0) * 0.07;
  for (const t of [t0, t1]) for (const side of [-1, 1]) pos.push(ux * t + nx * side * halfW(t), 0.02, uz * t + nz * side * halfW(t));
  const road = new Mesh('vb_sun_glitter', scene);
  const vd = new VertexData();
  vd.positions = pos; vd.indices = [0, 2, 1, 1, 2, 3]; vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]; vd.uvs = [0, 0, 1, 0, 0, 1, 1, 1];
  vd.applyToMesh(road);
  road.material = m; road.parent = holder; road.isPickable = false;
  let t = 0;
  const obs = scene.onBeforeRenderObservable.add(() => { t += scene.getEngine().getDeltaTime() / 1000; tex.vOffset = (t * 0.035) % 1; m.alpha = 0.8 + Math.sin(t * 2.3) * 0.12; });
  holder.onDisposeObservable.add(() => { scene.onBeforeRenderObservable.remove(obs); m.dispose(); tex.dispose(); });
}

/**
 * The dunk sand (eye VE-5): a fine isotropic grain tiled every 4 m (speckle, clumps and small trodden dimples, drawn wrapped
 * so the tile has no seam, and no strokes at all) over a low-frequency mottle as the detail map, tiled every ~44 m — the
 * tonal roll a beach has, and it breaks up the 4 m repeat.
 */
function veniceSand(scene: Scene, mesh: Mesh, mul: string, w: number, d: number): void {
  const mat = mesh.material as PBRMaterial;
  const S = 512, grain = new DynamicTexture('vb_sand_grain', S, scene, true);
  const g = grain.getContext() as CanvasRenderingContext2D, r = lcg(0x5a4d);
  g.fillStyle = '#CDB48C'; g.fillRect(0, 0, S, S);
  const wrapped = (x: number, y: number, rad: number, draw: (x: number, y: number) => void) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) if (x + ox > -rad && x + ox < S + rad && y + oy > -rad && y + oy < S + rad) draw(x + ox, y + oy);
  };
  const tone = (t: number) => { const a = [0xB9, 0x9E, 0x76], b = [0xE2, 0xCF, 0xA8]; return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; };
  for (let i = 0; i < 16000; i++) { g.fillStyle = tone(r()); g.fillRect(r() * S, r() * S, 1, 1); }
  for (let i = 0; i < 1400; i++) { const x = r() * S, y = r() * S, s = 1.5 + r() * 2.5; g.fillStyle = r() < 0.5 ? 'rgba(150,124,88,0.22)' : 'rgba(236,222,190,0.2)'; wrapped(x, y, s, (px, py) => g.fillRect(px, py, s, s)); }
  for (let i = 0; i < 70; i++) {   // trodden dimples: a shadowed hollow with a lit lip, every orientation
    const x = r() * S, y = r() * S, rx = 5 + r() * 12, ry = rx * (0.45 + r() * 0.3), a = r() * Math.PI, al = 0.05 + r() * 0.06;
    wrapped(x, y, rx + 2, (px, py) => {
      g.save(); g.translate(px, py); g.rotate(a);
      g.fillStyle = `rgba(120,96,66,${al})`; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `rgba(240,228,200,${al * 0.9})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(0.8, -0.8, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.restore();
    });
  }
  grain.update(false);
  grain.wrapU = Texture.WRAP_ADDRESSMODE; grain.wrapV = Texture.WRAP_ADDRESSMODE; grain.anisotropicFilteringLevel = 8;
  grain.uScale = Math.max(1, w / TILE_M.sand); grain.vScale = Math.max(1, d / TILE_M.sand);
  mat.albedoTexture = grain; mat.albedoColor = Color3.FromHexString(mul);
  // the mottle: soft light and dark pools, 5–17 m across on a 44 m tile, luminance about neutral (a PBR detail map's red
  // channel; green/blue/alpha neutral: no normal, no roughness change)
  const M = 256, mottle = new DynamicTexture('vb_sand_mottle', M, scene, true);
  const mc = mottle.getContext() as CanvasRenderingContext2D, mr = lcg(0xd0e);
  mc.fillStyle = 'rgb(128,128,128)'; mc.fillRect(0, 0, M, M);
  for (let i = 0; i < 46; i++) {
    const x = mr() * M, y = mr() * M, rad = 18 + mr() * 70, light = mr() < 0.5, a = 0.1 + mr() * 0.16;
    const col = light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    for (const ox of [-M, 0, M]) for (const oy of [-M, 0, M]) {
      const gr = mc.createRadialGradient(x + ox, y + oy, 1, x + ox, y + oy, rad);
      gr.addColorStop(0, col); gr.addColorStop(1, light ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,0)');
      mc.fillStyle = gr; mc.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  const img = mc.getImageData?.(0, 0, M, M);
  if (img) { const p = img.data; for (let i = 0; i < p.length; i += 4) { p[i + 1] = 128; p[i + 2] = 128; p[i + 3] = 128; } mc.putImageData(img, 0, 0); }
  mottle.update(false);
  mottle.wrapU = Texture.WRAP_ADDRESSMODE; mottle.wrapV = Texture.WRAP_ADDRESSMODE;
  mottle.uScale = Math.max(1, w / 44); mottle.vScale = Math.max(1, d / 44);
  mat.detailMap.isEnabled = true; mat.detailMap.texture = mottle;
  mat.detailMap.diffuseBlendLevel = 0.65; mat.detailMap.bumpLevel = 0; mat.detailMap.roughnessBlendLevel = 0;
  mesh.onDisposeObservable.add(() => { grain.dispose(); mottle.dispose(); });
}

/** Bake every mesh in `meshes` into one mesh per material, in `into`'s space (the glTF loader's handedness flip included;
 *  VertexData.transform flips the winding for it), named `${prefix}_${material}` — the `vb_` prefix keeps LightRig from
 *  registering it as a shadow caster. An instance bakes its source's geometry at its own transform. */
function bakeByMaterial(scene: Scene, meshes: AbstractMesh[], into: TransformNode, prefix: string, receiveShadows: boolean): Mesh[] {
  const inv = into.computeWorldMatrix(true).clone().invert();
  const groups = new Map<Material, AbstractMesh[]>();
  for (const m of meshes) {
    if (!m.material || !m.getTotalVertices()) continue;
    const list = groups.get(m.material) ?? []; list.push(m); groups.set(m.material, list);
  }
  const out: Mesh[] = [];
  for (const [mat, list] of groups) {
    const src = (m: AbstractMesh): Mesh => (m instanceof InstancedMesh ? m.sourceMesh : (m as Mesh));
    const parts = list.map((m) => VertexData.ExtractFromMesh(src(m), true, true).transform(m.computeWorldMatrix(true).multiply(inv)));
    const [first, ...rest] = parts;
    if (rest.length) first.merge(rest, true);
    const baked = new Mesh(`${prefix}_${mat.name}`, scene);
    first.applyToMesh(baked);
    baked.sideOrientation = src(list[0]).sideOrientation;
    baked.material = mat; baked.parent = into; baked.isPickable = false; baked.receiveShadows = receiveShadows;
    out.push(baked);
  }
  return out;
}

export interface VeniceDressingHandle { palms: number; kit: Mesh[]; crowd: Mesh[] }

/**
 * DUNK-VENICE-ENV-2 — the Venice dunk's baked dressing, under the boardwalk holder (it dies with the venue):
 *  · THE PALMS (eye VE-1: a faceted low-poly palm behind the backboard in the slam cam and all three replays): the baked
 *    palm, LOD0 → LOD1 at 25 m → LOD2 at 60 m, the hero behind the backboard and every row on the beach (VENICE_HERO_PALMS,
 *    VENICE_ROW_PALMS; the first owns the meshes, the rest are instances, which follow the source's LODs). The fronds are
 *    alpha-tested and double-sided; the hero palms cast whole (the shadow pass honours the frond alpha), the near rows their
 *    trunks (VENICE_ROW_PALMS), the far rows nothing. The LOD1/LOD2 meshes are out of the caster list — a shadow pass does
 *    not skip LOD meshes and would draw the first palm three times.
 *  · THE BOARDWALK ROW (eye VE-6): the kit mounted whole and unturned (fronts face +Z, the court), baked to one mesh per
 *    material — two draws for four shops and three stalls. It does not cast.
 *  · THE CROWD: the file's 12-card strip, baked to one mesh (one draw); the card library is dropped. It does not cast.
 */
export async function mountVeniceDunkDressing(scene: Scene, holder: TransformNode): Promise<VeniceDressingHandle | null> {
  const files = [...VENICE_PALM_LODS.files, 'venice_boardwalk_kit.glb', 'venice_crowd_cards.glb'];
  const settled = await Promise.allSettled(files.map((f) => SceneLoader.ImportMeshAsync('', VENICE_ENV2_DIR, f, scene)));
  const all = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  // one missing file drops the whole dressing (a palm without its LODs, a crowd without its row) and nothing it loaded stays
  if (all.length < files.length || holder.isDisposed() || scene.isDisposed) {
    for (const r of all) r.meshes[0]?.dispose(false, true);
    if (all.length < files.length) throw new Error(`${files.length - all.length} of ${files.length} GLBs did not load`);
    return null;
  }
  const lods = all.slice(0, 3), [kit, crowd] = all.slice(3);
  for (const r of all) for (const m of r.meshes) m.isPickable = false;

  // the palms
  const part = (r: (typeof lods)[number], mat: string) => r.meshes.find((m) => m.material?.name === mat) as Mesh | undefined;
  const trunks = lods.map((r) => part(r, 'palm_trunk')), fronds = lods.map((r) => part(r, 'palm_frond'));
  if (trunks.some((m) => !m) || fronds.some((m) => !m)) throw new Error('palm_hero LODs: no palm_trunk / palm_frond mesh');
  const casters = [...(scene.getLightByName('fel_sun')?.getShadowGenerators()?.values() ?? [])] as Array<{ addShadowCaster?(m: AbstractMesh, d?: boolean): unknown; removeShadowCaster?(m: AbstractMesh, d?: boolean): unknown }>;
  for (const masters of [trunks, fronds]) {
    const [m0, m1, m2] = masters as Mesh[];
    m0.addLODLevel(VENICE_PALM_LODS.switchM[0], m1); m0.addLODLevel(VENICE_PALM_LODS.switchM[1], m2);
    m0.receiveShadows = true;
    for (const lod of [m1, m2]) for (const gen of casters) gen.removeShadowCaster?.(lod);
  }
  // every palm on the beach is these meshes: the first placement owns them, the rest are instances (one draw per LOD level
  // in view, whatever the count). A shadow map draws a master's instances only when they are in its caster list, always at
  // LOD0 — so casting is set per palm here, and it does not change with the camera's distance.
  const root0 = lods[0].meshes[0];
  const palms = [...VENICE_HERO_PALMS, ...VENICE_ROW_PALMS];
  palms.forEach((p, i) => {
    const at = new TransformNode(`vb_palm_${i}`, scene);
    at.parent = holder; at.position.set(p.at[0], p.at[1], p.at[2]); at.rotation.y = p.yaw; at.scaling.set(...heroPalmScale(p.h));
    if (i === 0) { root0.parent = at; for (const r of lods.slice(1)) r.meshes[0].parent = at; return; }   // the LOD roots too: they die with the venue
    root0.instantiateHierarchy(at, undefined, (src, copy) => {
      copy.name = `vb_palm_${i}_${src.name}`;
      if (!(copy instanceof InstancedMesh)) return;
      const cast = p.casts === 'whole' || (p.casts === 'trunk' && copy.sourceMesh === trunks[0]);
      for (const gen of casters) { if (cast) gen.addShadowCaster?.(copy, false); else gen.removeShadowCaster?.(copy, false); }
    });
  });

  // the boardwalk row, baked
  const rowAt = new TransformNode('vb_boardwalk_row', scene);
  rowAt.parent = holder; rowAt.position.set(...VENICE_BOARDWALK_ROW.at);
  kit.meshes[0].parent = rowAt;
  const kitMeshes = bakeByMaterial(scene, kit.meshes.slice(1), rowAt, 'vb_kit', true);
  kit.meshes[0].dispose(false, false);   // the materials and the atlas stay: the baked meshes use them

  // the crowd strip, baked (the library row is the strip's source geometry and goes with the file)
  const crowdAt = new TransformNode('vb_boardwalk_crowd', scene);
  crowdAt.parent = holder; crowdAt.position.set(...VENICE_BOARDWALK_ROW.crowdAt);
  crowd.meshes[0].parent = crowdAt;
  const strip = crowd.meshes.filter((m) => /^crowd_strip_/.test(m.name));
  const crowdMeshes = bakeByMaterial(scene, strip, crowdAt, 'vb_crowd', false);
  crowd.meshes[0].dispose(false, false);

  console.info(`[FEL-VENICE] dunk dressing: ${palms.length} baked palms (${palms.filter((p) => p.casts === 'whole').length} cast whole, ${palms.filter((p) => p.casts === 'trunk').length} their trunks; LOD ${VENICE_PALM_LODS.switchM.join('/')} m), boardwalk row in ${kitMeshes.length} draws, crowd of ${strip.length} cards in ${crowdMeshes.length}`);
  return { palms: palms.length, kit: kitMeshes, crowd: crowdMeshes };
}
