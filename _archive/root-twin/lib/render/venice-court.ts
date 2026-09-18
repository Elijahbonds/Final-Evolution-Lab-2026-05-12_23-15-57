/**
 * lib/render/venice-court.ts — M14-P7 Venice Court Environment (PURE)
 *
 * Single source of truth for the OUTDOOR Venice-beach basketball venue dressing.
 * The scanned `venice-blue-court` map floats in a sky backdrop with no
 * surrounding world, so the court reads as a void. This module derives a
 * deterministic set of perimeter props (chain-link fence, palm trees, boardwalk
 * benches, lamp posts) placed just OUTSIDE the navigable court bounds, so the
 * court reads as a real Venice-beach playground.
 *
 * PURE: no THREE / no DOM / no React imports. Deterministic + finite-safe so it
 * can be unit-tested headlessly (scripts/venice-tests.ts) and consumed by the
 * live <VeniceSurround> component (components/three/venice-surround.tsx).
 *
 * Unlike the dojo enclosure (4 solid walls) this venue is open-air: the props
 * ring the court at ground level and never occlude the sky/IBL above.
 */

import type { Vec3 } from './environment';

export type PropKind = 'palm' | 'bench' | 'fencePost' | 'lamp' | 'planter';

export interface PropPlacement {
  id: string;
  kind: PropKind;
  position: Vec3;
  rotationY: number; // radians, facing toward court centre where meaningful
  scale: number;     // uniform scale multiplier (1 = design default)
}

export interface SurroundOptions {
  boundsMin: Vec3;        // navigable AABB min (court floor)
  boundsMax: Vec3;        // navigable AABB max
  pad?: number;           // how far outside bounds the ring sits (world units)
  fencePostSpacing?: number; // spacing between chain-link posts (world units)
  palmScale?: number;     // scale multiplier for corner palms
}

export interface SurroundSpec {
  props: PropPlacement[];
  /** the padded perimeter rectangle the props ring (for the fence mesh). */
  perimeter: { minX: number; maxX: number; minZ: number; maxZ: number; floorY: number };
}

// TUNE(elijah): default dressing dial-in for the ±13 Venice court bounds.
const DEFAULT_PAD = 1.6;               // TUNE(elijah)
const DEFAULT_FENCE_SPACING = 3.2;     // TUNE(elijah)
const DEFAULT_PALM_SCALE = 1.0;        // TUNE(elijah)

function finite(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Build a deterministic ring of Venice-court perimeter props sitting just
 * outside the navigable bounds. Finite-safe: any non-finite bound collapses to
 * a symmetric ±10 court so the ring is always well-formed.
 */
export function buildCourtSurround(opts: SurroundOptions): SurroundSpec {
  const pad = finite(opts.pad ?? DEFAULT_PAD, DEFAULT_PAD);
  const spacing = Math.max(1, finite(opts.fencePostSpacing ?? DEFAULT_FENCE_SPACING, DEFAULT_FENCE_SPACING));
  const palmScale = finite(opts.palmScale ?? DEFAULT_PALM_SCALE, DEFAULT_PALM_SCALE);

  const bMinX = finite(opts.boundsMin?.[0], -10);
  const bMinZ = finite(opts.boundsMin?.[2], -10);
  const bMaxX = finite(opts.boundsMax?.[0], 10);
  const bMaxZ = finite(opts.boundsMax?.[2], 10);
  const floorY = finite(opts.boundsMin?.[1], 0);

  // Padded perimeter rectangle the ring sits on.
  const minX = Math.min(bMinX, bMaxX) - pad;
  const maxX = Math.max(bMinX, bMaxX) + pad;
  const minZ = Math.min(bMinZ, bMaxZ) - pad;
  const maxZ = Math.max(bMinZ, bMaxZ) + pad;

  const props: PropPlacement[] = [];

  // ── Corner palms (4) ── just outside each corner, leaning slightly inward.
  const corners: Array<{ id: string; x: number; z: number }> = [
    { id: 'palm-nw', x: minX, z: minZ },
    { id: 'palm-ne', x: maxX, z: minZ },
    { id: 'palm-sw', x: minX, z: maxZ },
    { id: 'palm-se', x: maxX, z: maxZ },
  ];
  for (const c of corners) {
    props.push({
      id: c.id,
      kind: 'palm',
      position: [c.x, floorY, c.z],
      rotationY: Math.atan2(-c.x, -c.z), // face toward court centre (0,0)
      scale: palmScale,
    });
  }

  // ── Lamp posts (2) ── mid north & south edges, lighting the court.
  props.push({ id: 'lamp-n', kind: 'lamp', position: [(minX + maxX) / 2, floorY, minZ], rotationY: 0, scale: 1 });
  props.push({ id: 'lamp-s', kind: 'lamp', position: [(minX + maxX) / 2, floorY, maxZ], rotationY: Math.PI, scale: 1 });

  // ── Boardwalk benches ── along the two sidelines (east & west), facing court.
  const benchZs = [-(maxZ - minZ) / 4 + (minZ + maxZ) / 2, (maxZ - minZ) / 4 + (minZ + maxZ) / 2];
  benchZs.forEach((z, i) => {
    props.push({ id: `bench-w${i}`, kind: 'bench', position: [minX + 0.4, floorY, z], rotationY: Math.PI / 2, scale: 1 });
    props.push({ id: `bench-e${i}`, kind: 'bench', position: [maxX - 0.4, floorY, z], rotationY: -Math.PI / 2, scale: 1 });
  });

  // ── Chain-link fence posts ── evenly spaced around the full perimeter.
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const nX = Math.max(2, Math.round(spanX / spacing));
  const nZ = Math.max(2, Math.round(spanZ / spacing));
  for (let i = 0; i <= nX; i++) {
    const x = minX + (spanX * i) / nX;
    props.push({ id: `fence-n${i}`, kind: 'fencePost', position: [x, floorY, minZ], rotationY: 0, scale: 1 });
    props.push({ id: `fence-s${i}`, kind: 'fencePost', position: [x, floorY, maxZ], rotationY: 0, scale: 1 });
  }
  for (let i = 1; i < nZ; i++) {
    const z = minZ + (spanZ * i) / nZ;
    props.push({ id: `fence-w${i}`, kind: 'fencePost', position: [minX, floorY, z], rotationY: Math.PI / 2, scale: 1 });
    props.push({ id: `fence-e${i}`, kind: 'fencePost', position: [maxX, floorY, z], rotationY: Math.PI / 2, scale: 1 });
  }

  return {
    props,
    perimeter: { minX, maxX, minZ, maxZ, floorY },
  };
}

// Optional scanned surround GLB (available in reference uploads). The procedural
// ring above is the default dressing; this transform is provided for scenes that
// opt into the scanned mesh instead.
export const VENICE_SURROUND_GLB = '/models/maps/venice-court-surround.glb';
export const VENICE_SURROUND_TRANSFORM: { scale: number; position: Vec3; rotationY: number } = {
  scale: 14,        // TUNE(elijah): match venice court map scale
  position: [0, 0, 0],
  rotationY: 0,
};
