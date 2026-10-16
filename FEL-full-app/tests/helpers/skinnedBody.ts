// A skinned body on a NullEngine stage, for the tests of what the scene does to a skeleton (SkinningGuard, lane/kvs-skin 2026-10-16).
//
// It is the real thing where it matters and nothing else: a real Babylon Skeleton whose six guarded bones are linked to TransformNodes (the way a
// GLB's are), a real mesh on that skeleton, and a real `scene.render()`, which is what selects the mesh as active and calls `Skeleton.prepare()`.
// So "drawn", "not drawn" and "the skeleton never prepared" are what the engine does, not what a test claims:
//   * drawn      the mesh is enabled, visible and inside the camera's frustum;
//   * undrawn    `hide()` (disabled: a seat nobody is in) or `placeOutOfFrame()` (a podium past the edge of a portrait phone);
//   * a stall    `scene.skeletonsEnabled = false` — the mesh is selected, the nodes animate, the skeleton is never prepared, so the bone matrices stay.
import { Bone, FreeCamera, Matrix, MeshBuilder, NullEngine, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Mesh } from '@babylonjs/core';

/** The bones SkinningGuard samples (its SAMPLE_BONES). */
export const GUARDED_BONES = ['Spine', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg', 'Head'] as const;

export interface SkinnedStage {
  scene: Scene;
  skeleton: Skeleton;
  mesh: Mesh;
  meshes: AbstractMesh[];
  nodes: TransformNode[];
  /** Pose the animated nodes: every guarded node's x rotation is `amplitude` x sin(frame / 8) (0 = still). */
  pose(frame: number, amplitude: number): void;
  /** Render `n` frames, posing the nodes with `amplitude` each one; `frame0` is the first frame number. Returns the next frame number. */
  run(n: number, amplitude: number, frame0?: number): number;
  /** Take the body out of the picture (disabled, as a seat nobody is in) / put it back. */
  hide(): void; show(): void;
  /** Stand the body far outside the camera's frustum / back in front of it. */
  placeOutOfFrame(): void; placeInFrame(): void;
  dispose(): void;
}

export function makeSkinnedStage(): SkinnedStage {
  const scene = new Scene(new NullEngine());
  const cam = new FreeCamera('cam', new Vector3(0, 1, -6), scene);
  cam.setTarget(new Vector3(0, 1, 0));
  const skeleton = new Skeleton('body_sk', 'body_sk', scene);
  const hips = new Bone('Hips', skeleton, null, Matrix.Translation(0, 1, 0));
  const nodes: TransformNode[] = [];
  GUARDED_BONES.forEach((name, i) => {
    const bone = new Bone(name, skeleton, hips, Matrix.Translation(0.2 * (i - 2), 0.5, 0));
    const node = new TransformNode(`${name}_node`, scene);
    node.position.set(0.2 * (i - 2), 0.5, 0);
    bone.linkTransformNode(node);
    nodes.push(node);
  });
  const mesh = MeshBuilder.CreateBox('body', { size: 1 }, scene);
  mesh.position.set(0, 1, 0);
  mesh.skeleton = skeleton;
  mesh.computeBonesUsingShaders = true;
  mesh.alwaysSelectAsActiveMesh = false;
  const stage: SkinnedStage = {
    scene, skeleton, mesh, meshes: [mesh], nodes,
    pose(frame, amplitude) { for (const n of nodes) n.rotation.x = amplitude * Math.sin(frame / 8); },
    run(n, amplitude, frame0 = 0) {
      let f = frame0;
      for (let i = 0; i < n; i++, f++) { stage.pose(f, amplitude); scene.render(); }
      return f;
    },
    hide() { mesh.setEnabled(false); }, show() { mesh.setEnabled(true); },
    placeOutOfFrame() { mesh.position.set(900, 1, 0); mesh.computeWorldMatrix(true); mesh.refreshBoundingInfo(); },
    placeInFrame() { mesh.position.set(0, 1, 0); mesh.computeWorldMatrix(true); mesh.refreshBoundingInfo(); },
    dispose() { scene.dispose(); },
  };
  return stage;
}
