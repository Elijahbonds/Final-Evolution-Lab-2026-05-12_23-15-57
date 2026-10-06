// The movement state machine (lane A1): A1 is the only writer of `state`, and every transition in state.ts's table
// happens, including the ones another lane asks for through its own fields (A2's hp → 'ko', stunSec → 'stunned').
import { describe, expect, it } from 'vitest';
import type { MovementState, RailNetwork, WallSegment } from '../contracts';
import { createMovementSystem } from './index';
import { forcedState, isControlled } from './state';
import { fakeWorld, makeActor, Runner } from './testkit';

const rails: RailNetwork = { id: 'r', segments: [{ id: 'r', points: [{ x: 0, y: 1.2, z: 6 }, { x: 0, y: 1.2, z: 30 }], speedBias: 0, switches: [] }] };
const wall: WallSegment = { a: { x: 2, z: -5 }, b: { x: 2, z: 40 }, nx: -1, nz: 0, height: 4 };

function rig() {
  const world = fakeWorld({ rails, walls: [wall] });
  const sys = createMovementSystem({ mountCanFly: true });
  const r = new Runner(world, [sys]);
  const p = world.add(makeActor('p1'));
  return { world, sys, r, p, inp: r.input('p1') };
}
const transitions = (r: Runner) => r.of('state').map((e) => `${e.from}>${e.to}`);

describe('state: what forces a state', () => {
  it('hp at zero is ko, stun is stunned, a mount is riding, and ko outranks stun', () => {
    const a = makeActor('a');
    expect(forcedState(a)).toBeNull();
    a.stunSec = 1; expect(forcedState(a)).toBe('stunned');
    a.stats.hp.cur = 0; expect(forcedState(a)).toBe('ko');
    const b = makeActor('b', 'player', { ridingId: 'm' });
    expect(forcedState(b)).toBe('riding');
    expect((['ground', 'air', 'grind', 'wallrun', 'flight'] as MovementState[]).every(isControlled)).toBe(true);
    expect((['stunned', 'ko', 'riding'] as MovementState[]).some(isControlled)).toBe(false);
  });
});

