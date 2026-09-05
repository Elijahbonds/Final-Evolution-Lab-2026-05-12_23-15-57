// Court locations (owner ask 2026-09-05, docs/SPEC-COURT-LOCATIONS.md). A location is the ENVIRONMENT half of a
// basketball venue spec — sky, backdrop, mood, surround dressing, ambient particles — swapped under the COURT half:
// court, hoop, banner, crowd, actors and camera never change, so play, rim and camera are untouched and Venice with no
// pick is byte-identical to the spec as authored. Decoration that needs meshes (blossom trees, a starfield) is added
// AFTER the scene builds through the venue mount hook — NexusWebScene.ts stays fenced.

import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, PBRMaterial, SpotLight, StandardMaterial, Texture, TransformNode, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import type { Environment, NexusWebSpec, PropKind } from './NexusWebScene';

export const COURT_LOCATION_IDS = ['venice', 'blossom', 'orbit', 'canopy', 'rooftop'] as const;
export type CourtLocationId = (typeof COURT_LOCATION_IDS)[number];

/** The three basketball specs a location may dress. */
export const BASKETBALL_SPEC_IDS = new Set(['basketball_dunk', 'basketball_h2h', 'basketball_3v3']);
/** Game-component mode ids that show the picker on the boot splash. */
export const BASKETBALL_MODE_IDS = new Set(['dunk', 'dunkduel', 'threepoint', 'onevone', 'threevthree', 'basketball', 'hoops1v1', 'hoops3v3']);

/** Court props that survive a location swap; everything else in a spec's props is dressing and is replaced. */
const COURT_PROP_KINDS = new Set<PropKind>(['hoop', 'backboardPole', 'net', 'banner']);

export interface CourtLocation {
  id: CourtLocationId;
  name: string;
  /** Splash eyebrow. */
  sub: string;
  /** Splash accent. */
  tint: string;
  /** venueThumbs palette key. */
  thumb: string;
  /** Selectable in the picker. Unready locations are authored but hidden until their pass lands. */
  ready: boolean;
  /** Full environment; omitted for Venice (identity). */
  environment?: Environment;
  /** Spec-level surround props (procedural kinds the scene builder knows). */
  surround?: NexusWebSpec['props'];
  /** Kenney prop set key (venuePropSets) — null keeps the spec's own set, '' mounts none. */
  propSet?: string | null;
  /** Meshes and particles added after the scene builds, parented under the venue root. */
  decorate?: (scene: Scene, root: TransformNode) => void;
}

const grade = { exposure: 1.15, contrast: 1.35, vignette: 0.35 };

export const COURT_LOCATIONS: Record<CourtLocationId, CourtLocation> = {
  venice: { id: 'venice', name: 'Venice Beach Court', sub: 'VENICE BEACH COURT', tint: '#ffb36b', thumb: 'venice-court', ready: true },
  blossom: {
    id: 'blossom', name: 'Blossom Park', sub: 'BLOSSOM PARK', tint: '#ffb7d5', thumb: 'blossom-park', ready: true,
    environment: {
      // skyTop is ALSO the hemisphere fill colour: a pastel pink fill at 0.62 washed the scanned court to white. Deeper
      // dusk pink, lower ambient, thin fog — the trees stay pink and the court keeps its paint.
      skyTop: '#D98FAF', skyBottom: '#7E5C8E', fogColor: '#D9A6BC', fogDensity: 0.0015,
      ambient: 0.42, sunDirection: [-0.35, -0.8, 0.45], sunColor: '#FFE0BF', grade, backdrop: 'city',
    },
    surround: [
      { kind: 'lamp', position: [-13, 0, 2] }, { kind: 'lamp', position: [13, 0, 2] },
    ],
    propSet: '',
    decorate: decorateBlossom,
  },
  orbit: {
    id: 'orbit', name: 'Orbit', sub: 'ORBIT', tint: '#9ecbff', thumb: 'orbit', ready: true,
    // no backdrop: the sky dome stays a near-black gradient and the starfield + planet are meshes added after the build
    environment: { skyTop: '#03040c', skyBottom: '#070a1a', fogColor: '#070a1a', fogDensity: 0.0, ambient: 0.55, sunDirection: [-0.3, -0.9, 0.2], sunColor: '#E4ECFF', grade },
    surround: [], propSet: '',
    decorate: decorateOrbit,
  },
  canopy: {
    id: 'canopy', name: 'Canopy Court', sub: 'CANOPY COURT', tint: '#9be37a', thumb: 'canopy-court', ready: true,
    environment: { skyTop: '#6E8F4A', skyBottom: '#2C4426', fogColor: '#4A6438', fogDensity: 0.0035, ambient: 0.5, sunDirection: [-0.2, -0.9, 0.3], sunColor: '#FFE9B0', grade },
    surround: [], propSet: 'canopy-court',
    decorate: decorateCanopy,
  },
  rooftop: {
    id: 'rooftop', name: 'Night Rooftop', sub: 'NIGHT ROOFTOP', tint: '#ffd166', thumb: 'night-rooftop', ready: true,
    environment: { skyTop: '#0B1230', skyBottom: '#3A2A5E', fogColor: '#241A3F', fogDensity: 0.004, ambient: 0.45, sunDirection: [-0.4, -0.85, 0.35], sunColor: '#FFD9A0', grade },   // no baked backdrop: the skyline is geometry (below)
    surround: [{ kind: 'lamp', position: [-13, 0, 2] }, { kind: 'lamp', position: [13, 0, 2] }], propSet: 'night-rooftop',
    decorate: decorateRooftop,
  },
};

