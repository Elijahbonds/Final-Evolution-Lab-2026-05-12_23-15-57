// hoops-p05 (phase 5): a teammate's pass leaves from the ball, not from root + 1.2 m.
import { afterEach, describe, expect, it } from 'vitest';
import { PASS_FROM_HAND_MAX_M, PASS_ROOT_HEIGHT_M, passCatchPoint, passStart } from './ballHandoff';
import { Vector3 } from '@babylonjs/core';
import { PassFlight } from '../core/BallHandling';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

afterEach(() => resetFeelForTests());
const root = { x: 2, y: 0, z: -1 };

describe('where a teammate\'s pass starts', () => {
  it('from the ball as drawn: the ball in his hand at the hip, or low in the bounce, is where the flight starts (no jump to chest height)', () => {
    for (const ball of [{ x: 2.3, y: 0.95, z: -0.8 }, { x: 2.25, y: 0.2, z: -0.7 }]) {
      const p = passStart(ball, root, true);
      expect(p.x).toBe(ball.x); expect(p.y).toBe(ball.y); expect(p.z).toBe(ball.z);
    }
  });
  it('the old start (root + 1.2 m) for a ball that is not with him, a missing one, or the knob at 0', () => {
    const old = (p: { x: number; y: number; z: number }) => { expect(p.x).toBe(root.x); expect(p.y).toBeCloseTo(root.y + PASS_ROOT_HEIGHT_M, 9); expect(p.z).toBe(root.z); };
    old(passStart({ x: root.x + PASS_FROM_HAND_MAX_M + 0.1, y: 1, z: root.z }, root, true));
    old(passStart(null, root, true));
    old(passStart({ x: NaN, y: 1, z: 0 }, root, true));
    old(passStart({ x: 2.3, y: 0.95, z: -0.8 }, root, false));
  });
  it('knob hoops.passFromHandOn: on by default, 0 gives the old start', () => {
    expect(passStart({ x: 2.3, y: 0.95, z: -0.8 }, root).y).toBe(0.95);
    setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.passFromHandOn', 0);
    expect(passStart({ x: 2.3, y: 0.95, z: -0.8 }, root).y).toBeCloseTo(PASS_ROOT_HEIGHT_M, 9);
  });
});

// hoops-p05b (phase 5): the pass lands on the receiver (PassFlight.homeTo with his live catch point).
describe('a pass in flight lands on the receiver', () => {
  /** A chest pass thrown at `aim`; the receiver's catch point is `live(k)` on each frame (null: never homed). Returns the drawn path. */
  const fly = (aim: Vector3, live: ((i: number) => Vector3 | null) | null, type: 'chest' | 'bounce' = 'chest'): Vector3[] => {
    const f = new PassFlight(); const from = new Vector3(0, 1.0, 0); f.start(from, aim, type, 1);
    const path: Vector3[] = [from.clone()]; const b = from.clone();
    for (let i = 0; i < 200; i++) { if (live) f.homeTo(live(i)); const done = f.step(1 / 60, b); path.push(b.clone()); if (done) break; }
    return path;
  };
  const steps = (p: Vector3[]) => p.slice(1).map((q, i) => Vector3.Distance(q, p[i]));
  const bends = (p: Vector3[]) => p.slice(2).map((q, i) => q.subtract(p[i + 1]).subtract(p[i + 1].subtract(p[i])).length());
  const aim = new Vector3(6, 1.2, 0);
  it('never homed it is the flight as it was, to the bit (the knob at 0 asks nothing)', () => {
    const was = fly(aim, null), still = fly(aim, () => null);
    expect(still.length).toBe(was.length);
    still.forEach((p, i) => { expect(p.x).toBe(was[i].x); expect(p.y).toBe(was[i].y); expect(p.z).toBe(was[i].z); });
  });
  it('a receiver 1.5 m off the lead (and still moving) gets it at his catch point, in the same flight time, on a path that bends smoothly', () => {
    const was = fly(aim, null);
    const live = (i: number) => new Vector3(6 - 0.05 * i, 1.2, 1.5);   // off the lead, drifting back 3 m/s
    const now = fly(aim, live);
    expect(now.length).toBe(was.length);                                         // the flight time is the throw's
    const end = now[now.length - 1], want = live(now.length - 2);
    expect(Vector3.Distance(end, want)).toBeLessThan(1e-9);                      // on him
    expect(Math.max(...steps(now))).toBeLessThan(Math.max(...steps(was)) * 1.6);  // no jump: at most a little faster on the bend
    expect(Math.max(...bends(now))).toBeLessThan(0.12);                          // and no kink (the rig's catch read: ≤ 0.12 m off its own path)
  });
  it('the catch point is his root + the throw\'s own aim height; knob hoops.passHomeOn 0 gives none (the flight lands on its aim)', () => {
    const p = passCatchPoint(root, true)!;
    expect(p.x).toBe(root.x); expect(p.y).toBeCloseTo(root.y + PASS_ROOT_HEIGHT_M, 9); expect(p.z).toBe(root.z);
    expect(passCatchPoint(root, false)).toBeNull();
    expect(passCatchPoint({ x: NaN, y: 0, z: 0 }, true)).toBeNull();
    expect(passCatchPoint(root)).not.toBeNull();
    setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.passHomeOn', 0);
    expect(passCatchPoint(root)).toBeNull();
  });
});

