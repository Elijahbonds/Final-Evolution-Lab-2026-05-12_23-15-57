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

/** kit.shapeKeepsFit: 1 = a garment's fit survives the Creator's shape; 2 = only the fit's OUTWARD moves survive (a vertex the
 *  fit sank toward the body is drawn where it was loaded, so the shape's bulk is never measured from a sunk band); 0 = as before.
 *  KIT-FIT-PLAN §10.2: 1 let the thigh through the short in games (game girth-max 1,247 -> 5,172 px); 2 is the follow-up. */
export const SHAPE_KEEPS_FIT = 1;
export const shapeFitMode = (): 0 | 1 | 2 => { const v = feel('kit.shapeKeepsFit', SHAPE_KEEPS_FIT); return v >= 1.5 ? 2 : v >= 0.5 ? 1 : 0; };
export const shapeKeepsFit = (): boolean => shapeFitMode() > 0;

/** The part of a fit's move (`before` -> `after`, local positions) the shape keeps: all of it in mode 1; in mode 2 only the vertices
 *  that moved along their own normal (out of the body), the others 0. */
export function keptFitDelta(before: ArrayLike<number>, after: ArrayLike<number>, normals: ArrayLike<number> | null, mode = shapeFitMode()): Float32Array {
  const d = new Float32Array(after.length);
  for (let i = 0; i < d.length; i++) d[i] = after[i] - before[i];
  if (mode !== 2 || !normals || normals.length !== d.length) return d;
  for (let v = 0; v < d.length; v += 3) if (d[v] * normals[v] + d[v + 1] * normals[v + 1] + d[v + 2] * normals[v + 2] < 0) d[v] = d[v + 1] = d[v + 2] = 0;
  return d;
}

/** After `mesh`'s positions went from `before` to `after` (same layout), move every morph target by the same per-vertex amount.
 *  Returns the targets moved. No-op with the knob off, without a morph manager, or when a target's layout differs. */
export function carryShapeMorph(mesh: Mesh, before: ArrayLike<number>, after: ArrayLike<number>): number {
  if (!shapeKeepsFit()) return 0;
  const mgr = mesh.morphTargetManager;
  if (!mgr || before.length !== after.length) return 0;
  let n = 0;
  const d = keptFitDelta(before, after, shapeFitMode() === 2 ? mesh.getVerticesData('normal') : null);
  for (let t = 0; t < mgr.numTargets; t++) {
    const tg = mgr.getTarget(t), p = tg.getPositions();
    if (!p || p.length !== after.length) continue;
    const o = new Float32Array(p.length);
    for (let i = 0; i < p.length; i++) o[i] = p[i] + d[i];
    tg.setPositions(o); n++;
  }
  return n;
}
