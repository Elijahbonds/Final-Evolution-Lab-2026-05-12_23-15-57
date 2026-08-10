// RigValidationScene — PHASE 0 HARNESS. Route it at /dev/rig.
//
// Its only job: answer "does this rig survive a dunk?" before any avatar
// customization work is worth doing. Load a candidate GLB, play an
// extreme-range clip, scrub it, and inspect the four joints where Meshy
// auto-rigged weights fail most often under FEL's hero animation.
//
// Deliberately standalone — it does NOT depend on the game's ModeHarness,
// so a broken rig can be diagnosed without booting a mode.

import {
  ArcRotateCamera, Color3, DirectionalLight, Engine, HemisphericLight,
  Scene, SkeletonViewer, Vector3,
} from '@babylonjs/core';
import type { AbstractMesh, AnimationGroup, Skeleton } from '@babylonjs/core';
import { AssetRegistry } from '../avatar/AssetRegistry';
import {
  auditRig, sampleJoints, compareJointSamples, inspectJoint, printReport,
  INSPECT_TARGETS, type InspectTarget,
} from '../avatar/RigValidator';
import type { RigReport } from '../types/avatar';

export interface RigValidationHandle {
  scene: Scene;
  report: RigReport | null;
  play(): void;
  pause(): void;
  scrub(t01: number): void;
  step(frames: number): void;
  inspect(joint: InspectTarget | 'full'): void;
  toggleSkeleton(): void;
  toggleWireframe(): void;
  /** Sample limb lengths at the current frame against the rest sample. */
  measure(): void;
  dispose(): void;
}

export async function createRigValidationScene(
  canvas: HTMLCanvasElement,
  avatarUrl: string,
  animationUrl?: string,
): Promise<RigValidationHandle> {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = Color3.FromHexString('#141821').toColor4(1);

  const camera = new ArcRotateCamera('rigCam', -Math.PI / 2, Math.PI / 2.4, 3.4, new Vector3(0, 1, 0), scene);
  camera.attachControl(canvas, true);
  camera.wheelDeltaPercentage = 0.02;
  camera.minZ = 0.05;

  // three-point rig — no SSAO (too expensive for the browser target, and it
  // would tell us nothing about deformation anyway)
  const key = new DirectionalLight('key', new Vector3(-0.5, -0.8, 0.4), scene);
  key.intensity = 1.5;
  const fill = new HemisphericLight('fill', new Vector3(0, 1, 0), scene);
  fill.intensity = 0.75;
  const rim = new DirectionalLight('rim', new Vector3(0.6, -0.2, -0.7), scene);
  rim.intensity = 0.9;
  rim.diffuse = Color3.FromHexString('#7fd4ff');

  const registry = new AssetRegistry();
  const inst = await registry.instantiate(avatarUrl, scene);
  const meshes: AbstractMesh[] = inst.meshes;
  const skeleton: Skeleton | null = inst.skeleton;

  let report: RigReport | null = null;
  if (skeleton) {
    report = auditRig(skeleton, meshes);
    printReport(report);
  } else {
    console.error('[FEL-RIG] no skeleton in the loaded asset — this is not a rigged avatar.');
  }

  // rest-pose measurement, taken before any animation plays
  const restSample = skeleton ? sampleJoints(skeleton) : new Map<string, number>();

  // animation: either an external animation-only GLB, or clips already in
  // the avatar file
  let group: AnimationGroup | null = null;
  if (animationUrl && skeleton) {
    const animInst = await registry.container(animationUrl, scene);
    group = animInst.animationGroups[0] ?? null;
    if (group) {
      // retarget by bone name onto our skeleton
      for (const ta of group.targetedAnimations) {
        const name = (ta.target as { name?: string }).name?.replace(/_c\d+$/, '') ?? '';
        const node = skeleton.bones.find((b) => b.name === name)?.getTransformNode();
        if (node) (ta as unknown as { target: unknown }).target = node;
      }
    }
  } else {
    group = scene.animationGroups[0] ?? null;
  }
  if (!group) {
    console.warn('[FEL-RIG] no animation clip available — conformance audit only. '
      + 'Pass an extreme-range clip (overhead extension + deep hip flexion) to test deformation.');
  }
  group?.stop();

  let viewer: SkeletonViewer | null = null;
  let wireframe = false;

  engine.runRenderLoop(() => scene.render());
  const onResize = (): void => engine.resize();
  window.addEventListener('resize', onResize);

  return {
    scene,
    report,
    play: () => group?.play(true),
    pause: () => group?.pause(),
    scrub: (t01: number) => {
      if (!group) return;
      group.play(true);
      group.goToFrame(group.from + (group.to - group.from) * Math.max(0, Math.min(1, t01)));
      group.pause();
    },
    step: (frames: number) => {
      if (!group) return;
      const current = group.animatables[0]?.masterFrame ?? group.from;
      group.goToFrame(Math.max(group.from, Math.min(group.to, current + frames)));
      group.pause();
    },
    inspect: (joint) => {
      if (joint === 'full') {
        camera.setTarget(new Vector3(0, 1, 0));
        camera.radius = 3.4;
        return;
      }
      if (skeleton && !inspectJoint(camera, skeleton, joint)) {
        console.warn(`[FEL-RIG] joint "${joint}" not on this rig`);
      }
    },
    toggleSkeleton: () => {
      if (viewer) { viewer.dispose(); viewer = null; return; }
      if (!skeleton || !meshes[0]) return;
      viewer = new SkeletonViewer(skeleton, meshes[0], scene, false, 3, {
        displayMode: SkeletonViewer.DISPLAY_SPHERE_AND_SPURS,
      });
      viewer.isEnabled = true;
    },
    toggleWireframe: () => {
      wireframe = !wireframe;
      for (const m of meshes) if (m.material) m.material.wireframe = wireframe;
    },
    measure: () => {
      if (!skeleton) return;
      const now = sampleJoints(skeleton);
      const rows = compareJointSamples(restSample, now);
      printReport(report ?? {
        boneCount: skeleton.bones.length, missingRequired: [], hasPrefixedNames: false,
        bindPose: 'unknown', skinnedMeshCount: meshes.length, triangleCount: 0,
        conforms: true, notes: [],
      }, rows);
    },
    dispose: () => {
      window.removeEventListener('resize', onResize);
      viewer?.dispose();
      registry.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

// The four inspection targets, exported so a UI can build its buttons.
export { INSPECT_TARGETS };