export function isCourtLocationId(v: unknown): v is CourtLocationId {
  return typeof v === 'string' && (COURT_LOCATION_IDS as readonly string[]).includes(v);
}

/** Locations the picker offers. */
export function readyCourtLocations(): CourtLocation[] {
  return COURT_LOCATION_IDS.map((id) => COURT_LOCATIONS[id]).filter((l) => l.ready);
}

/**
 * The environment half swapped under the court half. Venice, unknown ids and non-basketball specs return the SAME
 * spec object (identity), so nothing outside basketball can change.
 */
export function applyLocation<T extends NexusWebSpec>(spec: T, id: string | undefined): T {
  if (!id || id === 'venice' || !isCourtLocationId(id) || !BASKETBALL_SPEC_IDS.has(spec.modeId)) return spec;
  const loc = COURT_LOCATIONS[id];
  if (!loc.environment) return spec;
  const court = spec.props.filter((p) => COURT_PROP_KINDS.has(p.kind));
  // The owner wants the scanned Venice court under every location. The rebuilt scan (venice-blue-court.glb, 2026-09-05)
  // renders no visible court on its own — under Venice the court seen now is the other writer's Meshy court, mounted by
  // their look pass, which forces Venice's sky and palms. Until that pass exposes a court-only mount, a location stands on
  // the spec's procedural court at the same rim (mapKey dropped), so nothing half-mounted shows.
  return { ...spec, environment: loc.environment, props: [...court, ...(loc.surround ?? [])], mapKey: undefined };
}

export const COURT_LOCATION_KEY = 'fel-court-location';

/** The player's pick: `?location=` wins, then the remembered pick, then Venice. */
export function readCourtLocation(): CourtLocationId {
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('location');
      if (isCourtLocationId(q) && COURT_LOCATIONS[q].ready) return q;
      const s = window.localStorage.getItem(COURT_LOCATION_KEY);
      if (isCourtLocationId(s) && COURT_LOCATIONS[s].ready) return s;
    }
  } catch { /* private mode: Venice */ }
  return 'venice';
}

export function writeCourtLocation(id: CourtLocationId): void {
  try { window.localStorage.setItem(COURT_LOCATION_KEY, id); } catch { /* convenience only */ }
}

// ── Blossom Park ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Stylised cherry trees (a trunk and a cluster of blossom heads) ring the court outside the play area, and petals fall
// the way the dojo's do, over the whole court. Everything is procedural — no assets.

