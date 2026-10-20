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
import { buildPoseClip, type PoseKey } from '../babylon/anim/poseClip';
import { idleOf, type ReactionKind } from '../babylon/visual/crowd/crowdReact';
import type { CrowdClipName } from '../babylon/visual/crowd/crowdVat';
import { motionPolicy } from '../a11y/reducedMotion';
import { CAST_CLIP_LOOPS, CAST_CLIP_SECONDS, CAST_FAN_HANDS, CastFanDirector, castFanClipKeys, castFanClipName, type CrowdReactions } from './castCheer';
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
// EMPTY seat of the venue's stands (cast.ts crowdCastSeats) and posed by the crowd's own clip vocabulary (visual/crowd/crowdClips,
// the 22-bone FEL rig's bone names), with its hands placed (castCheer.ts) — so it reads as one of the fans. It is spawned as an
// OPPONENT-role body on an explicit kit URL: it never counts as the scene's player (CharacterLibrary.decideRole would otherwise hand
// the mode's own hero the opponent role) and, being no hero URL and untinted, never takes a roster body. RIG-ADJACENT; GATE 0 runs
// in the load. The phone keeps its cards-only crowd: no cast fan on the mobile tier (each is a full skinned body; the ceiling is 16).
// studio-5 (§13.1): it CHEERS WITH THE CROWD. `hears` is the crowd layer's reactions; each one runs through castCheer.ts's director
// (the crowd's plans, clips, seconds, stagger and priority; every cast fan joins) on this layer's own clock, and a clip change
// plays that crowd clip on the body. A clip is built on the body the first time it is needed and kept.

export { CAST_FAN_HANDS };
/** The fan's resting clip in a posture: the crowd's own idle keys plus the hands (castCheer.castFanClipKeys). */
export function castFanKeys(posture: 'seated' | 'standing'): PoseKey[] {
  return castFanClipKeys(idleOf(posture));
}

export interface CrowdCastLayer {
  /** Resolves to the spawned fans (those that loaded before dispose). */
  readonly ready: Promise<SpawnedCharacter[]>;
  /** Where each fan sits (empty when nothing is cast, there is no stand, or the tier is mobile). */
  readonly seats: readonly CastSeat[];
  /** What each fan plays, seat by seat (null when nothing is seated). */
  readonly director: CastFanDirector | null;
  /** The crowd reacted: the cast fans join (what `hears` calls; tests and the dev rig may call it too). */
  react(kind: ReactionKind, strength?: number): void;
  dispose(): void;
}

export interface CrowdCastOpts {
  tier?: string;
  frame?: CastFrame;
  /** The crowd's reactions (runtime.ts mountCrowdLayer's `crowd`): the fans cheer when it does. */
  hears?: CrowdReactions | null;
  /** Read at each reaction, as the crowd reads it (motionPolicy().reduced). */
  reduced?: () => boolean;
}

export function mountCrowdCastLayer(scene: Scene, members: readonly CastMember[] | null | undefined, crowd: ExportCrowd | null | undefined, o: CrowdCastOpts = {}): CrowdCastLayer {
  const tier = o.tier ?? (scene.metadata as { felTier?: string } | null)?.felTier;
  const seats = members?.length && tier !== 'mobile' ? crowdCastSeats(crowd, members.length) : [];
  if (!seats.length) return { ready: Promise.resolve([]), seats, director: null, react() {}, dispose() {} };
  let gone = false;
  const bodies: SpawnedCharacter[] = [];
  const bySeat: (SpawnedCharacter | null)[] = seats.map(() => null);
  const built: Map<CrowdClipName, boolean>[] = seats.map(() => new Map());
  const director = new CastFanDirector(seats.map((s) => ({ home: s.posture, along: s.along ?? 0.5 })));
  const reduced = o.reduced ?? (() => motionPolicy().reduced);
  let clock = 0;
  /** Build `clip` on seat i's body once; false when it cannot be built (the body then keeps what it plays). */
  const ensure = (i: number, s: SpawnedCharacter, clip: CrowdClipName): boolean => {
    const have = built[i].get(clip);
    if (have !== undefined) return have;
    const g = buildPoseClip(scene, s.skeleton, castFanClipName(clip), CAST_CLIP_SECONDS[clip], castFanClipKeys(clip), { smooth: true });
    if (g) s.animator.register(g);
    built[i].set(clip, !!g);
    return !!g;
  };
  const show = (i: number, clip: CrowdClipName, fadeSec: number): void => {
    const s = bySeat[i];
    if (!s || !ensure(i, s, clip)) return;
    s.animator.play(castFanClipName(clip), { loop: director.busy(i) ? CAST_CLIP_LOOPS[clip] : true, fadeSec });
  };
  const one = (m: CastMember, seat: CastSeat, i: number): Promise<SpawnedCharacter | null> => {
    const id = castIdentity(m, { frame: o.frame ?? 'standard' });
    return CharacterLibrary.spawn(scene, urlForHeroBody(id.body), {
      identity: false, role: 'opponent', position: new Vector3(seat.pos[0], seat.pos[1], seat.pos[2]), yawRad: seat.yaw, startClip: SPORT_CLIP.idle,
    }).then((s) => {
      if (gone) { s.dispose(); return null; }
      applyIdentity(s, id);
      s.root.metadata = { ...(s.root.metadata ?? {}), studioCast: 'crowd' };
      bodies.push(s);
      bySeat[i] = s;
      show(i, director.clipOf(i), 0);   // its idle — or the reaction already under way when it landed
      return s;
    }).catch((e) => { console.warn('[NEXUS-STUDIO] crowd cast could not spawn:', e instanceof Error ? e.message : e); return null; });
  };
  const tick = (): void => {
    clock += Math.min(0.1, Math.max(0, scene.getEngine().getDeltaTime() / 1000));
    for (const c of director.tick(clock)) show(c.fan, c.clip, 0.12);
  };
  const obs = scene.onBeforeRenderObservable.add(tick);
  const react = (kind: ReactionKind, strength = 1): void => { if (!gone) director.react(kind, strength, clock, reduced()); };
  const unhear = o.hears?.onReact(react) ?? (() => {});
  const ready = Promise.all(seats.map((seat, i) => one(members![i], seat, i))).then((l) => l.filter((x): x is SpawnedCharacter => !!x));
  return {
    ready, seats, director, react,
    dispose() { gone = true; unhear(); scene.onBeforeRenderObservable.remove(obs); for (const b of bodies) b.dispose(); bodies.length = 0; bySeat.fill(null); },
  };
}
