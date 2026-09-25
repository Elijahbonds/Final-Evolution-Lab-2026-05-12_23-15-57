// HOTFIX (2026-09-24): freezeAtEnd called from INSIDE the clip's own end callback — which is where every caller calls it
// (the hoops tree's beats, the 3PT pull-up gather, Slam Rush's held gather). Babylon 9.23 notifies a group's end observers
// and THEN empties the group's animatable list, so a restart made in the callback kept playing in the scene with nothing
// able to fade or stop it: one more copy of the beat's last frame blended over every pose after it, per beat. These run
// the real CharacterAnimator on a NullEngine and count the animatables left on the bone.
import { describe, expect, it } from 'vitest';
import { Animation, AnimationGroup, FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { CharacterAnimator } from './CharacterAnimator';
import { BeatOwner } from './beatOwner';
import { BasketballAnimTree } from './basketballTree';

/** One bone, and clips that drive its x: idle holds 0, every one-shot runs 0 → 10 over 0.5 s. */
function rig(oneShots: string[]) {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  scene.useConstantAnimationDeltaTime = true;   // 16 ms of animation a frame, whatever the wall clock does
  new FreeCamera('cam', new Vector3(0, 0, -5), scene);
  const node = new TransformNode('bone', scene);
  const clip = (name: string, keys: [number, number][]) => {
    const a = new Animation(`${name}_x`, 'position.x', 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
    a.setKeys(keys.map(([frame, value]) => ({ frame, value })));
    const g = new AnimationGroup(name, scene); g.addTargetedAnimation(a, node); g.normalize(0, keys[keys.length - 1][0]);
    return g;
  };
  const groups = [clip('idle_stand', [[0, 0], [30, 0]]), ...oneShots.map((n) => clip(n, [[0, 0], [30, 10]]))];
  const animator = new CharacterAnimator(scene, groups);
  const byName = (n: string) => groups.find((g) => g.name === n)!;
  const frames = (n: number) => { for (let i = 0; i < n; i++) scene.render(); };
  const onBone = () => scene.getAllAnimatablesByTarget(node).length;
  return { scene, node, animator, byName, frames, onBone, dispose: () => { scene.dispose(); engine.dispose(); } };
}

describe('CharacterAnimator.freezeAtEnd from the clip\'s own end callback', () => {
  it('holds the last frame, then settles all the way back: one animatable on the bone, every time', () => {
    const r = rig(['gather']);
    r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
    for (let i = 0; i < 3; i++) {
      r.animator.play('gather', { fadeSec: 0.1, onEnd: () => r.animator.freezeAtEnd('gather') });
      r.frames(60);   // runs out at ~0.5 s, then sits frozen for another ~0.5 s
      expect(r.node.position.x).toBeGreaterThan(9.5);                // the load is held
      expect(r.byName('gather').isPlaying).toBe(true);               // as a live clip (the next fade has a source)
      expect(r.onBone()).toBe(1);
      r.animator.play('idle_stand', { loop: true, fadeSec: 0.1 }); r.frames(30);
      expect(r.node.position.x).toBeCloseTo(0, 3);                   // HEAD: 4.9, then 6.6, then 7.4
      expect(r.onBone()).toBe(1);                                    // HEAD: 2, then 3, then 4
      expect(r.byName('gather').isPlaying).toBe(false);
    }
    r.dispose();
  });

  it('a freeze and a settle in the same callback (the hoops tree\'s settle) fade FROM the end pose, with no snap and no leftover', () => {
    const r = rig(['react']);
    r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
    let endedAt = -1, frame = 0;
    r.animator.play('react', {
      fadeSec: 0.1,
      onEnd: () => { endedAt = frame; r.animator.freezeAtEnd('react'); r.animator.play('idle_stand', { loop: true, fadeSec: 0.1 }); },
    });
    const xs: number[] = [];
    for (frame = 0; frame < 90; frame++) {
      r.scene.render(); xs.push(r.node.position.x);
      if (endedAt >= 0 && frame === endedAt + 1) {   // the frame after the end: the frozen beat is a live, partly faded source
        expect(r.byName('react').isPlaying).toBe(true);
        const w = CharacterAnimator.weightOf(r.byName('react'));
        expect(w).toBeGreaterThan(0.5); expect(w).toBeLessThan(1);
      }
    }
    expect(endedAt).toBeGreaterThan(0);
    const after = xs.slice(endedAt);
    expect(after[0]).toBeGreaterThan(9.5);                          // the ending frame is the clip's last key
    for (let i = 1; i < after.length; i++) expect(Math.abs(after[i] - after[i - 1])).toBeLessThan(2.5);   // 0.1 s ≈ 6 frames of 10 units
    expect(xs[xs.length - 1]).toBeCloseTo(0, 3);
    expect(r.onBone()).toBe(1);
    expect(r.byName('react').isPlaying).toBe(false);
    r.dispose();
  });

  it('a freeze the body has already moved past (a hard cut in the same callback) never starts', () => {
    const r = rig(['react']);
    r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('react', { fadeSec: 0, onEnd: () => { r.animator.freezeAtEnd('react'); r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); } });
    r.frames(60);
    expect(r.byName('react').isPlaying).toBe(false);
    expect(r.node.position.x).toBeCloseTo(0, 3);
    expect(r.onBone()).toBe(1);
    r.dispose();
  });

  it('a freeze raised by a RESTART\'s stop (the 3PT gather re-thrown mid-clip) leaves the restarted clip alone', () => {
    const r = rig(['gather']);
    r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
    const freeze = () => r.animator.freezeAtEnd('gather');
    // ThreePointMode's own call: fadeSec 0.1, restart, onEnd → freezeAtEnd
    r.animator.play('gather', { fadeSec: 0.1, restart: true, onEnd: freeze }); r.frames(10);
    r.animator.play('gather', { fadeSec: 0.1, restart: true, onEnd: freeze });   // Babylon raises the first onEnd from this stop()
    r.frames(10);
    expect(r.onBone()).toBe(1);                                      // HEAD: 2 — a frozen copy at weight 1 under the restart
    const x = r.node.position.x;
    expect(x).toBeGreaterThan(2); expect(x).toBeLessThan(5);         // the restart is running from its start, not frozen at 10
    r.frames(60);                                                    // then it ends for real and freezes properly
    expect(r.node.position.x).toBeGreaterThan(9.5);
    expect(r.onBone()).toBe(1);
    r.dispose();
  });

  // HOTFIX (2026-09-24): Matrix Focus slows this rig's clock while a pose is held — the held pose stays still
  it('a setTimeScale during the hold leaves the held pose still (it does not replay the last half-frame)', () => {
    const r = rig(['gather']);
    r.animator.play('idle_stand', { loop: true, fadeSec: 0 }); r.frames(5);
    r.animator.play('gather', { fadeSec: 0.1, onEnd: () => r.animator.freezeAtEnd('gather') });
    r.frames(45);                                                    // ran out ~0.5 s: held
    r.animator.setTimeScale(0.3);
    const xs: number[] = [];
    for (let i = 0; i < 120; i++) { r.scene.render(); xs.push(r.node.position.x); }
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.01);   // before: cycled 9.83–9.99 (beat speed × 0.3)
    expect(Math.min(...xs)).toBeGreaterThan(9.5);
    r.animator.setTimeScale(1);
    r.dispose();
  });

  it('a freeze of a RUNNING holdEnd beat (its stop raises the beat\'s own freeze) starts one frozen copy, not two', () => {
    const r = rig(['gather']);
    const body = new BeatOwner(r.animator);
    body.loop('idle_stand'); r.frames(5);
    body.beat('gather', { fadeSec: 0.1, holdEnd: true }); r.frames(10);   // mid-clip
    r.animator.freezeAtEnd('gather');                               // stop() → the beat's onEnd → freezeAtEnd again (deferred)
    r.frames(10);
    expect(r.byName('gather').isPlaying).toBe(true);
    expect(r.onBone()).toBe(1);
    expect(r.node.position.x).toBeGreaterThan(9.5);                 // parked on the end frame
    body.settle(0.1); r.frames(30);
    expect(r.node.position.x).toBeCloseTo(0, 3);
    expect(r.onBone()).toBe(1);
    r.dispose();
  });

  it('park() drops a freeze that has not started yet', () => {
    const r = rig(['react']);
    r.animator.play('react', { fadeSec: 0, onEnd: () => { r.animator.freezeAtEnd('react'); r.animator.park(); } });
    r.frames(60);
    expect(r.byName('react').isPlaying).toBe(false);
    expect(r.onBone()).toBe(0);
    r.dispose();
  });
});

