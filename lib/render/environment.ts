/* ================================================================
   M14-P6 — Lighting & Environment config CORE (PURE)
   ----------------------------------------------------------------
   Framework-free single source of truth for the render environment:
     • tone-mapping profiles per venue (centralises the exposure
       magic-numbers that were scattered across every <Canvas>),
     • which SceneLighting variant each game mode should use,
     • the 4-wall enclosure geometry math for indoor venues.

   NOTHING here imports three.js or the DOM, so the live scenes and
   the headless test suite import the exact same code (mirrors the
   P4 camera-director and P5 cinematic cores).

   Every feel/appearance number is tagged // TUNE(elijah).
   ================================================================ */

export type Vec3 = [number, number, number];

/* ---------------- Tone mapping ---------------- */
// The renderer already standardised on ACES Filmic everywhere; we keep
// that as the canonical mode and only vary exposure per venue mood.
export type ToneMode = 'aces';
export interface ToneProfile {
  mode: ToneMode;
  exposure: number;
}

// Venue "kinds" group modes that share a lighting/exposure mood.
export type VenueKind =
  | 'arena'      // indoor-ish basketball courts (bright, punchy)
  | 'dojo'       // warm temple interior
  | 'blue-court' // Venice blue hard-court
  | 'skatepark'  // golden-hour dusk
  | 'outdoor'    // open-air day (surf / snow / big-air)
  | 'pitch';     // soccer / football turf

// TUNE(elijah) — per-venue ACES exposure. These reproduce the values
// that were previously hard-coded in each <Canvas gl={{ toneMappingExposure }}>.
export const TONE_PROFILES: Record<VenueKind, ToneProfile> = {
  arena: { mode: 'aces', exposure: 1.1 },
  dojo: { mode: 'aces', exposure: 1.05 },
  'blue-court': { mode: 'aces', exposure: 1.1 },
  skatepark: { mode: 'aces', exposure: 1.1 },
  outdoor: { mode: 'aces', exposure: 1.1 },
  pitch: { mode: 'aces', exposure: 1.05 },
};

/* ---------------- Lighting variant selection ---------------- */
// Mirrors the variants implemented in components/three/lighting.tsx.
export type LightingVariant = 'venice' | 'dojo' | 'blue-court' | 'skatepark';

// Which lighting rig + venue each 3D game mode should adopt. Mode keys are
// camelCase (matching lib/input-schemes.ts / the camera director), NOT slugs.
interface VenueBinding {
  venue: VenueKind;
  lighting: LightingVariant;
}

export const MODE_VENUE: Record<string, VenueBinding> = {
  // basketball family — bright arena, Venice rig
  basketball: { venue: 'arena', lighting: 'venice' },
  dunk: { venue: 'arena', lighting: 'venice' },
  threePoint: { venue: 'arena', lighting: 'venice' },
  threeVThree: { venue: 'arena', lighting: 'venice' },
  oneVOne: { venue: 'blue-court', lighting: 'blue-court' },
  // combat — dojo
  karate: { venue: 'dojo', lighting: 'dojo' },
  karateVersus: { venue: 'dojo', lighting: 'dojo' },
  // board sports — outdoor / skatepark
  skateboarding: { venue: 'skatepark', lighting: 'skatepark' },
  snowboarding: { venue: 'outdoor', lighting: 'venice' },
  surfing: { venue: 'outdoor', lighting: 'venice' },
  bigAir: { venue: 'outdoor', lighting: 'venice' },
  // field sports — pitch
  soccer: { venue: 'pitch', lighting: 'venice' },
  football: { venue: 'pitch', lighting: 'venice' },
};

const DEFAULT_BINDING: VenueBinding = { venue: 'arena', lighting: 'venice' };

export function venueBindingForMode(mode: string): VenueBinding {
  return MODE_VENUE[mode] ?? DEFAULT_BINDING;
}
export function lightingForMode(mode: string): LightingVariant {
  return venueBindingForMode(mode).lighting;
}
export function venueForMode(mode: string): VenueKind {
  return venueBindingForMode(mode).venue;
}
export function toneForMode(mode: string): ToneProfile {
  return TONE_PROFILES[venueForMode(mode)];
}

/* ---------------- 4-wall enclosure geometry ---------------- */
// A single wall panel expressed in world space. `rotationY` orients a
// default +Z-facing plane so its front face looks INWARD toward the arena
// centre. Consumers render a plane/box at `position` sized `width`×`height`.
export interface WallSpec {
  id: 'north' | 'south' | 'east' | 'west';
  position: Vec3;
  rotationY: number;
  width: number;
  height: number;
}
export interface CeilingSpec {
  position: Vec3;
  width: number;
  depth: number;
}
export interface EnclosureSpec {
  walls: WallSpec[];
  ceiling: CeilingSpec | null;
}

export interface EnclosureOptions {
  boundsMin: Vec3;
  boundsMax: Vec3;
  height: number;      // wall height above the floor
  pad?: number;        // push walls outward beyond the navigable bounds
  ceiling?: boolean;   // also emit a ceiling panel
}

function finite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

/**
 * buildEnclosure — pure math producing 4 inward-facing perimeter walls
 * (plus an optional ceiling) that box in the given navigable bounds.
 * Deterministic and finite-safe.
 *
 * A default plane faces +Z. To face inward:
 *   • south wall (at min Z) faces +Z  -> rotationY = 0
 *   • north wall (at max Z) faces -Z  -> rotationY = PI
 *   • west  wall (at min X) faces +X  -> rotationY =  PI/2
 *   • east  wall (at max X) faces -X  -> rotationY = -PI/2
 */
export function buildEnclosure(opts: EnclosureOptions): EnclosureSpec {
  const pad = finite(opts.pad ?? 0);
  const h = Math.max(0.01, finite(opts.height, 6));
  const minX = finite(opts.boundsMin[0]);
  const minZ = finite(opts.boundsMin[2]);
  const maxX = finite(opts.boundsMax[0]);
  const maxZ = finite(opts.boundsMax[2]);
  const floorY = finite(opts.boundsMin[1]);

  const west = minX - pad;
  const east = maxX + pad;
  const south = minZ - pad;
  const north = maxZ + pad;
  const cx = (west + east) / 2;
  const cz = (south + north) / 2;
  const spanX = Math.max(0.01, east - west);
  const spanZ = Math.max(0.01, north - south);
  const midY = floorY + h / 2;

  const walls: WallSpec[] = [
    { id: 'south', position: [cx, midY, south], rotationY: 0, width: spanX, height: h },
    { id: 'north', position: [cx, midY, north], rotationY: Math.PI, width: spanX, height: h },
    { id: 'west', position: [west, midY, cz], rotationY: Math.PI / 2, width: spanZ, height: h },
    { id: 'east', position: [east, midY, cz], rotationY: -Math.PI / 2, width: spanZ, height: h },
  ];

  const ceiling: CeilingSpec | null = opts.ceiling
    ? { position: [cx, floorY + h, cz], width: spanX, depth: spanZ }
    : null;

  return { walls, ceiling };
}
