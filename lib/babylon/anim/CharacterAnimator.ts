// CharacterAnimator v2 — REPLACES every prior version. One real hardening
// fix found during the M50 dunk-contest live audit: every mode calls
// `.play(moving ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle, { loop: true })`
// from inside update(), i.e. every rendered frame. The old play() treated
// each call as a fresh request: same-clip calls hit the `next.stop()` +
// restart + weight-reset-to-0 + brand-new crossfade path every single frame,
// so a looping clip's weight was constantly reset before it could climb back
// to 1 (worst on real 60fps devices, where one frame's delta is far shorter
// than the 0.15s fadeSec — masked in slow/software-rendered test capture,
// where a single frame's delta can exceed the whole fade window). Confirmed
// live via bundle instrumentation: repeated same-clip play() calls were
// firing every frame in production. Fixed here: a call for the clip that's
// already current and mid/post-fade is now a no-op unless the caller passes
// different opts (speedRatio/onEnd) or explicitly restarts.
//
// Bind pose is unreachable: a resolved clip always plays (see clipRegistry).

import type { AnimationGroup, Scene, Observer } from '@babylonjs/core';
import { resolveClip } from './clipResolver';

export interface PlayOpts {
  loop?: boolean;
  speedRatio?: number;
  fadeSec?: number;
  onEnd?: () => void;
  /** Force a restart even if this exact clip is already current+playing. */
  restart?: boolean;
}

export class CharacterAnimator {
  private groups = new Map<string, AnimationGroup>();
  private current: AnimationGroup | null = null;
  private currentName = '';
  private currentSpeed = 1;
  private fadeObs: Observer<Scene> | null = null;
  private endObs = new Map<AnimationGroup, Observer<AnimationGroup>>();

  constructor(private scene: Scene, groups: AnimationGroup[]) {
    for (const g of groups) this.register(g);
  }

  register(g: AnimationGroup): void {
    g.stop();
    this.groups.set(g.name, g);
  }

  get clipNames(): Set<string> { return new Set(this.groups.keys()); }

  /** M68: SkinningGuard uses this to tell "stalled" from "nothing is playing". */
  get isPlaying(): boolean { return this.current?.isPlaying ?? false; }

  /** M69: current playhead frame of the active clip. SkinningGuard v3 uses it
   *  to tell a real stall (playhead advancing, bones frozen) from a legitimate
   *  held pose (KO/victory freeze — playhead parked). 0 when nothing is active,
   *  which reads as "not advancing" — the conservative answer. */
  get currentFrame(): number {
    const g = this.current;
    if (!g) return 0;
    const anyG = g as unknown as { getCurrentFrame?: () => number; animatables?: { masterFrame?: number }[] };
    const f = anyG.getCurrentFrame?.() ?? anyG.animatables?.[0]?.masterFrame ?? 0;
    return Number.isFinite(f) ? f : 0;
  }

  play(name: string, opts: PlayOpts = {}): AnimationGroup | null {
    const r = resolveClip(name, this.clipNames);
    const next = this.groups.get(r.clip);
    if (!next) return null;                      // only possible with an empty library

    const { loop = false, speedRatio = 1, fadeSec = 0.15, onEnd, restart = false } = opts;
    const finalSpeed = speedRatio * r.speedRatio;

    // Redundant same-clip request (the common "play idle/run every frame in
    // update()" pattern) — already current, already the target speed, and no
    // explicit restart requested: do nothing. This is what actually lets
    // weight finish ramping to 1 instead of being reset every frame.
    if (!restart && this.current === next && this.currentName === r.clip
        && next.isPlaying && this.currentSpeed === finalSpeed) {
      return next;
    }

    const prev = this.current;
    if (prev === next && next.isPlaying) {       // restart same clip cleanly
      next.stop();
    }

    next.speedRatio = Math.abs(finalSpeed);
    // negative speed = play from end (Babylon supports goToFrame + negative ratio)
    next.start(loop, Math.abs(finalSpeed), finalSpeed < 0 ? next.to : next.from,
               finalSpeed < 0 ? next.from : next.to, false);
    next.setWeightForAllAnimatables(0);

    if (onEnd) {
      this.endObs.get(next)?.remove();
      const obs = next.onAnimationGroupEndObservable.addOnce(() => onEnd());
      this.endObs.set(next, obs as unknown as Observer<AnimationGroup>);
    }

    this.crossFade(prev, next, fadeSec);
    this.current = next;
    this.currentName = r.clip;
    this.currentSpeed = finalSpeed;
    return next;
  }

  /** Frame-driven weight ramp: prev→0, next→1. */
  private crossFade(prev: AnimationGroup | null, next: AnimationGroup, fadeSec: number): void {
    this.fadeObs?.remove();
    if (fadeSec <= 0) {
      prev?.stop();
      next.setWeightForAllAnimatables(1);
      return;
    }
    let t = 0;
    this.fadeObs = this.scene.onBeforeRenderObservable.add(() => {
      t += this.scene.getEngine().getDeltaTime() / 1000;
      const k = Math.min(1, t / fadeSec);
      next.setWeightForAllAnimatables(k);
      if (prev && prev !== next) prev.setWeightForAllAnimatables(1 - k);
      if (k >= 1) {
        if (prev && prev !== next) prev.stop();
        this.fadeObs?.remove();
        this.fadeObs = null;
      }
    });
  }

  setSpeed(name: string, speedRatio: number): void {
    const g = this.groups.get(resolveClip(name, this.clipNames).clip);
    if (g?.isPlaying) g.speedRatio = speedRatio;
  }

  stopAll(fadeToIdle = 'idle_stand'): void {
    this.play(fadeToIdle, { loop: true, fadeSec: 0.2 });
  }

  dispose(): void {
    this.fadeObs?.remove();
    this.endObs.forEach((o, g) => g.onAnimationGroupEndObservable.remove(o as never));
    this.groups.forEach((g) => g.stop());
  }
}
