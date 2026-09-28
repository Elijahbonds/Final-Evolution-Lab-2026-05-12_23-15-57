// HOOPS MOTION phase 3d — ONE OWNER PER BODY: the crossfade's re-entrancy, closed in CharacterAnimator (plan §3 "One owner per body").
// Babylon raises a group's end observable from stop() as well as from a natural end, so a clip cut by a newer play() ran its end callback
// when the fade that replaced it finished — from INSIDE the fade handler. Two paths stacked two clips at full weight on the 3PT shooter
// (2a's weight log; rE: 138 frames over 10 windows): an end callback that PLAYS the next clip (its fade was cleared by the handler it started
// in: the new clip stranded at weight 0, the old one untracked at full weight), and one that FREEZES the cut clip (it came back as the body's
// pose over the clip that had replaced it). The 3d review: letting the chained play win instead handed every body back to a STALE chain
// (neverBindPose's "back to the base loop" erased Who Scene It's verdict ~0.2 s in). A clip the animator cuts is now RETIRED — stopped
// without its end callback, which belongs to the clip's natural end — and (the final review) the callback is detached when the cut starts,
// so a natural end that falls inside the fade does not run it either. These run the real CharacterAnimator on a NullEngine and read every
// group's weight each frame.
import { describe, expect, it } from 'vitest';
import { Animation, AnimationGroup, FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { CharacterAnimator } from './CharacterAnimator';
import { neverBindPose } from './importSanitizer';

/** One bone; idle_stand holds 0 (a loop); every one-shot runs 0 → 10 over `sec` (default 0.5 s). */
function rig(oneShots: (string | [string, number])[]) {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  scene.useConstantAnimationDeltaTime = true;
  new FreeCamera('cam', new Vector3(0, 0, -5), scene);
  const node = new TransformNode('bone', scene);
  const clip = (name: string, keys: [number, number][]) => {
    const a = new Animation(`${name}_x`, 'position.x', 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
    a.setKeys(keys.map(([frame, value]) => ({ frame, value })));
    const g = new AnimationGroup(name, scene); g.addTargetedAnimation(a, node); g.normalize(0, keys[keys.length - 1][0]);
    return g;
  };
  const groups = [clip('idle_stand', [[0, 0], [30, 0]]), ...oneShots.map((o) => { const [n, sec] = typeof o === 'string' ? [o, 0.5] : o; return clip(n, [[0, 0], [Math.round(sec * 60), 10]]); })];
  const animator = new CharacterAnimator(scene, groups);
  const byName = (n: string) => groups.find((g) => g.name === n)!;
  /** the groups playing at weight ≥ 0.9 this frame (Babylon averages them: each drawn at half strength) */
  const full = () => groups.filter((g) => g.isPlaying && CharacterAnimator.weightOf(g) >= 0.9).map((g) => g.name);
  let stacked = 0;
  const frames = (n: number) => { for (let i = 0; i < n; i++) { scene.render(); if (full().length >= 2) stacked++; } };
  return { scene, node, animator, byName, full, frames, stacked: () => stacked, dispose: () => { scene.dispose(); engine.dispose(); } };
}

describe('CharacterAnimator — a clip cut by a newer play() is retired: its end callback does not run', () => {
  it('a raw onEnd chain on a cut clip is dropped: the clip that cut it keeps the body, and the next play() fades from it', () => {
    // 3PT, rE a5: the follow-through's absorb chains to idle on its end; the make's celebrate cuts the absorb. When that fade completed
    // the absorb was stopped and its chain played idle — the parent's handler then cleared idle's fade (idle stranded at weight 0 as the
    // current clip, the celebrate untracked at full weight, the next shot's jumpshot faded in over it: two clips at full weight); 3d's first
    // cut let idle's fade run, and the stale chain erased the celebrate (the review). Retired, the absorb's chain never runs.
    const r = rig(['absorb', 'celebrate', 'jumpshot']);
    let chained = 0;
    r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('absorb', { fadeSec: 0.1, onEnd: () => { chained++; r.animator.play('idle_stand', { loop: true, fadeSec: 0.2 }); } }); r.frames(3);
    r.animator.play('celebrate', { fadeSec: 0.12 });
    r.frames(20);   // the celebrate's fade completes at ~0.12 s: the absorb is retired
    expect(chained).toBe(0);
    expect(r.byName('absorb').isPlaying).toBe(false);
    expect(r.byName('idle_stand').isPlaying).toBe(false);   // 3d's first cut: idle faded in over the celebrate and stopped it
    expect(r.full()).toEqual(['celebrate']);                 // the parent: celebrate untracked; idle the current clip at weight 0
    r.animator.play('jumpshot', { fadeSec: 0.08 }); r.frames(20);
    expect(r.full()).toEqual(['jumpshot']);
    expect(r.byName('celebrate').isPlaying).toBe(false);    // the parent: celebrate + jumpshot at full weight
    expect(r.stacked()).toBe(0);
    r.dispose();
  });

  it('Who Scene It: a buzz cut by the verdict in the same frame (neverBindPose on the body) — the verdict plays its whole length', () => {
    // WhoSceneItMode.answer(): cast.buzz(p) then, in the same frame, resolve() → cast.verdict(p, correct); both are Contestants.play —
    // unguarded one-shots ({ loop: false, fadeSec: 0.08 }, no onEnd), so neverBindPose gives each its "back to the idle" chain
    const r = rig([['buzz', 0.5], ['verdict', 1.2]]);
    neverBindPose(r.animator, 'idle_stand');
    r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('buzz', { loop: false, fadeSec: 0.08 });
    r.animator.play('verdict', { loop: false, fadeSec: 0.08 });
    const w: number[] = [];
    let idleIn = 0;
    for (let f = 1; f <= 70; f++) { r.frames(1); w.push(CharacterAnimator.weightOf(r.byName('verdict'))); if (r.byName('idle_stand').isPlaying) idleIn++; }
    expect(Math.min(...w.slice(9))).toBeGreaterThan(0.99);   // frames 10–70 (3d's first cut: 0.31 at frame 10, idle at 1 by frame 20)
    expect(idleIn).toBe(0);
    expect(r.byName('buzz').isPlaying).toBe(false);
    // the verdict's NATURAL end still runs its chain: back to the idle, by a fade
    r.frames(30);
    expect(r.byName('verdict').isPlaying).toBe(false);
    expect(r.full()).toEqual(['idle_stand']);
    expect(r.stacked()).toBe(0);
    r.dispose();
  });

  it('a cut with no fade (fadeSec 0) retires the cut clip the same way', () => {
    const r = rig(['a', 'b']);
    neverBindPose(r.animator, 'idle_stand');
    r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('a', { fadeSec: 0.1 }); r.frames(10);
    r.animator.play('b', { fadeSec: 0 }); r.frames(10);
    expect(r.byName('a').isPlaying).toBe(false);
    expect(r.byName('idle_stand').isPlaying).toBe(false);   // parent: a's chain played idle inside the cut, then its fade ran on untracked
    expect(r.full()).toEqual(['b']);
    expect(r.stacked()).toBe(0);
    r.dispose();
  });

  it('a retired clip\'s callback is gone: it does not fire on a later play of that clip that registers none; a natural end still fires once', () => {
    const r = rig([['a', 0.3], 'b']);
    let aEnds = 0;
    r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('a', { fadeSec: 0.1, onEnd: () => { aEnds++; } }); r.frames(5);
    r.animator.play('b', { fadeSec: 0.1 }); r.frames(20);   // a is cut and retired
    expect(aEnds).toBe(0);
    r.animator.play('a', { fadeSec: 0.1 }); r.frames(40);   // played again with no callback, and it runs out on its own
    expect(r.byName('a').isPlaying).toBe(false);
    expect(aEnds).toBe(0);                                   // a stale observer would have fired here
    r.animator.play('a', { fadeSec: 0.1, onEnd: () => { aEnds++; } }); r.frames(40);
    expect(aEnds).toBe(1);                                   // the natural end is the callback's
    r.dispose();
  });

  it('a clip cut by a newer play() is not frozen back in when that fade stops it (the end callback\'s freezeAtEnd is dropped)', () => {
    // 3PT, rE a2: the pull-up gather freezes on its end; a chained idle cut it; the idle's fade stopped it, its end callback froze it — and
    // the gather came back as the body's pose at full weight over the idle, which stayed at full weight too (80 stacked frames)
    const r = rig(['gather']);
    r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('gather', { fadeSec: 0.1, onEnd: () => r.animator.freezeAtEnd('gather') }); r.frames(6);
    r.animator.play('idle_stand', { loop: true, fadeSec: 0.2 });   // cut well before the gather's own end
    r.frames(40);
    expect(r.byName('gather').isPlaying).toBe(false);       // HEAD: frozen, at weight 1, as the current clip
    expect(r.full()).toEqual(['idle_stand']);
    expect(r.stacked()).toBe(0);
    expect(r.node.position.x).toBeCloseTo(0, 3);
    r.dispose();
  });

  it('a clip whose own end comes INSIDE the fade that is cutting it runs no end callback (not even a freeze), and the fade finishes', () => {
    // Final review: the cut clip's callback is detached when the cut STARTS. 3d's first fix held this clip's last frame at the fade's weight
    // when its end callback froze it; no owner's callback reaches that any more (BeatOwner and the basketball tree token-guard the beats
    // they cut, and a cut from outside them is detached), so the clip stops at its own end like any clip its owner cut.
    const r = rig([['short', 0.25]]);
    let ends = 0;
    r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('short', { fadeSec: 0.05, onEnd: () => { ends++; r.animator.freezeAtEnd('short'); } }); r.frames(10);   // 0.17 of its 0.25 s
    r.animator.play('idle_stand', { loop: true, fadeSec: 0.3 });   // its end comes ~0.08 s into this 0.3 s fade
    r.frames(30);
    expect(ends).toBe(0);
    expect(CharacterAnimator.weightOf(r.byName('idle_stand'))).toBeCloseTo(1, 3);   // the parent: the fade killed at ~0.27, idle stranded there
    expect(r.byName('short').isPlaying).toBe(false);        // the parent: frozen as the current clip, at full weight
    expect(r.full()).toEqual(['idle_stand']);
    expect(r.node.position.x).toBeCloseTo(0, 3);
    expect(r.stacked()).toBe(0);
    r.dispose();
  });

  it('a one-shot cut in its LAST fadeSec (neverBindPose on the body): its own end falls inside the fade, and the clip that cut it keeps the body', () => {
    // The final review: retired only when the fade ENDED, a cut clip whose natural end came first still raised its end — neverBindPose's
    // "back to the base loop" took the body from the clip that had cut it (a 0.5 s buzz cut 26 frames in by a 1.2 s verdict, fade 0.15:
    // the verdict at 0.30 by frame 10 and 0 by frame 20; 28 frames in, fade 0.08: 0.14 by frame 10). Detached at the cut, it never runs.
    for (const [cutAt, fadeSec] of [[26, 0.15], [28, 0.08]] as const) {
      const r = rig([['buzz', 0.5], ['verdict', 1.2]]);
      neverBindPose(r.animator, 'idle_stand');
      r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
      r.animator.play('buzz', { loop: false, fadeSec: 0.08 }); r.frames(cutAt);
      r.animator.play('verdict', { loop: false, fadeSec });
      const w: number[] = [];
      let idleIn = 0;
      for (let f = 1; f <= 60; f++) { r.frames(1); w.push(r.byName('verdict').isPlaying ? CharacterAnimator.weightOf(r.byName('verdict')) : 0); if (r.byName('idle_stand').isPlaying) idleIn++; }
      expect(Math.min(...w.slice(Math.ceil(fadeSec * 60)))).toBeGreaterThan(0.99);   // from the fade's end to frame 60
      expect(idleIn).toBe(0);
      expect(r.byName('buzz').isPlaying).toBe(false);
      r.frames(30);   // the verdict's own end is still the verdict's: back to the idle
      expect(r.full()).toEqual(['idle_stand']);
      expect(r.stacked()).toBe(0);
      r.dispose();
    }
  });

  it('park() parks: a clip whose end callback freezes it does not come back when park() stops it', () => {
    const r = rig(['gather']);
    r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('gather', { fadeSec: 0.1, onEnd: () => r.animator.freezeAtEnd('gather') }); r.frames(10);
    r.animator.park(); r.frames(3);
    expect(r.byName('gather').isPlaying).toBe(false);       // HEAD: park() → stop → end callback → frozen back in as the current clip
    expect(r.byName('idle_stand').isPlaying).toBe(false);
    r.dispose();
  });

  it('unchanged: the current clip\'s own end still freezes it (the beat holds its load), and an orphaned fade-out is retired', () => {
    const r = rig(['gather', 'a', 'b']);
    r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('gather', { fadeSec: 0.1, onEnd: () => r.animator.freezeAtEnd('gather') }); r.frames(50);
    expect(r.byName('gather').isPlaying).toBe(true); expect(r.node.position.x).toBeGreaterThan(9.5);
    // two plays inside one fade: the first incoming clip's fade-out is retired, never left blending
    r.animator.play('a', { fadeSec: 0.2 }); r.frames(3);
    r.animator.play('b', { fadeSec: 0.2 }); r.frames(30);
    expect(r.byName('gather').isPlaying).toBe(false); expect(r.byName('a').isPlaying).toBe(false);
    expect(r.full()).toEqual(['b']);
    r.dispose();
  });
});
