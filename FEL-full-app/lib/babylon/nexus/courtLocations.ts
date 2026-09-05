// Court locations (owner ask 2026-09-05, docs/SPEC-COURT-LOCATIONS.md). A location is the ENVIRONMENT half of a
// basketball venue spec — sky, backdrop, mood, surround dressing, ambient particles — swapped under the COURT half:
// court, hoop, banner, crowd, actors and camera never change, so play, rim and camera are untouched and Venice with no
// pick is byte-identical to the spec as authored. Decoration that needs meshes (blossom trees, a starfield) is added
// AFTER the scene builds through the venue mount hook — NexusWebScene.ts stays fenced.

import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, PBRMaterial, StandardMaterial, Texture, TransformNode, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import type { Environment, NexusWebSpec, PropKind } from './NexusWebScene';

export const COURT_LOCATION_IDS = ['venice', 'blossom', 'orbit', 'canopy', 'rooftop'] as const;
export type CourtLocationId = (typeof COURT_LOCATION_IDS)[number];

/** The three basketball specs a location may dress. */
export const BASKETBALL_SPEC_IDS = new Set(['basketball_dunk', 'basketball_h2h', 'basketball_3v3']);
/** Game-component mode ids that show the picker on the boot splash. */
export const BASKETBALL_MODE_IDS = new Set(['dunk', 'dunkduel', 'threepoint', 'onevone', 'threevthree', 'basketball', 'hoops1v1', 'hoops3v3']);

/** Court props that survive a location swap; everything else in a spec's props is dressing and is replaced. */
const COURT_PROP_KINDS = new Set<PropKind>(['hoop', 'backboardPole', 'net', 'banner', 'crowdTier']);

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
      skyTop: '#F7C7D9', skyBottom: '#B08BB5', fogColor: '#E8C3D2', fogDensity: 0.0022,   // thin: the far trees must stay pink, not fog-white
      ambient: 0.62, sunDirection: [-0.35, -0.8, 0.45], sunColor: '#FFE6C7', grade, backdrop: 'city',
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
    id: 'canopy', name: 'Canopy Court', sub: 'CANOPY COURT', tint: '#9be37a', thumb: 'canopy-court', ready: false,
    environment: { skyTop: '#7BA35A', skyBottom: '#2E4A2B', fogColor: '#4E6B3F', fogDensity: 0.012, ambient: 0.5, sunDirection: [-0.2, -0.9, 0.3], sunColor: '#FFE9B0', grade },
    surround: [], propSet: '',
  },
  rooftop: {
    id: 'rooftop', name: 'Night Rooftop', sub: 'NIGHT ROOFTOP', tint: '#ffd166', thumb: 'night-rooftop', ready: false,
    environment: { skyTop: '#0B1230', skyBottom: '#3A2A5E', fogColor: '#241A3F', fogDensity: 0.008, ambient: 0.45, sunDirection: [-0.4, -0.85, 0.35], sunColor: '#FFD9A0', grade, backdrop: 'neon' },
    surround: [{ kind: 'lamp', position: [-13, 0, 2] }, { kind: 'lamp', position: [13, 0, 2] }], propSet: '',
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
  // The scanned Venice court map carries Venice's own palms and walls inside the GLB, so under a location the spec's
  // procedural court and hoop stand instead of the map (the modes' play clamps do not depend on the map).
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

function decorateBlossom(scene: Scene, root: TransformNode): void {
  const holder = new TransformNode('loc_blossom', scene); holder.parent = root;
  const trunkMat = new PBRMaterial('loc_blossom_trunk', scene);
  trunkMat.albedoColor = Color3.FromHexString('#5A3D2E'); trunkMat.metallic = 0; trunkMat.roughness = 0.95;
  // Deeper pinks than the pastel first pass: under the venue grade (exposure 1.15, contrast 1.35) pale pink read as white cloud.
  const bloomMats = ['#E8577F', '#F06292', '#F48FB1'].map((hex, i) => {
    const m = new PBRMaterial(`loc_blossom_bloom_${i}`, scene);
    m.albedoColor = Color3.FromHexString(hex); m.metallic = 0; m.roughness = 0.9;
    m.emissiveColor = Color3.FromHexString(hex).scale(0.04);   // a hint of held light, not a glow
    return m;
  });
  // Placement is for the DUNK camera (behind the player, 0.9 rad, looking down −z at the hoop): the court is x ±8,
  // z ±14, the player is clamped to x ±6. Trees line both sides just outside the court (x ±11) inside the cone, and
  // taller ones stand behind the far crowd tier (z −20…−25) so their canopies rise above it under the hoop.
  const spots: Array<[number, number, number]> = [
    [-11, -3, 0.9], [11, -2, 1.0], [-11.5, -8, 1.0], [11.5, -7.5, 0.9], [-11, -13, 0.95], [11, -12.5, 1.05],
    [-12, -21, 1.25], [-4.5, -23, 1.15], [4, -22, 1.3], [12, -21, 1.2], [-8, -25, 1.1], [8.5, -25, 1.15],
    [-11, 4, 0.85], [11, 5, 0.9],
  ];
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  spots.forEach(([x, z, s], i) => {
    const h = 3.0 * s;
    const trunk = MeshBuilder.CreateCylinder(`loc_blossom_trunk_${i}`, { height: h, diameterTop: 0.22 * s, diameterBottom: 0.36 * s, tessellation: 7 }, scene);
    trunk.position.set(x, h / 2, z); trunk.material = trunkMat; trunk.parent = holder; trunk.isPickable = false;
    const heads = 6 + Math.floor(rnd() * 3);   // more, smaller heads: a canopy, not a cloud
    for (let k = 0; k < heads; k++) {
      const r = (0.6 + rnd() * 0.5) * s;
      const head = MeshBuilder.CreateSphere(`loc_blossom_head_${i}_${k}`, { diameter: r * 2, segments: 6 }, scene);
      head.position.set(x + (rnd() - 0.5) * 2.0 * s, h + (rnd() - 0.15) * 1.1 * s, z + (rnd() - 0.5) * 2.0 * s);
      head.scaling.y = 0.8;
      head.material = bloomMats[(i + k) % bloomMats.length]; head.parent = holder; head.isPickable = false;
    }
  });
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
  holder.onDisposeObservable.add(() => { ps.dispose(); tex.dispose(); trunkMat.dispose(); bloomMats.forEach((m) => m.dispose()); });
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
