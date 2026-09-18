// ProceduralAthlete — the assetless spawn path. Assembles the rig + cel-shaded
// primitive body, authors clips onto a fresh CharacterAnimator, and returns the
// SAME SpawnedCharacter shape every mode already consumes. No GLB, no vertex
// skinning, no bind-pose — so the Meshy skinning breakage cannot recur.

import { Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { CharacterAnimator } from '../anim/CharacterAnimator';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { buildRig } from './proceduralRig';
import { buildBody } from './proceduralMesh';
import { registerProceduralClips } from './proceduralClips';
import type { SpawnedCharacter, SpawnOpts } from '../core/CharacterLibrary';

let procCounter = 0;

export function spawnProceduralAthlete(scene: Scene, opts: SpawnOpts = {}): SpawnedCharacter {
  const id = `p${++procCounter}`;
  const rig = buildRig(scene, id);
  const meshes = buildBody(scene, rig, {
    tint: opts.tint, accent: opts.accent, skinTone: opts.skinTone,
    hairColor: opts.hairColor, shoeColor: opts.shoeColor,
  });

  // Place / orient / scale on the root (identical semantics to the GLB path).
  rig.root.position = opts.position ?? Vector3.Zero();
  rig.root.rotation = new Vector3(0, opts.yawRad ?? 0, 0);
  rig.root.rotationQuaternion = null;                 // let Euler yaw drive it
  rig.root.scaling.setAll(opts.scale ?? 1);

  // Animator with our own authored clips (base names the alias table maps to).
  const animator = new CharacterAnimator(scene, []);
  registerProceduralClips(animator, scene, rig.skeleton);

  const baseLoop = opts.startClip ?? 'idle_stand';
  neverBindPose(animator, baseLoop);
  installSafePlay(animator, opts.modeId ?? 'procedural');

  animator.play(baseLoop, { loop: true });

  const charId = `proc_${id}`;
  return {
    id: charId,
    root: rig.root,
    meshes,
    skeleton: rig.skeleton,
    animator,
    dispose() {
      animator.dispose();
      for (const m of meshes) m.dispose();
      rig.skeleton.dispose();
      rig.root.dispose(false, true);                  // disposes child nodes too
    },
  };
}
