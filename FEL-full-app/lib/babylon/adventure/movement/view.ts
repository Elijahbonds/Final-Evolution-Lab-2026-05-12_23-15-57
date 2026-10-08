/**
 * The movement view binder (lane A1; Babylon). A4 mounts one per visible body: it plays the clip movement/look.ts
 * chooses through the body's CharacterAnimator (read-only use of its public play / setSpeed), and tilts a POSE NODE —
 * a TransformNode A4 places between the body's root (which A4 positions and yaws from the actor) and its mesh — for
 * the spin ball, the rail lean and the flight bank. It allocates nothing per frame.
 *
 *   const view = bindMovementView({ animator, poseNode, actor: () => world.actors.get(id), telemetry: () => movement.inspect(id), clock: () => host.tSec });
 *   // per rendered frame:  view.sync(dtSec)
 */

import type { TransformNode } from '@babylonjs/core';
import type { CharacterAnimator } from '@/lib/babylon/anim/CharacterAnimator';
import type { AdventureActor } from '../contracts';
import type { MovementTelemetry } from './index';
import { moveClip, movementClipFor, poseTilt, poseTiltFor } from './look';

export interface MovementViewOpts {
  animator: Pick<CharacterAnimator, 'play' | 'setSpeed'>;
  /** A node under the body's root that may be tilted (never the root itself: A4 owns its yaw). Optional. */
  poseNode?: TransformNode | null;
  actor: () => AdventureActor | null | undefined;
  telemetry: () => Readonly<MovementTelemetry> | null | undefined;
  /** Sim time, seconds (the host's clock). */
  clock: () => number;
}

export interface MovementView { sync(dtSec: number): void; dispose(): void; readonly clip: string | null }

/** How quickly the pose node eases toward its tilt (1/s). [TUNE] */
const TILT_EASE = 10;

export function bindMovementView(o: MovementViewOpts): MovementView {
  const choice = moveClip();
  const tilt = poseTilt();
  let current: string | null = null;
  let ratio = 1;
  let spin = 0;
  return {
    get clip() { return current; },
    sync(dtSec: number): void {
      const a = o.actor(), t = o.telemetry();
      if (!a || !t) return;
      movementClipFor(a, t as MovementTelemetry, o.clock(), choice);
      if (choice.clip !== current) {
        o.animator.play(choice.clip, { loop: choice.loop, fadeSec: choice.fadeSec, speedRatio: choice.speedRatio });
        current = choice.clip; ratio = choice.speedRatio;
      } else if (Math.abs(choice.speedRatio - ratio) > 0.05) {
        o.animator.setSpeed(choice.clip, choice.speedRatio);
        ratio = choice.speedRatio;
      }
      const n = o.poseNode;
      if (!n) return;
      poseTiltFor(a, t as MovementTelemetry, tilt);
      const k = 1 - Math.exp(-TILT_EASE * Math.max(0, dtSec));
      if (tilt.spinRate > 0) { spin += tilt.spinRate * dtSec; n.rotation.x = spin % (Math.PI * 2); }
      else {
        if (spin !== 0) { n.rotation.x = Math.atan2(Math.sin(n.rotation.x), Math.cos(n.rotation.x)); spin = 0; }   // unwind the ball the short way
        n.rotation.x += (tilt.pitch - n.rotation.x) * k;
      }
      // assumption: Babylon's +z roll lifts the right side, so a right-wing-down bank is a negative z rotation (check in /dev/adventure)
      n.rotation.z += (-tilt.roll - n.rotation.z) * k;
    },
    dispose(): void {
      if (o.poseNode) { o.poseNode.rotation.x = 0; o.poseNode.rotation.z = 0; }
      current = null;
    },
  };
}
