// lane/h3-handler (#312 port, core/HoopsLook): where the player's eyes and chest go with the ball — the defender's chest when sizing him up
// (a glance at the rim now and then), side-on in the protect with the ball away from him, and the mode's own aim and eyes otherwise. And
// ProtectSink (anim/ProtectSink, on #380's legSink): the protect sits PROTECT_SINK_M lower, the feet and the hands kept.
import { afterEach, describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { HandlerLook, READ_RANGE_M, READ_GLANCE_EVERY_SEC, READ_GLANCE_SEC, PROTECT_TURN_DEG, PROTECT_EYES, PROTECT_CHEST_AIM, CHEST_Y, type HandlerLookIn } from './HoopsLook';
import { HOOPS_POSTURE } from './HoopsPosture';
import { ProtectSink, stepSink, PROTECT_SINK_M } from '../anim/ProtectSink';
import { hoopsNodeRig } from '../../../tests/helpers/hoopsNodeRig';
import { openFeel, closeFeel } from '../../../tests/helpers/feelOverrides';

const DT = 1 / 60;
afterEach(() => closeFeel());
const RIM = new Vector3(0, 3.05, -10);
/** Me at the origin facing the rim (−z), the ball on my right (+x), him 1 m in front unless moved. */
const at = (o: Partial<HandlerLookIn> = {}): HandlerLookIn => ({
  self: new Vector3(0, 0, 0), ball: new Vector3(0.3, 0.6, 0), rim: RIM, defender: new Vector3(0, 0, -1), window: 'dribble', speed01: 0.1, hasBall: true, dt: DT, ...o,
});
const feed = () => ({ pose: { ...HOOPS_POSTURE.protect }, aim: RIM.clone(), eyes: RIM.clone() as Vector3 | null, window: 'protect' });
const yawDeg = (from: Vector3, to: Vector3) => Math.atan2(to.x - from.x, -(to.z - from.z)) * 180 / Math.PI;   // 0 = toward −z, + = toward +x

describe('the eyes', () => {
  it('sizing him up (a walk or slower, him in front within READ_RANGE_M): the eyes on his chest; the chest stays the mode\'s', () => {
    const l = new HandlerLook().update(at());
    expect(l.reading).toBe('defender');
    const f = l.dress(feed()); f.window = 'dribble';
    expect(f.eyes).toBe(l.eyes); expect(l.eyes.asArray()).toEqual([0, CHEST_Y, -1]);
    expect(f.aim!.equals(RIM)).toBe(true);
  });
  it('a glance at the rim every READ_GLANCE_EVERY_SEC for READ_GLANCE_SEC', () => {
    const l = new HandlerLook(); let rim = 0; const n = Math.round(READ_GLANCE_EVERY_SEC * 3 / DT);
    for (let i = 0; i < n; i++) if (l.update(at()).reading === 'rim') rim++;
    expect(rim * DT).toBeCloseTo(3 * READ_GLANCE_SEC, 1);
  });
  it('the mode\'s own aim and eyes: running, out of range, him behind me (beaten), no ball, no live defender', () => {
    for (const o of [{ speed01: 0.6 }, { defender: new Vector3(0, 0, -(READ_RANGE_M + 0.2)) }, { defender: new Vector3(0, 0, 1) }, { hasBall: false }, { defender: null }] as Partial<HandlerLookIn>[]) {
      const l = new HandlerLook().update(at(o)); const f = feed(); const e = f.eyes;
      expect(l.dress(f).eyes, JSON.stringify(o)).toBe(e);
    }
  });
  it('eyesOnDefenderOn 0: the eyes stay the mode\'s', () => {
    openFeel({ 'hoops.eyesOnDefenderOn': 0 });
    const l = new HandlerLook().update(at()); const f = feed(); const e = f.eyes;
    expect(l.dress(f).eyes).toBe(e);
  });
});

describe('the protect', () => {
  it('the chest turns PROTECT_TURN_DEG off him toward the ball\'s side; the protect stance\'s eyes 0.9 and chest aim 0.8; the eyes on him, no glance', () => {
    for (const side of [1, -1]) {
      const l = new HandlerLook(); let glanced = false;
      for (let i = 0; i < Math.round(READ_GLANCE_EVERY_SEC * 1.5 / DT); i++) { l.update(at({ window: 'protect', speed01: 0, ball: new Vector3(0.3 * side, 0.6, 0) })); if (l.reading !== 'defender') glanced = true; }
      expect(glanced).toBe(false);
      const f = l.dress(feed());
      expect(yawDeg(new Vector3(0, 0, 0), f.aim!)).toBeCloseTo(side * PROTECT_TURN_DEG, 6);
      expect(f.pose.eyes).toBe(PROTECT_EYES); expect(f.pose.chestAim).toBe(PROTECT_CHEST_AIM);
      expect(f.pose.lean).toBe(HOOPS_POSTURE.protect.lean);                          // the rest of the stance is the protect's own
      expect(HOOPS_POSTURE.protect.eyes).toBe(0.6); expect(HOOPS_POSTURE.protect.chestAim).toBe(0);   // the table itself is untouched
    }
  });
  it('a crossing ball does not swing the chest until it is past the hysteresis', () => {
    const l = new HandlerLook();
    l.update(at({ window: 'protect', speed01: 0, ball: new Vector3(0.3, 0.6, 0) }));
    l.update(at({ window: 'protect', speed01: 0, ball: new Vector3(-0.05, 0.6, 0) }));
    expect(yawDeg(new Vector3(0, 0, 0), l.dress(feed()).aim!)).toBeGreaterThan(0);
  });
  it('protectPostureOn 0: the protect feed is the mode\'s (the stance\'s 0.6 / 0)', () => {
    openFeel({ 'hoops.protectPostureOn': 0 });
    const l = new HandlerLook().update(at({ window: 'protect', speed01: 0 }));
    const f = l.dress(feed());
    expect(f.pose.eyes).toBe(0.6); expect(f.pose.chestAim).toBe(0); expect(f.aim!.equals(RIM)).toBe(true);
  });
});

describe('ProtectSink (#380\'s legSink, held)', () => {
  it('stepSink eases in and out', () => {
    let h = 0; for (let i = 0; i < 60; i++) h = stepSink(h, 0.06, DT, 0.18); expect(h).toBeCloseTo(0.06, 3);
    for (let i = 0; i < 120; i++) h = stepSink(h, 0, DT, 0.18); expect(h).toBe(0);
  });
  it('on the node rig: the hips go PROTECT_SINK_M down, the feet and the hands stay; off (protectPostureOn 0) nothing moves', () => {
    for (const on of [true, false]) {
      if (!on) openFeel({ 'hoops.protectPostureOn': 0 });
      const r = hoopsNodeRig('right');
      (r.scene.getEngine() as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
      const hips0 = r.nodes.Hips.position.clone();
      r.scene.onBeforeAnimationsObservable.add(() => { r.nodes.Hips.position.copyFrom(hips0); });   // the clip keys the hips every frame (a hoops loop does)
      const sink = ProtectSink.for(r.scene, r.sk, r.root);
      const keep = ['LeftFoot', 'RightFoot', 'LeftHand', 'RightHand'].map((n) => r.nodes[n]);
      let pre: Vector3[] = [], hipsPre = 0;
      r.scene.onAfterAnimationsObservable.add(() => { pre = keep.map((n) => { n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); }); r.nodes.Hips.computeWorldMatrix(true); hipsPre = r.nodes.Hips.getAbsolutePosition().y; }, undefined, true);
      const frame = () => { r.scene.onBeforeAnimationsObservable.notifyObservers(r.scene); r.scene.onAfterAnimationsObservable.notifyObservers(r.scene); };
      for (let i = 0; i < 30; i++) frame();
      sink.hold(true);
      for (let i = 0; i < 60; i++) frame();
      r.nodes.Hips.computeWorldMatrix(true);
      const drop = hipsPre - r.nodes.Hips.getAbsolutePosition().y;
      if (on) {
        expect(drop).toBeCloseTo(PROTECT_SINK_M, 2); expect(sink.dropNow).toBeCloseTo(PROTECT_SINK_M, 2);
        keep.forEach((n, i) => { n.computeWorldMatrix(true); expect(Vector3.Distance(n.getAbsolutePosition(), pre[i]), n.name).toBeLessThan(0.004); });
      } else expect(Math.abs(drop)).toBeLessThan(1e-6);
      sink.hold(false); for (let i = 0; i < 240; i++) frame(); expect(sink.dropNow).toBe(0);
      r.dispose(); closeFeel();
    }
  });
});
