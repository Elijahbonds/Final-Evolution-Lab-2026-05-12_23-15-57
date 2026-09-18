// mapSurgery — runtime cuts on a mounted baked map (Meshy / Luma GLBs). The offline sibling is scripts/map/cut-scan-stands.py;
// this one runs once the async mount lands, in WORLD coordinates, so a spec can flatten junk geometry the scan carries
// (the soccer stadium's two solid "goal" blocks that stood on the goal line with the keeper inside them).
import { Vector3, VertexBuffer } from '@babylonjs/core';
import type { TransformNode } from '@babylonjs/core';

export type FlattenBox = {
  x: [number, number]; z: [number, number];
  /** vertices above this world height are pushed down (the map's own floor at y≈0 is left alone) */
  yAbove?: number;
  /** where they go — a hair under the floor so the flattened faces never z-fight the pitch */
  floorY?: number;
};

/** Push every vertex of `node`'s meshes whose world position lies inside a box down to the floor. Returns vertices moved. */
export function flattenMapBoxes(node: TransformNode, boxes: FlattenBox[]): number {
  let moved = 0;
  node.computeWorldMatrix(true);
  const v = new Vector3(), w = new Vector3();
  for (const m of node.getChildMeshes(false)) {
    const pos = m.getVerticesData(VertexBuffer.PositionKind); if (!pos) continue;
    const wm = m.computeWorldMatrix(true); const inv = wm.clone().invert();
    const out = new Float32Array(pos); let touched = false;
    for (let i = 0; i < pos.length; i += 3) {
      v.set(pos[i], pos[i + 1], pos[i + 2]); Vector3.TransformCoordinatesToRef(v, wm, w);
      for (const b of boxes) {
        if (w.x >= b.x[0] && w.x <= b.x[1] && w.z >= b.z[0] && w.z <= b.z[1] && w.y > (b.yAbove ?? 0.05)) {
          w.y = b.floorY ?? -0.03; Vector3.TransformCoordinatesToRef(w, inv, v);
          out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z; moved++; touched = true; break;
        }
      }
    }
    if (touched) { m.setVerticesData(VertexBuffer.PositionKind, out, false); m.refreshBoundingInfo({ applySkeleton: false, applyMorph: false }); }
  }
  return moved;
}
