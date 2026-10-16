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
import { castIdentity, crowdCastSeats, type CastFrame, type CastMember, type CastSeat } from './cast';
import { crowdClipKeys } from '../babylon/visual/crowd/crowdClips';
import { buildPoseClip, type PoseKey } from '../babylon/anim/poseClip';
import type { ExportCrowd } from './exportVenue';

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

// ── the crowd (studio-4b): project characters seated among the fans, visual only ─────────────────────────────────────
// Each cast fan is the real kit body in the character's look (the same spawn + identity as the player's preview), seated in an
// EMPTY seat of the venue's stands (cast.ts crowdCastSeats) and posed by the crowd's own clip vocabulary — sit_idle / stand_idle
// (visual/crowd/crowdClips, the 22-bone FEL rig's bone names), with its hands placed (castFanKeys) — so it reads as one of the fans. It is spawned as an OPPONENT-role
// body on an explicit kit URL: it never counts as the scene's player (CharacterLibrary.decideRole would otherwise hand the mode's
// own hero the opponent role) and, being no hero URL and untinted, never takes a roster body. RIG-ADJACENT; GATE 0 runs in the load.
// The phone keeps its cards-only crowd: no cast fan on the mobile tier (each is a full skinned body; the ceiling is 16).

/**
 * The fan's clip: the crowd's own keys (legs, hips, spine, head — crowdClips.ts) PLUS the arms. The crowd bodies never move their
 * arms (their skin cannot take it); a cast fan is the kit body, whose arms can, and left unkeyed they hang in the bind pose's T
 * (seen on the rig 2026-10-16). So each key also places the hands from the posed shoulder (poseClip handsRel, REF_ARM_LEN
 * proportions): seated, resting forward on the thighs; standing, down at the sides.
 */
export const CAST_FAN_HANDS: Record<'seated' | 'standing', NonNullable<PoseKey['handsRel']>> = {
  seated: { Left: [-0.07, -0.36, 0.30], Right: [0.07, -0.36, 0.30] },
  standing: { Left: [-0.10, -0.50, 0.06], Right: [0.10, -0.50, 0.06] },
};
export function castFanKeys(posture: 'seated' | 'standing'): PoseKey[] {
  return crowdClipKeys(posture === 'seated' ? 'sit_idle' : 'stand_idle').map((k) => ({ ...k, handsRel: CAST_FAN_HANDS[posture] }));
}

export interface CrowdCastLayer {
  /** Resolves to the spawned fans (those that loaded before dispose). */
  readonly ready: Promise<SpawnedCharacter[]>;
  /** Where each fan sits (empty when nothing is cast, there is no stand, or the tier is mobile). */
  readonly seats: readonly CastSeat[];
  dispose(): void;
}

export function mountCrowdCastLayer(scene: Scene, members: readonly CastMember[] | null | undefined, crowd: ExportCrowd | null | undefined, o: { tier?: string; frame?: CastFrame } = {}): CrowdCastLayer {
  const tier = o.tier ?? (scene.metadata as { felTier?: string } | null)?.felTier;
  const seats = members?.length && tier !== 'mobile' ? crowdCastSeats(crowd, members.length) : [];
  if (!seats.length) return { ready: Promise.resolve([]), seats, dispose() {} };
  let gone = false;
  const bodies: SpawnedCharacter[] = [];
  const one = (m: CastMember, seat: CastSeat): Promise<SpawnedCharacter | null> => {
    const id = castIdentity(m, { frame: o.frame ?? 'standard' });
    return CharacterLibrary.spawn(scene, urlForHeroBody(id.body), {
      identity: false, role: 'opponent', position: new Vector3(seat.pos[0], seat.pos[1], seat.pos[2]), yawRad: seat.yaw, startClip: SPORT_CLIP.idle,
    }).then((s) => {
      if (gone) { s.dispose(); return null; }
      applyIdentity(s, id);
      const clip = buildPoseClip(scene, s.skeleton, `studio_fan_${seat.posture}`, 3, castFanKeys(seat.posture), { smooth: true });
      if (clip) { s.animator.register(clip); s.animator.play(clip.name, { loop: true, fadeSec: 0 }); }
      s.root.metadata = { ...(s.root.metadata ?? {}), studioCast: 'crowd' };
      bodies.push(s);
      return s;
    }).catch((e) => { console.warn('[NEXUS-STUDIO] crowd cast could not spawn:', e instanceof Error ? e.message : e); return null; });
  };
  const ready = Promise.all(seats.map((seat, i) => one(members![i], seat))).then((l) => l.filter((x): x is SpawnedCharacter => !!x));
  return { ready, seats, dispose() { gone = true; for (const b of bodies) b.dispose(); bodies.length = 0; } };
}