/** Stylised trees: a trunk and a cluster of canopy heads. Shared by Blossom Park (pinks) and Canopy Court (greens). */
function plantTrees(scene: Scene, holder: TransformNode, tag: string, spots: Array<[number, number, number]>, heads: string[], trunkHex: string, seed0: number): void {
  const trunkMat = new PBRMaterial(`loc_${tag}_trunk`, scene);
  trunkMat.albedoColor = Color3.FromHexString(trunkHex); trunkMat.metallic = 0; trunkMat.roughness = 0.95;
  const headMats = heads.map((hex, i) => {
    const m = new PBRMaterial(`loc_${tag}_head_${i}`, scene);
    m.albedoColor = Color3.FromHexString(hex); m.metallic = 0; m.roughness = 0.9;
    m.emissiveColor = Color3.FromHexString(hex).scale(0.04);
    return m;
  });
  let seed = seed0;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  spots.forEach(([x, z, s], i) => {
    const h = 3.0 * s;
    const trunk = MeshBuilder.CreateCylinder(`loc_${tag}_trunk_${i}`, { height: h, diameterTop: 0.22 * s, diameterBottom: 0.36 * s, tessellation: 7 }, scene);
    trunk.position.set(x, h / 2, z); trunk.material = trunkMat; trunk.parent = holder; trunk.isPickable = false;
    const n = 6 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const r = (0.6 + rnd() * 0.5) * s;
      const head = MeshBuilder.CreateSphere(`loc_${tag}_head_${i}_${k}`, { diameter: r * 2, segments: 6 }, scene);
      head.position.set(x + (rnd() - 0.5) * 2.0 * s, h + (rnd() - 0.15) * 1.1 * s, z + (rnd() - 0.5) * 2.0 * s);
      head.scaling.y = 0.8;
      head.material = headMats[(i + k) % headMats.length]; head.parent = holder; head.isPickable = false;
    }
  });
  holder.onDisposeObservable.add(() => { trunkMat.dispose(); headMats.forEach((m) => m.dispose()); });
}

/** Ring positions for the DUNK camera (behind the player, 0.9 rad, looking down −z): both sides just outside the court
 *  (x ±11) and a taller row behind the far crowd tier (z −20…−25). */
const COURT_TREE_SPOTS: Array<[number, number, number]> = [
  [-11, -3, 0.9], [11, -2, 1.0], [-11.5, -8, 1.0], [11.5, -7.5, 0.9], [-11, -13, 0.95], [11, -12.5, 1.05],
  [-12, -21, 1.25], [-4.5, -23, 1.15], [4, -22, 1.3], [12, -21, 1.2], [-8, -25, 1.1], [8.5, -25, 1.15],
  [-11, 4, 0.85], [11, 5, 0.9],
];

function decorateBlossom(scene: Scene, root: TransformNode): void {
  const holder = new TransformNode('loc_blossom', scene); holder.parent = root;
  // Deeper pinks than the pastel first pass: under the venue grade (exposure 1.15, contrast 1.35) pale pink read as white cloud.
  plantTrees(scene, holder, 'blossom', COURT_TREE_SPOTS, ['#E8577F', '#F06292', '#F48FB1'], '#5A3D2E', 7);
  // petals over the court
  const tex = new DynamicTexture('loc_blossom_petal', 16, scene, false);
  const g = tex.getContext() as CanvasRenderingContext2D; g.clearRect(0, 0, 16, 16);
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(8, 8, 6, 4, 0.6, 0, Math.PI * 2); g.fill(); tex.update(); tex.hasAlpha = true;
  const ps = new ParticleSystem('loc_blossom_petals', 220, scene);
  ps.particleTexture = tex as unknown as Texture; ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.emitter = new Vector3(0, 7, 3);
  ps.minEmitBox = new Vector3(-16, 0, -16); ps.maxEmitBox = new Vector3(16, 1, 20);
  ps.color1 = new Color4(1, 0.72, 0.84, 0.9); ps.color2 = new Color4(1, 0.86, 0.91, 0.7); ps.colorDead = new Color4(1, 0.8, 0.88, 0);
  ps.minSize = 0.07; ps.maxSize = 0.16; ps.minLifeTime = 7; ps.maxLifeTime = 11; ps.emitRate = 18;
  ps.gravity = new Vector3(0.25, -0.5, 0.1); ps.minAngularSpeed = -1.5; ps.maxAngularSpeed = 1.5;
  ps.start();
  holder.onDisposeObservable.add(() => { ps.dispose(); tex.dispose(); });
}

// ── Orbit ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A court floating in space: a starfield painted on the inside of a far sphere and a planet rising on the horizon behind
// the hoop, its surface a procedural blue-white marble. Both unlit (emissive) so the venue's lights do not touch them.

