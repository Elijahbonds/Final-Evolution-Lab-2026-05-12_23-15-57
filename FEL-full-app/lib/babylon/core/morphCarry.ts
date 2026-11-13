// morphCarry — a garment's fit survives the Creator's shape (lane/kit-fit, owner 2026-11-12: "fix how the clothes fit").
//
// THE FAULT, MEASURED (scripts/probes/kit-fit/morphfit.ts, male kit, girth 1.6). The Creator's shape is a morph target on each
// worn garment (renderShape: 'felShape') that holds ABSOLUTE positions — the garment's vertices as they were when the shape was
// built, plus the bulk — and the GPU draws a morph at influence 1 as exactly those positions. The garment fits that run after
// the first frame (the waistband tucked under the top, the edge flare, the shoe's fold: bodyMask.ts, garmentFixes.ts) rewrite
// the vertices, but the morph still held the pre-fit ones: on a shaped body the shape UNDID the waistband fit on 225 of its 293
// vertices, so the short stood over the tee's hem (the kit-glitch lane's open job 3) — on every Creator build, not only the
// girth-max one.
//
// THE RULE. Whoever rewrites a garment's vertices moves its morph targets by the same amount (carryShapeMorph), and the shape
// is built on the garment's CURRENT vertices (renderShape), so the fit and the shape add up in either order.
// `kit.shapeKeepsFit` (1 on; 0 = as before: the shape draws the pre-fit garment).
import type { Mesh } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';

/** kit.shapeKeepsFit: 1 = a garment's fit survives the Creator's shape; 0 = as before. */
export const SHAPE_KEEPS_FIT = 1;
export const shapeKeepsFit = (): boolean => feel('kit.shapeKeepsFit', SHAPE_KEEPS_FIT) >= 0.5;

/** After `mesh`'s positions went from `before` to `after` (same layout), move every morph target by the same per-vertex amount.
 *  Returns the targets moved. No-op with the knob off, without a morph manager, or when a target's layout differs. */
export function carryShapeMorph(mesh: Mesh, before: ArrayLike<number>, after: ArrayLike<number>): number {
  if (!shapeKeepsFit()) return 0;
  const mgr = mesh.morphTargetManager;
  if (!mgr || before.length !== after.length) return 0;
  let n = 0;
  for (let t = 0; t < mgr.numTargets; t++) {
    const tg = mgr.getTarget(t), p = tg.getPositions();
    if (!p || p.length !== after.length) continue;
    const o = new Float32Array(p.length);
    for (let i = 0; i < p.length; i++) o[i] = p[i] + after[i] - before[i];
    tg.setPositions(o); n++;
  }
  return n;
}
