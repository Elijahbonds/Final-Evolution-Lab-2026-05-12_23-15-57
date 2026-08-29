// ProceduralAthlete — the assetless spawn path. Assembles the rig + cel-shaded
// primitive body, authors clips onto a fresh CharacterAnimator, and returns the
// SAME SpawnedCharacter shape every mode already consumes. No GLB, no vertex
// skinning, no bind-pose — so the Meshy skinning breakage cannot recur.

import { Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { CharacterAnimator } from '../anim/CharacterAnimator';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { registerMirroredClips, DANCE_MIRROR_BASES } from '../anim/mirrored-clips';
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
  // The GLB spawn path always paired this with registerMirroredClips so
  // dance's mirrored steps ('<base>.M', e.g. roundhouse.M) have a real
  // reflected clip to play. Procedural athletes never got the same call —
  // every mirrored dance step silently fell back to the bind-pose-safe
  // default ('guard') instead of actually mirroring, and since
  // PROCEDURAL_CHARACTERS is the default spawn path, that was every player.
  registerMirroredClips(animator, scene, rig.skeleton, DANCE_MIRROR_BASES);

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
