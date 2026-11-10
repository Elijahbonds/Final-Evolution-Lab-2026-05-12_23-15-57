// hoops-p05 (phase 5): a teammate's pass leaves from the ball, not from root + 1.2 m.
import { afterEach, describe, expect, it } from 'vitest';
import { PASS_FROM_HAND_MAX_M, PASS_ROOT_HEIGHT_M, passStart } from './ballHandoff';
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
