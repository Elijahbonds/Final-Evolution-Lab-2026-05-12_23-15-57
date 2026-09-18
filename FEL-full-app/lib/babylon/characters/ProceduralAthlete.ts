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
import { buildSkinnedBody } from './proceduralSkin';
import { registerProceduralClips } from './proceduralClips';
import { registerAuthoredClips } from '../anim/authored';
import type { SpawnedCharacter, SpawnOpts } from '../core/CharacterLibrary';

let procCounter = 0;

export function spawnProceduralAthlete(scene: Scene, opts: SpawnOpts = {}): SpawnedCharacter {
  const id = `p${++procCounter}`;
  const rig = buildRig(scene, id);
  // SKINNED body by default. buildBody parents ~30 rigid primitives to bone
  // nodes, which is not skinning: the pieces pivot about a shared point and
  // visibly separate at the joints under a fast clip — a dunk caught mid-air
  // shows the character coming apart. buildSkinnedBody emits a handful of
  // genuinely skinned meshes bound to the SAME rig, so every authored clip
  // keeps working untouched and the surface deforms through a joint instead of
  // tearing. Set NEXT_PUBLIC_SKINNED_BODY=false to fall back.
  const skinned = process.env.NEXT_PUBLIC_SKINNED_BODY !== 'false';
  const bodyOpts = {
    tint: opts.tint, accent: opts.accent, skinTone: opts.skinTone,
    hairColor: opts.hairColor, shoeColor: opts.shoeColor,
  };
  const meshes = skinned
    ? buildSkinnedBody(scene, rig, bodyOpts)
    : buildBody(scene, rig, bodyOpts);

  // Place / orient / scale on the root (identical semantics to the GLB path).
  rig.root.position = opts.position ?? Vector3.Zero();
  rig.root.rotation = new Vector3(0, opts.yawRad ?? 0, 0);
  rig.root.rotationQuaternion = null;                 // let Euler yaw drive it
  rig.root.scaling.setAll(opts.scale ?? 1);

  // Animator with our own authored clips (base names the alias table maps to).
  const animator = new CharacterAnimator(scene, []);
  registerProceduralClips(animator, scene, rig.skeleton);
  // ...and the AUTHORED suite. This was missing, and it is the same omission
  // the mirrored-clip note below describes — made twice, on the same path.
  //
  // The authored builders produce every purpose-built clip in the game: the
  // whole dunk suite (charge gather, launch, the mocap dunk, eastbay, score
  // hang, land crouch, windmill, tomahawk, blown finish, celebrate big), the
  // football moves, and the karate reactions. Only CharacterLibrary's GLB path
  // ever built them. PROCEDURAL_CHARACTERS defaults TRUE — the Meshy GLB is
  // visually broken — so the GLB path is the one nobody takes, and every real
  // player got a character that could not perform a single authored clip.
  //
  // It failed silently, which is why it survived: installSafePlay sees an
  // unregistered name, logs, and falls back to a safe pose. The dunk "played"
  // — the mode advanced, the score was judged, the crowd reacted — while the
  // character just stood there. Registered AFTER the procedural set so the
  // authored version wins any name collision, which is the same precedence the
  // GLB path already used (authored registered over the imported groups).
  registerAuthoredClips(animator, scene, rig.skeleton);
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