function decorateOrbit(scene: Scene, root: TransformNode): void {
  const holder = new TransformNode('loc_orbit', scene); holder.parent = root;
  // starfield
  const starTex = new DynamicTexture('loc_orbit_stars', 1024, scene, false);
  const g = starTex.getContext() as CanvasRenderingContext2D;
  g.fillStyle = '#03040c'; g.fillRect(0, 0, 1024, 1024);
  let seed = 11;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 2600; i++) {                     // finer and denser: at 190 m the texture minifies and each dot spreads
    const r = rnd() < 0.06 ? 1.3 + rnd() * 0.8 : 0.45 + rnd() * 0.6;
    const a = 0.45 + rnd() * 0.55;
    g.fillStyle = rnd() < 0.15 ? `rgba(180,205,255,${a})` : `rgba(255,255,255,${a})`;
    g.beginPath(); g.arc(rnd() * 1024, rnd() * 1024, r, 0, Math.PI * 2); g.fill();
  }
  // a faint milky band
  const band = g.createLinearGradient(0, 380, 0, 640);
  band.addColorStop(0, 'rgba(120,140,200,0)'); band.addColorStop(0.5, 'rgba(120,140,200,0.14)'); band.addColorStop(1, 'rgba(120,140,200,0)');
  g.fillStyle = band; g.fillRect(0, 380, 1024, 260);
  starTex.update();
  const starMat = new StandardMaterial('loc_orbit_starmat', scene);
  starMat.emissiveTexture = starTex; starMat.disableLighting = true; starMat.backFaceCulling = false;
  starMat.diffuseColor = Color3.Black(); starMat.specularColor = Color3.Black();
  // INSIDE the venue's own sky (an opaque 400 m sphere) — outside it the stars were hidden.
  const dome = MeshBuilder.CreateSphere('loc_orbit_dome', { diameter: 380, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
  dome.material = starMat; dome.parent = holder; dome.isPickable = false; dome.infiniteDistance = true; dome.applyFog = false;
  // planet
  const planetTex = new DynamicTexture('loc_orbit_planet', 512, scene, false);
  const pg = planetTex.getContext() as CanvasRenderingContext2D;
  pg.fillStyle = '#1c4f9c'; pg.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {                       // continents and cloud
    const land = rnd() < 0.55;
    pg.fillStyle = land ? `rgba(${60 + rnd() * 40 | 0},${110 + rnd() * 50 | 0},${70 + rnd() * 30 | 0},0.9)` : 'rgba(255,255,255,0.55)';
    pg.beginPath(); pg.ellipse(rnd() * 512, rnd() * 512, 20 + rnd() * 70, 10 + rnd() * 40, rnd() * Math.PI, 0, Math.PI * 2); pg.fill();
  }
  planetTex.update();
  const planetMat = new StandardMaterial('loc_orbit_planetmat', scene);
  planetMat.emissiveTexture = planetTex; planetMat.disableLighting = true; planetMat.specularColor = Color3.Black();
  const planet = MeshBuilder.CreateSphere('loc_orbit_planet', { diameter: 80, segments: 32 }, scene);
  planet.position.set(-42, -10, -134);                 // a world rising over the left horizon behind the hoop, inside the star dome (|p| + r < 190)
  planet.material = planetMat; planet.parent = holder; planet.isPickable = false; planet.applyFog = false;
  // terminator: a dark half so the planet reads lit from the sun side
  const shade = MeshBuilder.CreateSphere('loc_orbit_shade', { diameter: 80.6, segments: 32, slice: 0.5 }, scene);
  const shadeMat = new StandardMaterial('loc_orbit_shademat', scene);
  shadeMat.diffuseColor = Color3.Black(); shadeMat.emissiveColor = new Color3(0.01, 0.01, 0.03); shadeMat.disableLighting = true; shadeMat.alpha = 0.85;
  shade.material = shadeMat; shade.position.copyFrom(planet.position); shade.rotation.z = Math.PI / 2; shade.rotation.y = -0.6; shade.parent = holder; shade.isPickable = false; shade.applyFog = false;
  // slow drift of the stars
  const obs = scene.onBeforeRenderObservable.add(() => { dome.rotation.y += 0.00004 * scene.getEngine().getDeltaTime(); });
  holder.onDisposeObservable.add(() => { scene.onBeforeRenderObservable.remove(obs); starTex.dispose(); planetTex.dispose(); starMat.dispose(); planetMat.dispose(); shadeMat.dispose(); });
}

// ── Canopy Court ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The forest is procedural (plantTrees) over Kenney undergrowth (prop set 'canopy-court'); dappled light — a leaf-pattern
// projection on a spotlight over the court — and warm motes drifting in the air.

function decorateCanopy(scene: Scene, root: TransformNode): void {
  const holder = new TransformNode('loc_canopy', scene); holder.parent = root;
  // the forest: the same stylised trees as Blossom Park in greens, one size up, plus a few giants behind the wall
  plantTrees(scene, holder, 'canopy', [...COURT_TREE_SPOTS.map(([x, z, s]) => [x, z, s * 1.25] as [number, number, number]), [-16, -30, 1.9], [0, -32, 2.1], [16, -30, 1.8]], ['#1B5E20', '#2E7D32', '#33691E', '#245C2A'], '#4E342E', 31);   // deep greens: the grade lifts them toward lime
  let seed = 23;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  // (the painted mural wall of the first pass is gone — owner, 2026-09-05: cluttered; the trees carry the back line)
  // dappled light: a leaf-hole pattern projected from above
  const cookie = new DynamicTexture('loc_canopy_cookie', 512, scene, false);
  const c = cookie.getContext() as CanvasRenderingContext2D;
  c.fillStyle = '#5a5a5a'; c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(255,255,255,${0.5 + rnd() * 0.5})`; c.beginPath(); c.ellipse(rnd() * 512, rnd() * 512, 6 + rnd() * 22, 4 + rnd() * 12, rnd() * Math.PI, 0, Math.PI * 2); c.fill(); }
  cookie.update();
  const dapple = new SpotLight('loc_canopy_dapple', new Vector3(0, 26, -2), new Vector3(0, -1, 0), Math.PI / 2.4, 1, scene);
  dapple.projectionTexture = cookie; dapple.intensity = 900; dapple.diffuse = Color3.FromHexString('#FFF1C2'); dapple.specular = Color3.Black(); dapple.parent = holder;
  // motes
  const dot = new DynamicTexture('loc_canopy_dot', 16, scene, false);
  const d = dot.getContext() as CanvasRenderingContext2D; d.clearRect(0, 0, 16, 16); d.fillStyle = '#fff'; d.beginPath(); d.arc(8, 8, 5, 0, Math.PI * 2); d.fill(); dot.update(); dot.hasAlpha = true;
  const motes = new ParticleSystem('loc_canopy_motes', 140, scene);
  motes.particleTexture = dot as unknown as Texture; motes.blendMode = ParticleSystem.BLENDMODE_ADD;
  motes.emitter = new Vector3(0, 3, -2); motes.minEmitBox = new Vector3(-12, -2, -14); motes.maxEmitBox = new Vector3(12, 5, 12);
  motes.color1 = new Color4(1, 0.93, 0.7, 0.35); motes.color2 = new Color4(1, 0.85, 0.55, 0.2); motes.colorDead = new Color4(1, 0.9, 0.6, 0);
  motes.minSize = 0.03; motes.maxSize = 0.08; motes.minLifeTime = 6; motes.maxLifeTime = 12; motes.emitRate = 12;
  motes.gravity = new Vector3(0.05, 0.02, 0); motes.direction1 = new Vector3(-0.2, 0.05, -0.2); motes.direction2 = new Vector3(0.2, 0.1, 0.2);
  motes.start();
  holder.onDisposeObservable.add(() => { motes.dispose(); dot.dispose(); dapple.dispose(); cookie.dispose(); });
}

// ── Night Rooftop ────────────────────────────────────────────────────────────────────────────────────────────────────
// The parapet and planters are the suburban kit (prop set 'night-rooftop'). Here: the roof slab the court sits on, so
// beyond the parapet the city drops away; string lights on posts down both sides; the 'neon' backdrop is the skyline.

function decorateRooftop(scene: Scene, root: TransformNode): void {
  const holder = new TransformNode('loc_rooftop', scene); holder.parent = root;
  const slabMat = new PBRMaterial('loc_rooftop_slab', scene); slabMat.albedoColor = Color3.FromHexString('#2A2731'); slabMat.metallic = 0; slabMat.roughness = 0.9;
  const slab = MeshBuilder.CreateBox('loc_rooftop_slabmesh', { width: 26, height: 1.2, depth: 38 }, scene);
  slab.position.set(0, -0.62, 0); slab.material = slabMat; slab.parent = holder; slab.isPickable = false;
  const postMat = new PBRMaterial('loc_rooftop_post', scene); postMat.albedoColor = Color3.FromHexString('#1B1B22'); postMat.metallic = 0.2; postMat.roughness = 0.6;
  const bulbMat = new StandardMaterial('loc_rooftop_bulb', scene); bulbMat.emissiveColor = Color3.FromHexString('#FFD27A'); bulbMat.disableLighting = true;
  const wireMat = new StandardMaterial('loc_rooftop_wire', scene); wireMat.emissiveColor = Color3.FromHexString('#2A2A2A'); wireMat.disableLighting = true;
  const zs = [-15, -7.5, 0, 7.5, 15];
  for (const x of [-11.5, 11.5]) {
    for (const z of zs) {
      const post = MeshBuilder.CreateCylinder(`loc_rooftop_postmesh_${x}_${z}`, { height: 4.2, diameter: 0.12, tessellation: 6 }, scene);
      post.position.set(x, 2.1, z); post.material = postMat; post.parent = holder; post.isPickable = false;
    }
    for (let i = 0; i < zs.length - 1; i++) {          // a sagging string with bulbs between posts
      const z0 = zs[i], z1 = zs[i + 1];
      for (let k = 0; k <= 8; k++) {
        const tt = k / 8; const z = z0 + (z1 - z0) * tt; const sag = Math.sin(tt * Math.PI) * 0.45;
        const bulb = MeshBuilder.CreateSphere(`loc_rooftop_bulb_${x}_${i}_${k}`, { diameter: 0.24, segments: 4 }, scene);
        bulb.position.set(x, 4.1 - sag, z); bulb.material = bulbMat; bulb.parent = holder; bulb.isPickable = false;
      }
      const wire = MeshBuilder.CreateCylinder(`loc_rooftop_wire_${x}_${i}`, { height: z1 - z0, diameter: 0.02, tessellation: 3 }, scene);
      wire.position.set(x, 3.95, (z0 + z1) / 2); wire.rotation.x = Math.PI / 2; wire.material = wireMat; wire.parent = holder; wire.isPickable = false;
    }
  }
  // the city: dark towers with lit windows ringing the roof at 55–115 m, taller behind the hoop
  const winTex = new DynamicTexture('loc_rooftop_windows', 128, scene, false);
  const w = winTex.getContext() as CanvasRenderingContext2D; w.fillStyle = '#0B0C14'; w.fillRect(0, 0, 128, 128);
  let seed = 41; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let yy = 4; yy < 128; yy += 10) for (let xx = 4; xx < 128; xx += 8) { if (rnd() < 0.55) { w.fillStyle = rnd() < 0.3 ? '#FFE3A8' : '#B9D4FF'; w.globalAlpha = 0.6 + rnd() * 0.4; w.fillRect(xx, yy, 4, 6); } }
  winTex.update(); winTex.wrapU = Texture.WRAP_ADDRESSMODE; winTex.wrapV = Texture.WRAP_ADDRESSMODE;
  const towerMat = new StandardMaterial('loc_rooftop_tower', scene); towerMat.emissiveTexture = winTex; towerMat.diffuseColor = new Color3(0.03, 0.03, 0.05); towerMat.specularColor = Color3.Black();
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2 + rnd() * 0.1; const r = 55 + rnd() * 60;
    const behind = Math.cos(a) < -0.3;                 // the far side (−z) gets the tall ones
    const hgt = (behind ? 22 : 12) + rnd() * (behind ? 30 : 16); const wid = 6 + rnd() * 10;
    const tower = MeshBuilder.CreateBox(`loc_rooftop_tower_${i}`, { width: wid, height: hgt, depth: 6 + rnd() * 8 }, scene);
    tower.position.set(Math.sin(a) * r, hgt / 2 - 6, Math.cos(a) * r); tower.rotation.y = -a;
    tower.material = towerMat; tower.parent = holder; tower.isPickable = false;
    const scaleU = Math.max(1, Math.round(wid / 4)), scaleV = Math.max(1, Math.round(hgt / 4));
    void scaleU; void scaleV;
  }
  // warm pools under the strings so the light reads on the court
  const glowL = new SpotLight('loc_rooftop_glow_l', new Vector3(-11.5, 4.2, 0), new Vector3(0.35, -1, 0), Math.PI / 1.6, 1.2, scene);
  const glowR = new SpotLight('loc_rooftop_glow_r', new Vector3(11.5, 4.2, 0), new Vector3(-0.35, -1, 0), Math.PI / 1.6, 1.2, scene);
  for (const l of [glowL, glowR]) { l.diffuse = Color3.FromHexString('#FFC978'); l.specular = Color3.Black(); l.intensity = 260; l.parent = holder; }
  holder.onDisposeObservable.add(() => { glowL.dispose(); glowR.dispose(); slabMat.dispose(); postMat.dispose(); bulbMat.dispose(); wireMat.dispose(); towerMat.dispose(); winTex.dispose(); });
}
