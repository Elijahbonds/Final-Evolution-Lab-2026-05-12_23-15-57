// THE SHARED AIM RETICLE, STOOD UP (HOTFIX 2026-09-24).
//
// The Reticle is a torus, and a torus is built lying flat (XZ). Under billboard ALL the mesh's local XY is the screen, so
// the ring's PLANE met the camera edge-on: penalty and the carnival Hot Shot aimed with a glowing cyan stick. Derby had
// baked RotationX(π/2) at its own call site (ANIM-SURGICAL) and left the shared class as a follow-up. The bake lives in
// the Reticle now, measured here the way a player sees it: in the camera's view space the ring must be wide and tall
// and thin in depth — and no caller may bake it a second time, which would lay it flat again.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NullEngine, PBRMaterial, Scene, UniversalCamera, Vector3, VertexBuffer } from '@babylonjs/core';

vi.mock('../visual/VenueKit', () => ({
  VenueKit: { paint: (scene: Scene, name: string) => new PBRMaterial(name, scene) },
}));
vi.mock('../core/CharacterLibrary', () => ({ CharacterLibrary: {} }));
vi.mock('../visual/meshyProps', () => ({ spawnMeshyProp: async () => null }));
vi.mock('../core/characterPipeline', () => ({ CharacterPipeline: {} }));
vi.mock('../anim/importSanitizer', () => ({ neverBindPose: () => undefined }));

import { Reticle } from './aimSwingCore';

let engine: NullEngine | null = null;
afterEach(() => { engine?.dispose(); engine = null; });

/** The ring's extent along the camera's right / up / depth axes, from its world vertices — what the screen shows. */
function viewExtent(camAt: Vector3, target: Vector3): { x: number; y: number; z: number } {
  engine = new NullEngine();
  const scene = new Scene(engine);
  const cam = new UniversalCamera('cam', camAt, scene);
  cam.setTarget(target);
  scene.activeCamera = cam;
  cam.computeWorldMatrix();
  const r = new Reticle(scene, target, { x: 3.3, y: 1.05 });
  const world = r.mesh.computeWorldMatrix(true);
  const view = cam.getViewMatrix(true);
  const pos = r.mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < pos.length; i += 3) {
    const v = Vector3.TransformCoordinates(Vector3.TransformCoordinates(new Vector3(pos[i], pos[i + 1], pos[i + 2]), world), view);
    lo.minimizeInPlace(v); hi.maximizeInPlace(v);
  }
  return { x: hi.x - lo.x, y: hi.y - lo.y, z: hi.z - lo.z };
}

describe('the shared aim Reticle', () => {
  it('shows the camera a RING, not a stick — penalty: behind the kicker, looking down the pitch at the goal', () => {
    const e = viewExtent(new Vector3(0, 1.8, -3), new Vector3(0, 1.2, 11));
    expect(e.x).toBeCloseTo(0.6, 2);          // diameter 0.55 + thickness 0.05
    expect(e.y).toBeCloseTo(0.6, 2);          // was ~0.05: the edge-on stick
    expect(e.z).toBeLessThan(0.06);           // the ring's own thickness, and no more
  });

  it('keeps facing the camera from off to one side (Hot Shot, derby behind the batter)', () => {
    const e = viewExtent(new Vector3(2.5, 3, -4), new Vector3(1.4, 1.2, 11));
    expect(e.y).toBeGreaterThan(0.55);
    expect(e.z).toBeLessThan(0.06);
  });

  it('no call site bakes the ring a second time — twice is flat, and edge-on again', () => {
    for (const file of ['precisionModes.ts', 'carnivalEvents.ts']) {
      const src = readFileSync(path.join(__dirname, file), 'utf8');
      expect(src, file).not.toMatch(/\.mesh as Mesh\)\.bakeTransformIntoVertices/);
      expect(src, file).not.toMatch(/(pci|reticle)\.mesh\.bakeTransformIntoVertices/);
    }
  });
});
