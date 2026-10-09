// FIGHT KIT — the small per-frame pieces the four duel modes each wrote for themselves (IMPROVE 2026-10-06).
//
// KNOCK SLIDES. Karate VS, Showdown, Duel and Mixed Combat each carried their own copy of the knockback slide (VS's G3
// rule: constant speed, ease-out, the distance setting the duration), and each copy was a fresh render observer on the
// REAL clock. Three things followed from that: a slide ran at full speed through Matrix Focus while everything else
// slowed; a second hit inside a running slide started a second observer that fought the first for the same body; and a
// slide still running when the round reset dragged the fighter off the start mark. One owner now, ticked by the mode on
// the room clock, one slide per body (a new hit replaces the running one), and clear() at a round reset.
//
// CHEST POINTS. `chestOf` built two Vector3s per fighter per frame in every duel mode (the add() result and the offset).
// `makeChestOf` hands back one scratch point per target, rewritten in place — the posture feed reads it on the spot.
//
// Pure maths on {x, z}: no scene, no observers.

import { Vector3 } from '@babylonjs/core';

/** The slide speed every duel mode used (m/s): 0.4 m in 44 ms, 2.2 m in 244 ms. */
export const KNOCK_SPEED = 9;
/** No slide is shorter than this, so even a tiny shove reads. */
export const KNOCK_MIN_SEC = 0.08;

interface Slide {
  target: { x: number; z: number };
  fromX: number; fromZ: number; toX: number; toZ: number;
  t: number; sec: number;
  onDone?: () => void;
}

export class KnockSlides {
  private slides: Slide[] = [];

  /** Start carrying `target` from where it stands to (toX, toZ). A slide already running on this target is replaced
   *  (its onDone does not fire — the new blow owns the body now). Returns the slide's duration in seconds. */
  start(target: { x: number; z: number }, toX: number, toZ: number, onDone?: () => void, speed = KNOCK_SPEED): number {
    this.cancel(target);
    const d = Math.hypot(toX - target.x, toZ - target.z);
    const sec = Math.max(KNOCK_MIN_SEC, d / Math.max(0.1, speed));
    this.slides.push({ target, fromX: target.x, fromZ: target.z, toX, toZ, t: 0, sec, onDone });
    return sec;
  }

  /** Advance every slide by `dt` seconds of the ROOM clock. A non-positive dt (a pause, a hit-stop) holds them. */
  tick(dt: number): void {
    if (!(dt > 0) || this.slides.length === 0) return;
    // iterate a snapshot: an onDone may start another slide
    const list = this.slides;
    const done: Slide[] = [];
    for (const s of list) {
      s.t = Math.min(s.sec, s.t + dt);
      const u = s.t / s.sec;
      const k = 1 - (1 - u) * (1 - u);   // the body carries the blow out and settles: ease-out, not a linear drag
      s.target.x = s.fromX + (s.toX - s.fromX) * k;
      s.target.z = s.fromZ + (s.toZ - s.fromZ) * k;
      if (u >= 1) done.push(s);
    }
    if (done.length) {
      this.slides = this.slides.filter((s) => !done.includes(s));
      for (const s of done) s.onDone?.();
    }
  }

  /** Is this body being carried right now? */
  sliding(target: { x: number; z: number }): boolean { return this.slides.some((s) => s.target === target); }
  get active(): number { return this.slides.length; }

  /** Drop the slide on one body (no onDone). */
  cancel(target: { x: number; z: number }): void {
    if (this.slides.length) this.slides = this.slides.filter((s) => s.target !== target);
  }

  /** Drop every slide (no onDone) — a round reset, a dispose. */
  clear(): void { this.slides = []; }
}

/** The chest height every duel mode aims the posture layer at. */
export const CHEST_Y = 1.32;

/**
 * One scratch chest point per target body, rewritten in place each call: `chestOf(c)` is the point CHEST_Y above
 * `c.root.position`, valid until the next chestOf of the SAME body. The posture feed consumes it on the spot.
 */
export function makeChestOf(height = CHEST_Y): (c: { root: { position: Vector3 } }) => Vector3 {
  const scratch = new WeakMap<object, Vector3>();
  return (c) => {
    let v = scratch.get(c.root);
    if (!v) { v = new Vector3(); scratch.set(c.root, v); }
    const p = c.root.position;
    return v.set(p.x, p.y + height, p.z);
  };
}
