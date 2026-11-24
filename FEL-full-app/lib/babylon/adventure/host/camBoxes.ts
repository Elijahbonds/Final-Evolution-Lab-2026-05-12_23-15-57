/**
 * The solids a zone or story camera keeps out of, as world boxes (improve pass phase 9, lane/improve-world; host/camera.ts
 * clearViewEye). Babylon side: a mesh's own box, or — for a thin-instanced master (the Coast's palms and rocks, the story's trees)
 * — one box per instance from the geometry's own extents (the master's bounding box covers every instance, so it cannot be used).
 * Read only: nothing is moved or made pickable.
 */

import { Vector3, VertexBuffer, type AbstractMesh, type Mesh, type Scene, type TargetCamera } from '@babylonjs/core';
import { CAM_CHEST_Y, clearViewEye, type CamBox } from './camera';

const extents = new WeakMap<Mesh, { min: Vector3; max: Vector3 } | null>();
function localExtents(m: Mesh): { min: Vector3; max: Vector3 } | null {
  if (extents.has(m)) return extents.get(m)!;
  const pos = m.getVerticesData?.(VertexBuffer.PositionKind);
  let out: { min: Vector3; max: Vector3 } | null = null;
  if (pos && pos.length >= 3) {
    const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i] < min.x) min.x = pos[i]; if (pos[i] > max.x) max.x = pos[i];
      if (pos[i + 1] < min.y) min.y = pos[i + 1]; if (pos[i + 1] > max.y) max.y = pos[i + 1];
      if (pos[i + 2] < min.z) min.z = pos[i + 2]; if (pos[i + 2] > max.z) max.z = pos[i + 2];
    }
    out = { min, max };
  }
  extents.set(m, out);
  return out;
}

const CORNER = new Vector3(), OUT = new Vector3();
/** The world boxes of the enabled meshes whose names pass `test` (thin instances one box each, marked insideOnly: props). */
export function meshCamBoxes(scene: Scene, test: (name: string) => boolean, into: CamBox[] = []): CamBox[] {
  for (const am of scene.meshes as AbstractMesh[]) {
    if (!am.isEnabled() || !am.isVisible || !test(am.name)) continue;
    const m = am as Mesh;
    if ((m.thinInstanceCount ?? 0) > 0) {
      const ex = localExtents(m);
      if (!ex) continue;
      for (const w of m.thinInstanceGetWorldMatrices()) {
        const b: CamBox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, insideOnly: true };
        for (let k = 0; k < 8; k++) {
          CORNER.set(k & 1 ? ex.max.x : ex.min.x, k & 2 ? ex.max.y : ex.min.y, k & 4 ? ex.max.z : ex.min.z);
          Vector3.TransformCoordinatesToRef(CORNER, w, OUT);
          if (OUT.x < b.minX) b.minX = OUT.x; if (OUT.x > b.maxX) b.maxX = OUT.x;
          if (OUT.y < b.minY) b.minY = OUT.y; if (OUT.y > b.maxY) b.maxY = OUT.y;
          if (OUT.z < b.minZ) b.minZ = OUT.z; if (OUT.z > b.maxZ) b.maxZ = OUT.z;
        }
        into.push(b);
      }
      continue;
    }
    am.computeWorldMatrix(true);
    const bb = am.getBoundingInfo().boundingBox;
    into.push({ minX: bb.minimumWorld.x, maxX: bb.maximumWorld.x, minY: bb.minimumWorld.y, maxY: bb.maximumWorld.y, minZ: bb.minimumWorld.z, maxZ: bb.maximumWorld.z });
  }
  return into;
}

/** Boxes within `r` metres (on the ground plane) of (x, z): the per-frame list stays short. */
export function boxesNear(all: readonly CamBox[], x: number, z: number, r: number, into: CamBox[] = []): CamBox[] {
  into.length = 0;
  for (const b of all) {
    const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
    if (dx * dx + dz * dz <= r * r) into.push(b);
  }
  return into;
}

/** After the director's update: keep the eye out of `boxes` (clearViewEye), the aim unchanged. True when the eye was moved. */
export function keepEyeClear(camera: TargetCamera, feet: { x: number; y: number; z: number }, boxes: readonly CamBox[]): boolean {
  if (!boxes.length) return false;
  const p = camera.position;
  const fixed = clearViewEye({ x: feet.x, y: feet.y + CAM_CHEST_Y, z: feet.z }, { x: p.x, y: p.y, z: p.z }, boxes);
  if (!fixed) return false;
  const target = camera.getTarget().clone();
  camera.position.set(fixed.x, fixed.y, fixed.z);
  camera.setTarget(target);
  return true;
}
