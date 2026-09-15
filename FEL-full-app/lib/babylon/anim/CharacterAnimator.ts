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
import { ledgerFor, requestAllowed, scopeFallback, suiteOfClip, type ClipScope } from './clipScope';

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
  /** The clip the in-flight crossfade is ramping DOWN. Tracked so a fade that
   *  gets replaced before it finishes can still stop its outgoing clip — see
   *  crossFade(). */
  private fadingOut: AnimationGroup | null = null;
  private endObs = new Map<AnimationGroup, Observer<AnimationGroup>>();
  /** SHARED-ANIM-BUS: the mode's clip scope (clipScope.ts). null = unscoped (every suite). */
  private scope: ClipScope | null = null;
  private refusedOnce = new Set<string>();

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

  /** Scope this body to its mode's suites — set once by registerAuthoredClips. */
  setScope(scope: ClipScope | null): void { this.scope = scope; }

  play(name: string, opts: PlayOpts = {}): AnimationGroup | null {
    // SHARED-ANIM-BUS (2026-09-14): another sport's clip is REFUSED, not aliased. Before this a board bail asked for the
    // football fall and got it, and a TD spike asked for a name whose alias was the karate uppercut and got that. The
    // body lands on its own scope's resting loop instead; the refusal is logged once per name and counted for probes.
    if (this.scope && !requestAllowed(this.scope, name, this.groups)) {
      const ledger = ledgerFor(this.scene);
      ledger.refused.set(name, (ledger.refused.get(name) ?? 0) + 1);
      if (!this.refusedOnce.has(name)) {
        this.refusedOnce.add(name);
        console.error(`[FEL-ANIM] REFUSED cross-mode clip "${name}" (${suiteOfClip(name)}) in "${this.scope.modeId}" — scope core+${this.scope.suites.join('+') || '-'}; playing "${scopeFallback(this.scope)}"`);
      }
      name = scopeFallback(this.scope);
    }
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
    // A fade already in flight owns an outgoing clip that has NOT been stopped
    // yet (it only stops when the ramp reaches 1). Dropping its observer below
    // would strand that clip playing forever at whatever partial weight it had
    // reached, quietly blending into every pose that follows. Any clip switch
    // faster than fadeSec — combo strings, rapid input, a stalled frame loop —
    // hits this. Retire the orphan before taking over the fade slot.
    if (this.fadingOut && this.fadingOut !== next && this.fadingOut !== prev) {
      this.fadingOut.stop();
    }
    this.fadeObs?.remove();
    if (fadeSec <= 0) {
      prev?.stop();
      this.fadingOut = null;
      next.setWeightForAllAnimatables(1);
      return;
    }
    this.fadingOut = prev && prev !== next ? prev : null;
    // DUNK-BALL-ARMS-RIM (2026-09-14): the outgoing clip fades from the weight it HAS. A clip superseded while it was still fading
    // in (a finish on the frame after the hang took over) used to restart at full weight — the half-blended pose snapped onto
    // that clip in one frame (the dunker's hands 0.47–0.61 m in a frame, measured). A clip at full weight fades exactly as before.
    const w0 = prev && prev !== next ? CharacterAnimator.weightOf(prev) : 1;
    let t = 0;
    this.fadeObs = this.scene.onBeforeRenderObservable.add(() => {
      t += this.scene.getEngine().getDeltaTime() / 1000;
      const k = Math.min(1, t / fadeSec);
      next.setWeightForAllAnimatables(k);
      if (prev && prev !== next) prev.setWeightForAllAnimatables(w0 * (1 - k));
      if (k >= 1) {
        if (prev && prev !== next) prev.stop();
        this.fadingOut = null;
        this.fadeObs?.remove();
        this.fadeObs = null;
      }
    });
  }

  /** A playing group's blend weight (its animatables carry it; −1 = never set = full). */
  static weightOf(g: AnimationGroup): number {
    const w = (g as unknown as { animatables?: { weight: number }[] }).animatables?.[0]?.weight;
    return w == null || w < 0 ? 1 : Math.max(0, Math.min(1, w));
  }

  /** Wall-clock duration of a clip (seconds) at speedRatio 1 — used by
   *  ShotReleaseSync to pace the jumpshot so its contact frame lands on
   *  the meter's green center. */
  durationOf(name: string): number | null {
    const g = this.groups.get(resolveClip(name, this.clipNames).clip);
    if (!g) return null;
    const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 60;
    return (g.to - g.from) / fps;
  }

  setSpeed(name: string, speedRatio: number): void {
    const g = this.groups.get(resolveClip(name, this.clipNames).clip);
    if (g?.isPlaying) g.speedRatio = speedRatio;
  }

  /**
   * Scale a playing clip's rate RELATIVE to what the alias authored — for stride matching.
   *
   * setSpeed() sets the group's ratio outright, which quietly DISCARDS the alias's own multiplier: play() computes
   * `speedRatio * r.speedRatio`, and `bball_dribble_run` is `['run', 0.9]`. A stride matcher calling setSpeed(clip, 1)
   * was therefore playing that loop 11% faster than the alias asked for, every frame, and the calibration on top of it
   * was silently compensating. This multiplies instead, so an alias's authored rate survives.
   */
  setPlaybackScale(name: string, scale: number): void {
    const r = resolveClip(name, this.clipNames);
    const g = this.groups.get(r.clip);
    if (g?.isPlaying) g.speedRatio = scale * r.speedRatio;
  }

  stopAll(fadeToIdle = 'idle_stand'): void {
    this.play(fadeToIdle, { loop: true, fadeSec: 0.2 });
  }

  /**
   * Hand the rig over: stop every clip and start NOTHING.
   *
   * `stopAll` does not do this — it fades to the idle loop, which is the right behaviour for "this mode is
   * done driving the body" and the wrong one for "something else owns this body now". Velocity Kart's driver
   * paid for that difference: the seated pose was built, started, and then quietly overlaid by the
   * `idle_stand` that `stopAll` had just started, so the driver sat in the kart with its arms hanging at its
   * sides (measured: hands 0.03 m in front of the sternum instead of 0.36 m out on the wheel).
   *
   * Use this before an authored pose clip, an IK rig, or anything else that wants to be the ONE owner —
   * which is the rule the board and combat trees already run on.
   */
  park(): void {
    this.fadeObs?.remove();
    this.fadeObs = null;
    this.fadingOut = null;
    this.current = null;
    this.currentName = '';
    this.groups.forEach((g) => g.stop());
  }

  dispose(): void {
    this.fadeObs?.remove();
    this.endObs.forEach((o, g) => g.onAnimationGroupEndObservable.remove(o as never));
    this.groups.forEach((g) => g.stop());
  }
}
