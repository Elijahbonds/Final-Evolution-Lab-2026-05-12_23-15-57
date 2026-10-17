// H3b (owner 2026-10-16: "idle dribbling felt off"): the on-ball PRESS settles a reach off a standing handler and never walks into him.
// Before, the press point was a lever of the ball's way to the rim lifted toward the rim's height, the steer's dead zone never closed,
// and the 1v1 rival crept on to 0.85 m root to root — the torsos interpenetrating on 197 frames of the hold take (_hoops-motion-probe
// hero_1v1_hold, h3b-base2; 0 after).
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { DefenderBrain } from './BasketballCore';

const DT = 1 / 60, RUN = 3.5;
const HOOP = new Vector3(0, 3.05, -0.6);
const flat = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
/** A handler standing at `at` with the ball at his hip; the defender starts `start` m toward the rim and moves at RUN with his intent. */
function standOff(at: Vector3, start: number, sec = 4) {
  const brain = new DefenderBrain(0.6, null, () => 0.99);   // (no poke rolls)
  const toRim = HOOP.subtract(at); toRim.y = 0; toRim.normalize();
  const self = at.add(toRim.scale(start)); self.y = 0;
  const ball = at.add(new Vector3(0.3, 0.9, 0));
  const rows: { t: number; d: number; ahead: number }[] = [];
  for (let t = 0; t < sec; t += DT) {
    const i = brain.decide(DT, self, ball, HOOP, [], [at]);
    self.addInPlace(new Vector3(i.moveX, 0, -i.moveY).scale(RUN * DT));
    const off = self.subtract(at); off.y = 0;
    rows.push({ t, d: flat(self, at), ahead: Vector3.Dot(off, toRim) });
  }
  return rows;
}

describe('DefenderBrain — the press keeps PRESS_GAP off a standing handler (H3b)', () => {
  for (const [label, at] of [['the arc', new Vector3(0, 0, 6.5)], ['the wing', new Vector3(4.5, 0, 3.5)], ['the elbow', new Vector3(-1.8, 0, 3.2)]] as const) {
    it(`at ${label}: in to about a reach once the press arms, between him and the rim, never inside him`, () => {
      const rows = standOff(at, 2.4);
      const settled = rows.filter((r) => r.t > DefenderBrain.PRESS_AFTER_SEC + 1.5);
      for (const r of settled) { expect(r.d).toBeGreaterThan(DefenderBrain.PRESS_GAP - 0.1); expect(r.d).toBeLessThan(DefenderBrain.PRESS_GAP + 0.25); expect(r.ahead).toBeGreaterThan(0.8); }
      expect(Math.min(...rows.map((r) => r.d))).toBeGreaterThan(0.9);
    });
  }
  it('a defender who starts inside the gap backs out to it', () => {
    const rows = standOff(new Vector3(0, 0, 6.5), 0.6);
    expect(rows[rows.length - 1].d).toBeGreaterThan(DefenderBrain.PRESS_GAP - 0.1);
  });
});