describe('the owners that freeze from an end callback', () => {
  it('Slam Rush: BeatOwner holdEnd holds the gather load and every launch settles to idle (no crouch left behind)', () => {
    const r = rig(['dunk_charge_gather', 'dunk_launch']);
    const body = new BeatOwner(r.animator);
    body.loop('idle_stand'); r.frames(20);
    for (let charge = 0; charge < 3; charge++) {
      body.beat('dunk_charge_gather', { fadeSec: 0.12, holdEnd: true });   // squeeze, held past the 0.5 s clip
      r.frames(60);
      expect(r.node.position.x).toBeGreaterThan(9.5);
      expect(body.busy).toBe(true);
      body.beat('dunk_launch', { fadeSec: 0.08 });                         // release
      r.frames(90);
      expect(body.busy).toBe(false);
      expect(r.node.position.x).toBeCloseTo(0, 3);                         // HEAD + holdEnd: 4.9, 6.6, 7.4
      expect(r.onBone()).toBe(1);
    }
    r.dispose();
  });

  it('hoops: a BasketballAnimTree beat that runs out, then the mode\'s next hold, leaves one animatable', () => {
    const r = rig(['bball_contact_react']);
    const tree = new BasketballAnimTree(r.animator);
    tree.hold('idle_stand'); r.frames(20);
    for (let i = 0; i < 3; i++) {
      tree.beat('bball_contact_react'); r.frames(60);
      tree.hold('idle_stand', { fadeSec: 0.1 }); r.frames(30);
      expect(r.node.position.x).toBeCloseTo(0, 3);                         // HEAD: 4.9, 6.6, 7.4
      expect(r.onBone()).toBe(1);
    }
    r.dispose();
  });
});
