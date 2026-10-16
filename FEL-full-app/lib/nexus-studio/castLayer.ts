// The cast in the editor's viewport (track 3): the venue's cast character standing on the player's spot, on the REAL rig —
// the body file and the dress the mode's own spawn would give it. In the mode, CharacterLibrary.spawn(DEFAULT_HERO_URL)
// resolves the seated identity (runtime.ts mountStudioFor primes castIdentity), loads urlForHeroBody(identity.body) and
// applies the identity; here the same three steps run explicitly, because the editor must not seat a session identity.
// RIG-ADJACENT: it spawns and poses a body. GATE 0 (rigNormalize.gateContainerRig) runs inside CharacterLibrary's load.

import { Vector3, type Scene } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../babylon/core/CharacterLibrary';
import { applyIdentity } from '../babylon/core/playerIdentity';
import { urlForHeroBody } from '../babylon/core/heroBody';
import { neverBindPose } from '../babylon/anim/importSanitizer';
import { SPORT_CLIP } from '../babylon/anim/clipRegistry';
import { castIdentity, type CastFrame, type CastMember } from './cast';

export interface CastLayer {
  /** Resolves to the spawned body (null: nothing cast, the load failed, or the layer was disposed first). */
  readonly ready: Promise<SpawnedCharacter | null>;
  dispose(): void;
}

/** `frame`: what the mode would give it (targets.ts castFrameFor) — the preview shows the height and build the mode will draw. */
export function mountCastLayer(scene: Scene, member: CastMember | null | undefined, at: readonly number[], yaw: number, frame: CastFrame = 'standard'): CastLayer {
  if (!member) return { ready: Promise.resolve(null), dispose() {} };
  let gone = false;
  let body: SpawnedCharacter | null = null;
  const id = castIdentity(member, { frame });
  const ready = CharacterLibrary.spawn(scene, urlForHeroBody(id.body), {
    identity: false, role: 'player', position: new Vector3(at[0], at[1], at[2]), yawRad: yaw, startClip: SPORT_CLIP.idle,
  }).then((s) => {
    if (gone) { s.dispose(); return null; }
    applyIdentity(s, id);
    neverBindPose(s.animator, SPORT_CLIP.idle);
    s.root.metadata = { ...(s.root.metadata ?? {}), studioCast: 'player' };
    body = s;
    return s;
  }).catch((e) => { console.warn('[NEXUS-STUDIO] cast preview could not spawn:', e instanceof Error ? e.message : e); return null; });
  return { ready, dispose() { gone = true; body?.dispose(); body = null; } };
}
