// hoops-gap: the roll man (hoops/screenerRoll) — the screener reads his own man, the planner looks for the roll.
import { afterEach, describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { SCREENER_ROLL_ON, screenerRollOn, screenersMan, manSteppedUp, nearLaneClear, rollRead, ROLL_NEAR_M } from './screenerRoll';
import { TeammateBrain } from '../core/BasketballCore';
import { TeamOffense3v3 } from './teamOffense3v3';
import { TEAM_READS } from '../modes/threevthreeRules';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

const knob = (v: number): void => { setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.screenerRollOn', v); };
afterEach(() => resetFeelForTests());
const RIM = { x: 0, z: -0.6 };

describe('hoops/screenerRoll', () => {
  it('ships off, and the knob turns it on', () => {
    expect(SCREENER_ROLL_ON).toBe(0); expect(screenerRollOn()).toBe(false);
    knob(1); expect(screenerRollOn()).toBe(true);
  });
  it('his own man is the defender nearest him that he is not screening', () => {
    const self = { x: 1, z: 5 }, screened = { x: 0.2, z: 5.2 };
    expect(screenersMan(self, screened, [screened, { x: 1.2, z: 3.8 }, { x: -3, z: 1 }])).toBe(1);
  });
  it('his man stepped up: level with him or behind, or nearer the ball than him; in front of him on his line, not', () => {
    const self = { x: 1, z: 5 }, handler = { x: 0, z: 6.6 };
    expect(manSteppedUp(self, { x: 1.2, z: 3.9 }, handler, RIM)).toBe(false);   // between him and the rim: home
    expect(manSteppedUp(self, { x: 0.4, z: 5.6 }, handler, RIM)).toBe(true);    // up at the ball (a show)
    expect(manSteppedUp(self, { x: 2.0, z: 5.1 }, handler, RIM)).toBe(true);    // level with him
  });
  it('the near lane: only the first ROLL_NEAR_M of his line counts — the help at the rim does not stop the roll', () => {
    const self = { x: 1, z: 5 };
    expect(nearLaneClear(self, RIM, [{ x: 0.2, z: 0 }])).toBe(true);           // the low man under the rim
    expect(nearLaneClear(self, RIM, [{ x: 0.9, z: 3.8 }])).toBe(false);        // his man a step in front of him
    expect(ROLL_NEAR_M).toBeLessThan(Math.hypot(1, 5.6));
  });
  it('the read: roll and slip when his man has gone to the ball', () => {
    const self = { x: 1, z: 5 }, handler = { x: 0, z: 6.6 }, screened = { x: 0.2, z: 5.4 };
    expect(rollRead(self, handler, RIM, [screened, { x: 0.4, z: 5.9 }, { x: 0.1, z: 0.2 }], screened)).toEqual({ roll: true, slip: true });
    expect(rollRead(self, handler, RIM, [screened, { x: 1.0, z: 3.9 }, { x: 0.1, z: 0.2 }], screened)).toEqual({ roll: false, slip: false });
  });

  it('in the brain: off, a screener with the low man at the rim pops; on, with his man stepped up, he slips and rolls', () => {
    const run = (on: number) => {
      knob(on);
      const b = new TeammateBrain(0.4); b.setJob('screen');
      const self = new Vector3(0.7, 0, 5.2); const ball = new Vector3(0, 0, 6.6);
      // the handler's man (screened) in front of the handler (the defender nearest him); my man up level with the ball (a show); the
      // low man under the rim
      const foes = [new Vector3(0.1, 0, 5.8), new Vector3(1.1, 0, 6.6), new Vector3(0.1, 0, 0.3)];
      const phases: string[] = [];
      for (let k = 0; k < 120; k++) {
        const it = b.decide(1 / 60, self, ball, new Vector3(0, 0, -0.6), [ball, self], foes);
        if (b.screen.phase === 'approach') { self.x += it.moveX * 0.02; self.z -= it.moveY * 0.02; }
        phases.push(b.screen.phase);
      }
      return phases;
    };
    const off = run(0), on = run(1);
    expect(off.includes('roll')).toBe(false);
    expect(on.includes('roll')).toBe(true);
    // the slip: he goes before the 1.2 s hold is up
    const setAt = on.indexOf('set'), rollAt = on.indexOf('roll');
    expect(setAt).toBeGreaterThanOrEqual(0);
    expect((rollAt - setAt) / 60).toBeLessThan(1.2);
  });

  it('the planner: on, the handler finds the open roll man more often than the release does', () => {
    // twenty possessions a side: the screen the planner calls is set 0.5 s after the call and rolls 0.6 s later, the roll man diving
    // from the elbow; a pass thrown to him while he rolls is counted
    const rollPasses = (on: number) => {
      knob(on); let n = 0;
      for (let seed = 1; seed <= 20; seed++) {
        let st = seed; const rng = () => { st = (st * 1664525 + 1013904223) % 4294967296; return st / 4294967296; };
        const team = new TeamOffense3v3('pro', TEAM_READS, rng);
        team.beginPossession(); team.beginTouch({ fresh: true, intent: 'around' });
        const h = { x: 0.3, z: 7.4 }; const roller = { x: 1.2, z: 5.6 }; const mates = [roller, { x: -6, z: 2 }];
        let called = -1, calledAt = 0;
        for (let t = 0; t < 12; t += 1 / 60) {
          const since = t - calledAt;
          const phase = called < 0 ? null : since < 0.5 ? 'approach' : since < 1.1 ? 'set' : since < 2.7 ? 'roll' : 'done';
          if (phase === 'roll') { roller.x += (0 - roller.x) * 0.03; roller.z += (-0.2 - roller.z) * 0.03; }
          // his man stepped up to the ball (up at the top), the weak side far: once he dives, the roll man is open
          const defenders = [{ x: 0.6, z: 6.3 }, { x: 1.5, z: 6.9 }, { x: -5.5, z: 1.8 }];
          const s = team.step(1 / 60, { handler: h, handlerVel: { x: 0, z: 0 }, mates, defenders, rim: RIM, screen: called < 0 ? null : { idx: called, phase: phase as 'roll', at: mates[called] } });
          if (s.callScreen >= 0 && called < 0) { called = s.callScreen; calledAt = t; }
          if (s.pass >= 0) { if (phase === 'roll' && s.pass === called) n++; break; }
          if (s.release) break;
          h.x += s.wish.x / 60; h.z += s.wish.z / 60;
        }
      }
      return n;
    };
    const on = rollPasses(1), off = rollPasses(0);
    expect(off).toBe(0);           // the release: his own man was not in his lane, so no roll pass
    expect(on).toBeGreaterThanOrEqual(8);   // measured: 9 of the 9 screens called in 20 seeds
  });
});