describe('state: every transition', () => {
  it('ground > air > ground (a jump and a landing), with state events and the clock reset', () => {
    const { r, p } = rig();
    r.tick(10);
    expect(p.stateSec).toBeCloseTo(10 / 60);
    r.press('p1', 'jump'); r.tick();
    expect(p.state).toBe('air');
    expect(p.stateSec).toBeLessThan(0.02);
    r.runUntil(() => p.state === 'ground', 2);
    expect(transitions(r)).toEqual(['ground>air', 'air>ground']);
  });

  it('air > grind > air (catch, jump off)', () => {
    const { r, p, inp } = rig();
    inp.move.y = 1; r.runUntil(() => p.pos.z > 2.5, 2);
    r.press('p1', 'jump'); inp.jumpHeld = true;
    r.runUntil(() => p.state === 'grind', 2);
    r.press('p1', 'jump'); r.tick();
    expect(transitions(r).slice(0, 3)).toEqual(['ground>air', 'air>grind', 'grind>air']);
  });

  it('ground > grind (a rail at the feet), and air > wallrun > air', () => {
    const low: RailNetwork = { id: 'low', segments: [{ id: 'l', points: [{ x: 0, y: 0, z: 2 }, { x: 0, y: 0.3, z: 20 }], speedBias: 0, switches: [] }] };
    const world = fakeWorld({ rails: low });
    const sys = createMovementSystem();
    const r = new Runner(world, [sys]);
    const p = world.add(makeActor('p1'));
    r.input('p1').move.y = 1;
    r.runUntil(() => p.state === 'grind', 2);
    expect(p.state).toBe('grind');
    const w = rig();
    w.p.pos = { x: 1, y: 0.8, z: 0 }; w.p.vel = { x: 4, y: 1, z: 9 }; w.p.grounded = false; w.p.state = 'air';
    w.r.press('p1', 'jump'); w.r.tick();
    w.r.runUntil(() => w.p.state === 'air', 2);
    expect(transitions(w.r)).toEqual(['air>wallrun', 'wallrun>air']);
  });

  it('air > flight > ground (fused take-off and landing), flight > air when the fusion ends', () => {
    const { r, p, inp } = rig();
    p.fusion = { active: true, tier: 1, meter: 1, remainingSec: 30, partnerId: 'x', element: 'wind', grantsFlight: true };
    r.press('p1', 'jump'); r.tick(8);
    r.press('p1', 'jump'); r.tick();
    expect(p.state).toBe('flight');
    expect(p.wantsFlight).toBe(true);
    inp.descendHeld = true;
    r.runUntil(() => p.state !== 'flight', 3);
    expect(p.state).toBe('ground');
    expect(p.wantsFlight).toBe(false);
    inp.descendHeld = false;
    r.press('p1', 'jump'); r.tick(8); r.press('p1', 'jump'); r.tick(20);
    expect(p.state).toBe('flight');
    p.fusion.active = false;                              // A3 ends the fusion
    r.tick();
    expect(p.state).toBe('air');
    expect(transitions(r)).toEqual(['ground>air', 'air>flight', 'flight>ground', 'ground>air', 'air>flight', 'flight>air']);
  });

  it('any > stunned > ground, from A2\'s stunSec; a stun on a rail leaves the rail', () => {
    const { r, p, inp } = rig();
    inp.move.y = 1; r.runUntil(() => p.pos.z > 2.5, 2);
    r.press('p1', 'jump'); inp.jumpHeld = true;
    r.runUntil(() => p.state === 'grind', 2);
    expect(p.state).toBe('grind');
    p.stunSec = 0.5;
    r.tick();
    expect(p.state).toBe('stunned');
    expect(p.rail).toBeNull();
    expect(r.of('rail:exit').map((e) => e.reason)).toEqual(['hit']);
    inp.move.x = 1;                                       // no control while stunned
    const x0 = p.pos.x;
    r.run(0.3);
    expect(Math.abs(p.pos.x - x0)).toBeLessThan(0.05);
    p.stunSec = 0;                                        // A2 counts it down
    r.runUntil(() => p.state === 'ground' || p.state === 'air', 1);
    r.runUntil(() => p.state === 'ground', 2);
    expect(p.state).toBe('ground');
  });

  it('any > ko from A2\'s hp, flight drops, and a revive (A3 restores hp) stands back up', () => {
    const { r, p } = rig();
    p.fusion = { active: true, tier: 1, meter: 1, remainingSec: 30, partnerId: 'x', element: 'wind', grantsFlight: true };
    r.press('p1', 'jump'); r.tick(8); r.press('p1', 'jump'); r.tick(30);
    expect(p.state).toBe('flight');
    p.stats.hp.cur = 0;
    r.tick();
    expect(p.state).toBe('ko');
    expect(p.wantsFlight).toBe(false);
    r.runUntil(() => p.grounded, 3);
    expect(p.grounded).toBe(true);
    expect(p.state).toBe('ko');                           // falls and stays down
    p.stats.hp.cur = 40;
    r.tick();
    expect(p.state).toBe('ground');
  });

  it('ground > riding > air (mount, dismount)', () => {
    const { world, r, p } = rig();
    const m = world.add(makeActor('m', 'partner', { pos: { x: 1, y: 0, z: 0 }, height: 1.6 }));
    p.partnerId = 'm'; m.partnerId = 'p1';
    r.press('p1', 'fuse'); r.tick();
    expect(p.state).toBe('riding');
    r.press('p1', 'fuse'); r.tick();
    expect(p.state).toBe('air');
    expect(transitions(r)).toEqual(['ground>riding', 'riding>air']);
  });
});
