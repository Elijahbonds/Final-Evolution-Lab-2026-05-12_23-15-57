// CINEMA RIG (lane/w3-present, wave 3) — lays a cinematic camera over the play camera's frame without touching the play camera.
//
// A fight's cinematic moments (the intro walk-in, the DRAGON cut, the 100th-KO finisher) are cameras the PLAY camera must not
// be bent to make: it is tuned (FOLLOW_PRESETS, the Hundred camera's damped crowd shot), and the mode reads it back every frame
// (the stick is mapped through the camera's own forward). So the cut is an OVERLAY on the render, not a state of the director:
//
//   mode.update()          camDirector.update() writes the play camera's frame, as it always did
//   scene.onBeforeRender   the rig reads that frame ("live"), then writes the cinematic pose over it for this render (insertFirst:
//                          the harness's shake then rides on the cinematic frame, as it rides on the play frame)
//   (the scene renders)
//   scene.onAfterRender    the rig puts the live frame back — position, target, lens
//   mode.update()          next frame reads exactly the play camera it wrote: input mapping, the follow's own damping, FrameGuard
//
// So when a cut ends there is nothing to hand back: the play camera has been running underneath the whole time, and the frame
// after the last cinematic one is the follow's own. A pause that stops rendering stops the cut and breaks nothing.
//
// The bars come from the foundation's letterbox, which already eases over `scene.metadata.felCinematic` (visual/Letterbox).
// Reduced motion is the caller's to honour before it starts a cut (motionPolicy().travel): the rig itself plays what it is told.

import { Vector3 } from '@babylonjs/core';
import type { Observer, Scene, TargetCamera } from '@babylonjs/core';
import { orbitBlend, smoothstep, type ShotPose, type V3 } from '../scene/broadcastShots';
import type { LivePose } from './fightShots';

/** One frame of a cinematic: the pose to draw (or 'play' = the cut is over) and how closed the bars are. */
export interface CinFrame { shot: ShotPose | 'play'; letterbox: number }
/** A cinematic: given the play camera's frame this render, say where the camera stands. */
export type CinFn = (live: LivePose) => CinFrame;

/** The default ease out of an interrupted cut (a press, a cancel), seconds. */
export const CIN_EASE_OUT_SEC = 0.35;

export interface CinemaRig {
  /** Start (or replace) a cinematic. `about` = the point an interrupted cut eases round (never through it). */
  play(fn: CinFn, about?: () => V3): void;
  /** Ease out of the running cut now (default CIN_EASE_OUT_SEC); a no-op when none runs. */
  stop(easeSec?: number): void;
  /** Drop it on the spot (a round reset, a replay about to take the camera). The next render is the play camera's. */
  cancel(): void;
  readonly active: boolean;
  dispose(): void;
}

export function mountCinemaRig(scene: Scene, camera: TargetCamera): CinemaRig {
  let fn: CinFn | null = null;
  let about: (() => V3) | null = null;
  let last: ShotPose | null = null;               // what was drawn last (an interrupted cut eases from it)
  let ease: { sec: number; t: number; from: ShotPose } | null = null;
  let live: { pos: Vector3; target: Vector3; fov: number; minZ: number } | null = null;   // the play camera's frame, held between before and after render
  let barLevel = 0;                                // the level we last wrote to felCinematic (0 = we hold none)

  const setBars = (k: number): void => {
    const md = (scene.metadata ??= {}) as { felCinematic?: number };
    const level = Math.max(0, Math.min(1, k));
    if (level > 0) { md.felCinematic = Math.max(level, 0); barLevel = level; }
    else if (barLevel > 0) { md.felCinematic = 0; barLevel = 0; }   // only a level we raised is ours to lower
  };

  const before = scene.onBeforeRenderObservable.add(() => {
    if (!fn && !ease) return;
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    live = { pos: camera.position.clone(), target: camera.getTarget().clone(), fov: camera.fov, minZ: camera.minZ };
    const livePose: LivePose = { pos: { x: live.pos.x, y: live.pos.y, z: live.pos.z }, target: { x: live.target.x, y: live.target.y, z: live.target.z }, fov: live.fov };
    let shot: ShotPose | null = null;
    let bars = 0;
    if (ease) {
      ease.t += dt;
      const k = smoothstep(ease.t / ease.sec);
      if (k >= 1) { ease = null; last = null; live = null; setBars(0); return; }
      const c = about?.() ?? livePose.target;
      const p = orbitBlend(ease.from.pos, livePose.pos, c, k);
      shot = {
        pos: p,
        target: { x: ease.from.target.x + (livePose.target.x - ease.from.target.x) * k, y: ease.from.target.y + (livePose.target.y - ease.from.target.y) * k, z: ease.from.target.z + (livePose.target.z - ease.from.target.z) * k },
        fov: (ease.from.fov ?? livePose.fov) + (livePose.fov - (ease.from.fov ?? livePose.fov)) * k,
      };
      bars = 1 - k;
    } else if (fn) {
      const f = fn(livePose);
      if (f.shot === 'play') { fn = null; last = null; live = null; setBars(0); return; }
      shot = f.shot; bars = f.letterbox;
    }
    if (!shot) return;
    last = shot;
    camera.position.set(shot.pos.x, shot.pos.y, shot.pos.z);
    camera.setTarget(new Vector3(shot.target.x, shot.target.y, shot.target.z));
    if (shot.fov) camera.fov = shot.fov;
    setBars(bars);
  }, undefined, true);

  const after = scene.onAfterRenderObservable.add(() => {
    if (!live) return;
    camera.position.copyFrom(live.pos);
    camera.setTarget(live.target);
    camera.fov = live.fov; camera.minZ = live.minZ;
    live = null;
  });

  return {
    play(f, a) { fn = f; about = a ?? null; ease = null; },
    stop(easeSec = CIN_EASE_OUT_SEC) {
      if (!fn || !last) { fn = null; return; }
      fn = null; ease = { sec: Math.max(0.05, easeSec), t: 0, from: last };
    },
    cancel() { fn = null; ease = null; last = null; if (live) { camera.position.copyFrom(live.pos); camera.setTarget(live.target); camera.fov = live.fov; camera.minZ = live.minZ; live = null; } setBars(0); },
    get active() { return fn !== null || ease !== null; },
    dispose() {
      this.cancel();
      scene.onBeforeRenderObservable.remove(before as Observer<Scene>);
      scene.onAfterRenderObservable.remove(after as Observer<Scene>);
    },
  };
}
