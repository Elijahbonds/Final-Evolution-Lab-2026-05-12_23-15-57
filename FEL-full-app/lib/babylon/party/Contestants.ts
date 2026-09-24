// CONTESTANTS — bodies at the podiums in the party modes (2026-09-13).
//
// Phase 0 booted every mode and found three with ZERO skeletons. Aero Aces was one (an aircraft flying
// itself); these are the other two. Who Scene It and Brain Brawl are both TWO-PLAYER BUZZ-IN modes on one
// screen, and both rendered a card, a wheel and nobody at all.
//
// That is not only the owner's standing rule ("every body in a scene is a humanoid that moves well") going
// unmet — it breaks the benchmark these modes were given in Phase 0. Their quality floor is Wii Sports
// Resort with Mario Party readability, and the readability test is "a spectator understands what is
// happening in three seconds". With no bodies there is no way to see WHO buzzed: the card just locks. The
// buzz is the whole mechanic of a buzz-in game and it was invisible.
//
// ONE MODULE, BOTH MODES. Part 2's central rule is consume the shared layer rather than rebuilding it, and
// these two want exactly the same thing: one or two contestants at podiums, facing the stage, who react.
//
// THE CLIP VOCABULARY IS THE ONE THAT ALREADY EXISTS — no new authored animation:
//   buzz    -> SPORT_CLIP.buzzerSlap, the `uppercut`: a hand that shoots straight up, which is
//              what slapping a buzzer looks like. This is a genuine fit rather than a stand-in.
//   correct -> dunk_celebrate_big
//   wrong   -> karate_hit_react, the flinch
//   idle    -> idle_stand
//
// Podium geometry is the caller's, because a quiz stage and a wheel stage are not the same room.

import { Vector3 } from '@babylonjs/core';
import type { Scene, TransformNode } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { SPORT_CLIP } from '../anim/clipRegistry';
import { neverBindPose } from '../anim/importSanitizer';

/** Where a contestant stands and which way they face. */
export interface PodiumSpot {
  at: Vector3;
  /** Radians. The contestants face the STAGE, not each other — a quiz is played toward the board. */
  yaw: number;
  /** Shirt tint, so P1 and P2 are told apart at a glance. */
  tint?: string;
}

/**
 * Two podiums either side of a stage that sits at `stageZ`, facing it.
 *
 * A solo run uses only the first, and it is CENTRED rather than left at P1's slot — a lone contestant
 * standing off to one side of an empty second podium reads as a missing player.
 */
export function podiums(count: number, opts: { spread?: number; z?: number; stageZ?: number } = {}): PodiumSpot[] {
  const spread = opts.spread ?? 2.4;
  const z = opts.z ?? 4.2;
  const stageZ = opts.stageZ ?? -2;
  const yawTo = (x: number): number => Math.atan2(0 - x, stageZ - z);
  if (count <= 1) return [{ at: new Vector3(0, 0, z), yaw: yawTo(0), tint: undefined }];
  return [
    { at: new Vector3(-spread, 0, z), yaw: yawTo(-spread), tint: undefined },
    { at: new Vector3(spread, 0, z), yaw: yawTo(spread), tint: '#8b1e2d' },
  ];
}

export class Contestants {
  private bodies: SpawnedCharacter[] = [];
  private disposed = false;

  private constructor(bodies: SpawnedCharacter[]) { this.bodies = bodies; }

  /**
   * Spawn the podium line-up.
   *
   * Resolves to a Contestants with however many bodies actually loaded — a failed spawn leaves the mode
   * playable with fewer bodies rather than throwing out of `load()` and taking the whole mode down. A quiz
   * that runs with nobody at the podiums is the state it was already in; a quiz that will not boot is worse.
   */
  static async spawn(scene: Scene, spots: PodiumSpot[], modeId: string): Promise<Contestants> {
    const bodies: SpawnedCharacter[] = [];
    for (const [i, spot] of spots.entries()) {
      try {
        const c = await CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, {
          position: spot.at.clone(), yawRad: spot.yaw, startClip: SPORT_CLIP.idle,
          tint: spot.tint, modeId: `${modeId}-p${i + 1}`,
        });
        neverBindPose(c.animator, SPORT_CLIP.idle);
        bodies.push(c);
      } catch (e) {
        console.warn(`[FEL-PARTY] contestant ${i + 1} did not spawn:`, (e as Error).message);
      }
    }
    return new Contestants(bodies);
  }

  get count(): number { return this.bodies.length; }

  /** The body for player index `i`, or null when that seat is empty. */
  at(i: number): SpawnedCharacter | null { return this.bodies[i] ?? null; }

  /** Root nodes, for a camera that wants to frame the line-up. */
  roots(): TransformNode[] { return this.bodies.map((b) => b.root); }

  /**
   * Player `i` hit the buzzer.
   *
   * A one-shot over the idle, so a second buzz retriggers cleanly. The whole point of this module: until now
   * a buzz-in game gave a spectator no way to see who buzzed.
   */
  buzz(i: number): void {
    this.play(i, SPORT_CLIP.buzzerSlap);
  }

  /** The verdict on player `i`'s answer. */
  verdict(i: number, correct: boolean): void {
    this.play(i, correct ? SPORT_CLIP.dunkCelebrateBig : SPORT_CLIP.karateHitReact);
  }

  /** Everyone back to idle — between rounds, or on a reset. */
  reset(): void {
    this.seq = this.seq.map((s) => s + 1);
    for (const b of this.bodies) b.animator.play(SPORT_CLIP.idle, { loop: true, fadeSec: 0.2 });
  }

  /** One counter per seat: every `perform` takes a new number, and a hand-off only runs if its number is still current. */
  private seq: number[] = [];

  /**
   * Player `i` performs `clip` (BRAINBRAWL-MAJOR, 2026-09-24): a loop they settle into (`loop: true`), or a one-shot that
   * hands over to `then` — a loop — when it ends, or to the idle without one.
   *
   * The CALLER names the clip. A mode that owns its own podium vocabulary (Brain Brawl's party suite) plays it through
   * here without this shared module naming it — which would put it in every importing mode's clip closure.
   *
   * The hand-off is GUARDED. Babylon's AnimationGroup.stop() notifies the group's END observable, so a one-shot that is
   * cut off by the next clip still fires its end callback when the cross-fade retires it — and neverBindPose's default
   * callback is "back to the idle". Unguarded, a buzz interrupted by a verdict drops the verdict to the idle 0.08 s later.
   */
  perform(i: number, clip: string, opts: { loop?: boolean; then?: string; fadeSec?: number } = {}): void {
    if (this.disposed) return;
    const b = this.bodies[i];
    if (!b) return;
    const token = (this.seq[i] = (this.seq[i] ?? 0) + 1);
    const fadeSec = opts.fadeSec ?? 0.12;
    if (opts.loop) { b.animator.play(clip, { loop: true, fadeSec }); return; }
    const next = opts.then ?? SPORT_CLIP.idle;
    b.animator.play(clip, {
      loop: false, fadeSec,
      onEnd: () => { if (!this.disposed && this.seq[i] === token) b.animator.play(next, { loop: true, fadeSec: 0.2 }); },
    });
  }

  private play(i: number, clip: string): void {
    if (this.disposed) return;
    const b = this.bodies[i];
    if (!b) return;
    // one owner per rig: the one-shot runs and neverBindPose returns it to the idle loop, so nothing is
    // left holding a pose after the beat
    b.animator.play(clip, { loop: false, fadeSec: 0.08 });
  }

  dispose(): void {
    this.disposed = true;
    for (const b of this.bodies) b.dispose();
    this.bodies = [];
  }
}
