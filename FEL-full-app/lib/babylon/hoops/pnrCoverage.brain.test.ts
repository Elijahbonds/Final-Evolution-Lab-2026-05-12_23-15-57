// hoops-gap: the pick-and-roll coverage in the real brains — DefenderBrain (core/BasketballCore) and the 3v3 team defence
// (hoops/teamDefense). Off (the default) is the release exactly; on, the man on the ball plays the screen by the handler's range, the
// screener's man shows, the low man tags a free roll man, and the switch waits for the screened man to be beaten.
import { afterEach, describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { DefenderBrain } from '../core/BasketballCore';
import { TeamDefense, teamDTune } from './teamDefense';
import { PNR_SHOW_M, showSpot } from './pnrCoverage';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

const knob = (v: number): void => { setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.pnrCoverageOn', v); };
afterEach(() => resetFeelForTests());
const HOOP = new Vector3(0, 0, -0.6);
const DT = 1 / 60;
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const V = (x: number, z: number) => new Vector3(x, 0, z);

/** Run a brain a few frames with the bodies held still (planted), and return its last read. */
function settle(b: DefenderBrain, self: Vector3, ball: Vector3, allies: Vector3[], foes: Vector3[], frames = 6) {
  let it = b.decide(DT, self, ball, HOOP, allies, foes);
  for (let k = 1; k < frames; k++) it = b.decide(DT, self, ball, HOOP, allies, foes);
  return it;
}

describe('pick-and-roll coverage in the brains (hoops.pnrCoverageOn)', () => {
  // the handler at the top, his man in front of him, the screener planted on that man's shoulder
  const scene = (handlerZ: number) => {
    const handler = V(0, handlerZ), onBall = V(0, handlerZ - 1.25), screener = V(0.85, handlerZ - 1.05);
    const screenerMan = V(1.4, handlerZ - 2.6), lowMan = V(-1.8, 1.2), weak = V(-5.5, 2.5);
    return { handler, onBall, screener, screenerMan, lowMan, weak, foes: [handler, screener, weak], allies: [onBall, screenerMan, lowMan] };
  };

  it('off: no coverage read, and the brain steers exactly as the release does', () => {
    const s = scene(6.6);
    knob(0);
    const a = new DefenderBrain(0.6, 0, seeded(3)); const ia = settle(a, s.onBall, s.handler, s.allies, s.foes);
    resetFeelForTests();
    const b = new DefenderBrain(0.6, 0, seeded(3)); const ib = settle(b, s.onBall, s.handler, s.allies, s.foes);
    expect(a.pnrCoverage).toBeNull();
    expect(ia.moveX).toBeCloseTo(ib.moveX, 12); expect(ia.moveY).toBeCloseTo(ib.moveY, 12);
  });

  it('on: the man on the ball reads the screen — over a shooter in range, under one far out', () => {
    knob(1);
    const near = scene(6.6);
    const a = new DefenderBrain(0.6, 0, seeded(3)); settle(a, near.onBall, near.handler, near.allies, near.foes);
    expect(a.pnrCoverage).toBe('over');
    const far = scene(9.2);
    const b = new DefenderBrain(0.6, 0, seeded(3)); settle(b, far.onBall, far.handler, far.allies, far.foes);
    expect(b.pnrCoverage).toBe('under');
  });

  it('on: the screener\'s man SHOWS into the handler\'s corner (over) and DROPS toward the rim (under)', () => {
    knob(1);
    const s = scene(6.6);
    // the screener's man beside his screening man
    const me = V(1.5, 5.4);
    const allies = [s.onBall, me, s.lowMan];
    const b = new DefenderBrain(0.6, 1, seeded(5)); const it = settle(b, me, s.handler, allies, s.foes);
    expect(b.pnrCoverage).toBe('over'); expect(b.job).toBe('help');
    // he steps toward the show spot (the corner the handler has to turn), not to the rim side of his man
    const sp = showSpot(s.handler, s.screener, HOOP);
    const want = Math.atan2(sp.x - me.x, sp.z - me.z), went = Math.atan2(it.moveX, -it.moveY);
    expect(Math.hypot(it.moveX, it.moveY)).toBeGreaterThan(0.1);
    expect(Math.abs(Math.atan2(Math.sin(want - went), Math.cos(want - went)))).toBeLessThan(0.6);
    // under (far out): he drops, his step toward the rim
    const far = scene(9.2); const meFar = V(1.5, 8.0);
    const c = new DefenderBrain(0.6, 1, seeded(5)); const ic = settle(c, meFar, far.handler, [far.onBall, meFar, far.lowMan], far.foes);
    expect(c.pnrCoverage).toBe('under');
    expect(-ic.moveY).toBeLessThan(0);   // toward the rim (−z)
    void PNR_SHOW_M;
  });

  it('on: the low man tags a free roll man diving at the rim; off, he stays home', () => {
    const ball = V(0, 7);
    const roller = V(0.6, 3.0);
    const me = V(-2.0, 1.0);
    const allies = [V(0.3, 6), V(1.6, 6.2), me];
    const foes = [ball, roller, V(-6, 3)];
    const run = (on: number) => {
      knob(on); const b = new DefenderBrain(0.6, 2, seeded(9));
      b.decide(DT, me, ball, HOOP, allies, foes.map((f, i) => (i === 1 ? f.add(V(0, 0.06)) : f)));   // last frame he was 6 cm up the floor
      const it = b.decide(DT, me, ball, HOOP, allies, foes);
      return { it, tag: b.pnrTag };
    };
    expect(run(1).tag).toBe(true);
    expect(run(0).tag).toBe(false);
    // he steps toward the roll line: to his right (toward the roller), not out to his man in the corner
    expect(run(1).it.moveX).toBeGreaterThan(0);
  });

  it('on: the team defence switches only when the screened man is beaten', () => {
    const v = (onBall: { x: number; z: number }, screener: { x: number; z: number }) => ({ marks: [0, 1, 2], defenders: [onBall, { x: 0.9, z: 5.6 }, { x: -4, z: 2 }], attackers: [{ x: 0.4, z: 6.4 }, screener, { x: -6, z: 3 }], handler: 0, rim: { x: 0, z: -0.6 } });
    const inFront = v({ x: 0, z: 5.3 }, { x: 0.7, z: 5.0 });   // his man still between him and the rim
    const beaten = v({ x: 0, z: 7.4 }, { x: 0.6, z: 6.9 });    // his man hung on the screen, behind him
    knob(0);
    expect(new TeamDefense().step(DT, inFront, teamDTune()).event?.kind).toBe('switch');   // the release: the geometry is enough
    knob(1);
    expect(new TeamDefense().step(DT, inFront, teamDTune()).event).toBeNull();             // still in front of him: no switch
    expect(new TeamDefense().step(DT, beaten, teamDTune()).event?.kind).toBe('switch');    // beaten: switch
  });
});
