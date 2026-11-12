// lane/h3-handler (#312 port, anim/RestDribble): the dribble at rest — the bounce locked to the clip's own ball hand, the rest tempo, the
// protect's guard — each with its 0/1 feel knob reading back exactly the old behaviour.
import { afterEach, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { TransformNode } from '@babylonjs/core';
import { hoopsNodeRig } from '../../../tests/helpers/hoopsNodeRig';
import { openFeel, closeFeel } from '../../../tests/helpers/feelOverrides';
import { ClipHandClock, clipLockTune, restTempoFor, protectClip, protectDribbles, guardTune, stepGuardK, REST_TEMPO_IDLE, REST_TEMPO_PROTECT, CLIP_LOCK_GAIN, CLIP_LOCK_HZ_MAX, GUARD_BACK_M, GUARD_OUT_M } from './RestDribble';
import { strideLockHz, HOOPS_DRIBBLE } from './Dribble';

const DT = 1 / 60;
afterEach(() => closeFeel());

describe('the knobs read back the old behaviour at 0', () => {
  it('defaults: the protect dribbles, the rest tempo 1.2 / 1.45, the clip lock gain 3 under 2.6 Hz, the guard on', () => {
    expect(protectClip('dribble', 'stance')).toBe('dribble'); expect(protectDribbles()).toBe(true);
    expect(restTempoFor('idle_dribble')).toBe(REST_TEMPO_IDLE); expect(restTempoFor('protect')).toBe(REST_TEMPO_PROTECT);
    expect(restTempoFor('walk_dribble')).toBeNull(); expect(restTempoFor('defend_idle')).toBeNull();
    expect(clipLockTune()).toEqual({ gain: CLIP_LOCK_GAIN, hzMax: CLIP_LOCK_HZ_MAX, maxMps: 0.4 });
    expect(guardTune().on).toBe(true);
  });
  it('off: the stance, no tempo, no lock, no guard', () => {
    openFeel({ 'hoops.protectDribbleOn': 0, 'hoops.restBounceOn': 0, 'hoops.protectGuardOn': 0 });
    expect(protectClip('dribble', 'stance')).toBe('stance');
    expect(restTempoFor('idle_dribble')).toBeNull(); expect(restTempoFor('protect')).toBeNull();
    expect(clipLockTune()).toBeNull(); expect(guardTune().on).toBe(false);
  });
  it('the protect\'s tempo is the dribble\'s only: with the stance back (protectDribbleOn 0) the stance keeps its pace', () => {
    openFeel({ 'hoops.protectDribbleOn': 0 });
    expect(restTempoFor('idle_dribble')).toBe(REST_TEMPO_IDLE); expect(restTempoFor('protect')).toBeNull();
  });
  it('the guard eases on at rest and off on the move', () => {
    let k = 0; for (let i = 0; i < 30; i++) k = stepGuardK(k, 1, 0, DT, 0.15); expect(k).toBeGreaterThan(0.95);
    for (let i = 0; i < 30; i++) k = stepGuardK(k, 1, 0.5, DT, 0.15); expect(k).toBeLessThan(0.05);
  });
});

describe('ClipHandClock: the bounce locks to the clip hand\'s tops', () => {
  it('a hand bobbing at 1.56 Hz: the locked bounce runs at 1.56 Hz and meets the hand at its top (phase 0)', () => {
    const f = 1.56, c = new ClipHandClock(), t = clipLockTune()!;
    let phase = 0.37, clock = 0; const atTop: number[] = [];
    for (let i = 0; i < 600; i++) {
      clock += DT;
      const y = 0.9 + 0.1 * Math.cos(2 * Math.PI * f * clock);
      c.sample('Left', y, clock, DT);
      const hz = c.hz(phase, clock, t, strideLockHz) || HOOPS_DRIBBLE.hzIdle;
      phase = (phase + hz * DT) % 1;
      const k = f * clock; if (i > 300 && Math.abs(k - Math.round(k)) < f * DT / 2) atTop.push(phase);
    }
    expect(c.periodSec).toBeCloseTo(1 / f, 1);
    expect(atTop.length).toBeGreaterThan(2);
    for (const ph of atTop) expect(Math.abs(ph - Math.round(ph))).toBeLessThan(0.06);
  });
  it('no clip read (y null: the hand where the carry drew it) never counts a top; a new hand starts over', () => {
    const c = new ClipHandClock();
    for (let i = 0; i < 200; i++) c.sample('Left', null, i * DT, DT);
    expect(c.count).toBe(0);
    for (let i = 0; i < 200; i++) c.sample('Left', 0.9 + 0.1 * Math.cos(2 * Math.PI * 1.5 * i * DT), i * DT, DT);
    expect(c.count).toBeGreaterThan(2);
    c.sample('Right', 0.9, 200 * DT, DT); expect(c.count).toBe(0);
    c.sample(null, null, 201 * DT, DT); expect(c.count).toBe(0);
  });
});

/** The athlete-right ball arm (the rig's LeftArm) swung forward and back at `f` Hz — the hand peaks once a bounce, like a dribble clip. */
const bob = (f: number) => { let t = 0; return (n: Record<string, TransformNode>) => { t += DT; n.LeftArm.rotationQuaternion = n.LeftArm.rotationQuaternion!.multiply(Quaternion.RotationAxis(Vector3.Right(), -(0.6 + 0.35 * Math.cos(2 * Math.PI * f * t)))); }; };
/** Bounces (phase wraps) over `sec` at rest. */
function bounces(r: ReturnType<typeof hoopsNodeRig>, sec: number): number {
  let w = 0, last = r.carry.phase;
  for (let i = 0; i < Math.round(sec / DT); i++) { r.frame(DT, 0); if (r.carry.phase < last) w++; last = r.carry.phase; }
  return w;
}

describe('on the node rig: the carry\'s bounce at rest', () => {
  it('locks to the clip\'s hand (1.56 Hz) instead of its own 1.7 Hz clock; off (restBounceOn 0) it keeps its own clock', () => {
    const on = hoopsNodeRig('right', bob(1.56));
    bounces(on, 2);
    const k = bounces(on, 12); expect(k).toBeGreaterThanOrEqual(18); expect(k).toBeLessThanOrEqual(19);   // 1.56 × 12 = 18.7
    on.dispose();
    openFeel({ 'hoops.restBounceOn': 0 });
    const off = hoopsNodeRig('right', bob(1.56));
    bounces(off, 2);
    const n = bounces(off, 12); expect(n).toBeGreaterThanOrEqual(20); expect(n).toBeLessThanOrEqual(21);   // 1.7 × 12 = 20.4
    off.dispose();
  });
  it('a clip hand that does not move, or an arm nothing re-poses (the reach\'s own motion), never locks the bounce to itself', () => {
    const still = hoopsNodeRig('right');
    bounces(still, 2); const n = bounces(still, 12); expect(n).toBeGreaterThanOrEqual(20); expect(n).toBeLessThanOrEqual(21);
    still.dispose();
    const free = hoopsNodeRig('right');
    free.scene.onBeforeAnimationsObservable.clear();   // nothing re-poses the arm: it stays where the carry's reach drew it
    bounces(free, 2); const m = bounces(free, 12); expect(m).toBeGreaterThanOrEqual(20); expect(m).toBeLessThanOrEqual(21);
    free.dispose();
  });
});

describe('on the node rig: the protect\'s guard (setGuard)', () => {
  /** The ball's mean root-local position over two bounces at rest, and the off hand (the rig's RightHand) at the end. */
  const read = (guard: number) => {
    const r = hoopsNodeRig('right');
    r.carry.setGuard(guard);
    for (let i = 0; i < 90; i++) r.frame(DT, 0);
    const acc = new Vector3(); let n = 0;
    for (let i = 0; i < 80; i++) { acc.addInPlace(r.local(r.frame(DT, 0))); n++; }
    r.nodes.RightHand.computeWorldMatrix(true);
    const off = r.local(r.nodes.RightHand.getAbsolutePosition().clone());
    r.dispose();
    return { ball: acc.scale(1 / n), off };
  };
  it('the bounce goes GUARD_BACK_M back beside the hip and GUARD_OUT_M wider; the off hand comes across the front toward the bar', () => {
    const a = read(0), b = read(1);
    expect(b.ball.z - a.ball.z).toBeCloseTo(-GUARD_BACK_M, 2);
    expect(b.ball.x - a.ball.x).toBeCloseTo(GUARD_OUT_M, 2);   // the athlete's right hand: wider = +x
    const bar = new Vector3(0.15, 1.0, 0.34);
    expect(Vector3.Distance(b.off, bar)).toBeLessThan(Vector3.Distance(a.off, bar) - 0.1);
    expect(b.off.z).toBeGreaterThan(a.off.z + 0.1);   // in front of the body
  });
  it('protectGuardOn 0: setGuard changes nothing (the ball path is the unguarded one)', () => {
    openFeel({ 'hoops.protectGuardOn': 0 });
    const a = read(0), b = read(1);
    expect(Vector3.Distance(a.ball, b.ball)).toBeLessThan(1e-9);
    expect(Vector3.Distance(a.off, b.off)).toBeLessThan(1e-9);
  });
});
