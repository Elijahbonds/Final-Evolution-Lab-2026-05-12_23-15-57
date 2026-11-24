/**
 * VENICE'S GROUND FROM THE HIGH CAMERA (look pass C4, lane/look-world, 2026-11-24; docs/LOOK-PASS-AUDIT.md finding 16).
 *
 * Measured before: from the hub's high camera the park's concrete slab and the sand are one texture tiled flat to the horizon — the
 * same 6 m square over and over, no wear, no change with distance, so the park reads as unfinished (look-audit
 * shots/b1-landscape-venice-d-play.jpg). The texture memory had to be re-measured before anything was added (the plan's rule):
 * this adds NO texture. `venue.veniceGroundV2` 1 draws the slab and the sand as a grid (one vertex every ~4 m, the same one draw)
 * whose vertex colour carries a slow, fixed variation over the tiled map — worn and weathered patches on the concrete tens of metres
 * across, damper and drier drifts on the sand — so the repeat breaks up and the ground has a scale. The bike path and the sea are
 * unchanged. 0 = the flat tiled planes, as before.
 */

/** venue.veniceGroundV2: 1 = the slab and the sand weathered by vertex colour; 0 = the flat tiled planes as before. */
export const VENICE_GROUND_V2 = 0;

/** The grid: one vertex every `cellM` metres, at most `maxDiv` cells a side (a 300 m sand plane is 64 × 64). [TUNE] new */
export const GROUND_V2 = { cellM: 4, minDiv: 8, maxDiv: 64 } as const;

/** The subdivisions for a plane `w` × `d` m (pure). */
export function groundDiv(w: number, d: number): number {
  return Math.max(GROUND_V2.minDiv, Math.min(GROUND_V2.maxDiv, Math.round(Math.max(w, d) / GROUND_V2.cellM)));
}

function hash(a: number, b: number): number { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Two octaves, 0..1. */
function fbm(x: number, z: number): number { return (vnoise(x, z) * 2 + vnoise(x * 2.07 + 13.1, z * 2.07 - 7.3)) / 3; }

/** The ground's colour multiplier at a world point (pure; r, g, b around 1). Concrete: worn patches, darker and a touch warmer;
 *  sand: damp drifts, darker and a touch cooler. Anything else: no change. [TUNE] new — a look call, the owner's */
export function groundTint(x: number, z: number, kind: string): [number, number, number] {
  if (kind === 'concrete') {
    const n = fbm(x * 0.03, z * 0.03), f = vnoise(x * 0.21 + 50, z * 0.21 - 20);
    const v = 0.76 + 0.3 * n + 0.06 * (f - 0.5);
    return [v * (1 + 0.02 * (1 - n)), v, v * (1 - 0.03 * (1 - n))];
  }
  if (kind === 'sand') {
    const n = fbm(x * 0.018 + 100, z * 0.018 + 40), f = vnoise(x * 0.15, z * 0.15);
    const v = 0.82 + 0.24 * n + 0.05 * (f - 0.5);
    return [v * (1 - 0.02 * (1 - n)), v, v * (1 + 0.015 * (1 - n))];
  }
  return [1, 1, 1];
}
