// Riding your partner (lane A1): who can carry, the mount verb (and when fusion owns the button), riding moves you
// with it every tick, the mount's own speed from its PartnerDef, flying on a flyer (and only a flyer), its stamina,
// and the ways off: the button, a big knock, a downed mount.
import { describe, expect, it } from 'vitest';
import type { AdventureActor, PartnerDef } from '../contracts';
import { createMovementSystem, type MovementSystemOptions } from './index';
import { mountReason, mountSpecFromPartner } from './riding';
import { fakeWorld, makeActor, Runner } from './testkit';

const creature = (stage: number, speed = 50): PartnerDef => ({
  id: 'm', kind: 'creature', name: '[PLACEHOLDER] PARTNER', element: 'wind', bond: 20, moves: [],
  attrs: { strength: 30, speed, endurance: 40, agility: 30, power: 30, flexibility: 30, recovery: 30, mental: 30 },
  creature: { speciesId: 'placeholder-flyer', stage, rideableAtStage: 1, flyableAtStage: 2 },
});

function rig(def: PartnerDef, opts: MovementSystemOptions = {}) {
  const world = fakeWorld();
  const spec = mountSpecFromPartner(def);
  const sys = createMovementSystem({ mountSpecOf: (id) => (id === 'm' ? spec : null), ...opts });
  const r = new Runner(world, [sys]);
  const p = world.add(makeActor('p1', 'player', { partnerId: 'm' }));
  const m = world.add(makeActor('m', 'partner', { pos: { x: 1.2, y: 0, z: 0 }, partnerId: 'p1', height: 1.6 }));
  return { world, sys, r, p, m, spec, inp: r.input('p1') };
}
const seatCheck = (p: AdventureActor, m: AdventureActor, seat: number) => {
  expect(p.pos.x).toBeCloseTo(m.pos.x, 9);
  expect(p.pos.z).toBeCloseTo(m.pos.z, 9);
  expect(p.pos.y).toBeCloseTo(m.pos.y + seat, 9);
  expect(p.vel).toEqual(m.vel);
};

describe('riding: who carries', () => {
  it('a creature from its rideable stage, flying from its flyable stage; a built character never', () => {
    expect(mountSpecFromPartner(creature(0)).canRide).toBe(false);
    expect(mountSpecFromPartner(creature(1))).toMatchObject({ canRide: true, canFly: false });
    expect(mountSpecFromPartner(creature(2))).toMatchObject({ canRide: true, canFly: true });
    const ch: PartnerDef = { ...creature(2), kind: 'character', creature: undefined, character: { creatorSlotId: 's1' } };
    expect(mountSpecFromPartner(ch).canRide).toBe(false);
    expect(mountSpecFromPartner(creature(1, 100)).groundSpeed).toBeCloseTo(14);
    expect(mountSpecFromPartner(creature(1, 0)).groundSpeed).toBeCloseTo(10);
  });

  it('the mount verb needs a carrier, in reach, not down or taken, and loses to a full fusion meter', () => {
    const p = makeActor('p'), m = makeActor('m', 'partner', { pos: { x: 1, y: 0, z: 0 } });
    const ok = mountSpecFromPartner(creature(1));
    expect(mountReason(p, m, ok, 2.5, null)).toBe('ok');
    expect(mountReason(p, m, mountSpecFromPartner(creature(0)), 2.5, null)).toBe('cannot');
    expect(mountReason(p, { ...m, pos: { x: 4, y: 0, z: 0 } }, ok, 2.5, null)).toBe('far');
    expect(mountReason(p, m, ok, 2.5, 'someone')).toBe('busy');
    expect(mountReason({ ...p, fusion: { ...p.fusion, meter: 1 } }, m, ok, 2.5, null)).toBe('fusing');
    const down = makeActor('m', 'partner'); down.stats.hp.cur = 0;
    expect(mountReason(p, down, ok, 2.5, null)).toBe('down');
  });
});

describe('riding: the mount moves you with it', () => {
  it('mounted, your stick drives the mount at ITS speed and you ride on its back, every tick', () => {
    const { r, p, m, spec, inp } = rig(creature(1, 100));
    r.press('p1', 'fuse'); r.tick();
    expect(p.state).toBe('riding');
    expect(p.ridingId).toBe('m');
    expect(r.of('mount')).toEqual([{ riderId: 'p1', mountId: 'm', on: true }]);
    r.input('m').move.x = 1;                              // the partner brain's own wish is ignored while ridden
    inp.move.y = 1; inp.camYaw = 0.6;
    r.run(4, () => { if (r.tSec > 0.05) seatCheck(p, m, spec.seatHeight); });
    seatCheck(p, m, spec.seatHeight);
    expect(Math.hypot(m.vel.x, m.vel.z)).toBeCloseTo(spec.groundSpeed, 1);
    expect(Math.atan2(m.vel.x, m.vel.z)).toBeCloseTo(0.6, 2);
    expect(Math.hypot(m.pos.x, m.pos.z)).toBeGreaterThan(40);
    expect(p.facingYaw).toBeCloseTo(m.facingYaw, 6);
  });

  it('when something else moves the mount (a knock), the rider still goes with it', () => {
    const { r, p, m, spec } = rig(creature(1));
    r.press('p1', 'fuse'); r.tick();
    m.impulse = { x: 0, y: 6, z: 3 };
    r.tick(10);
    seatCheck(p, m, spec.seatHeight);
    expect(m.pos.y).toBeGreaterThan(0.5);
  });

  it('a non-flying mount jumps but never flies', () => {
    const { r, p, m, inp } = rig(creature(1), { mountCanFly: true });
    r.press('p1', 'fuse'); r.tick();
    r.press('p1', 'jump'); inp.jumpHeld = true; r.tick(8);
    r.press('p1', 'jump'); r.tick(30);
    expect(m.state).not.toBe('flight');
    expect(p.wantsFlight).toBe(false);
  });

  it('on a flyer: jump, jump again and it takes off with you; it spends its own stamina; you land together', () => {
    const { r, p, m, sys, spec, inp } = rig(creature(2));
    r.press('p1', 'fuse'); r.tick();
    r.press('p1', 'jump'); inp.jumpHeld = true; r.tick(8);
    r.press('p1', 'jump'); r.tick();
    expect(m.state).toBe('flight');
    expect(p.state).toBe('riding');
    r.tick();
    expect(p.wantsFlight).toBe(true);
    const staminaAtStart = sys.inspect('m')!.mountStamina01!;
    r.run(2);                                               // ascend held (jump held): climbing
    seatCheck(p, m, spec.seatHeight);
    expect(m.pos.y).toBeGreaterThan(8);
    expect(sys.inspect('m')!.mountStamina01!).toBeLessThan(staminaAtStart);
    expect(p.stats.energy.cur).toBe(100);                   // a mount's flight costs the RIDER nothing
    inp.jumpHeld = false; inp.descendHeld = true;
    r.runUntil(() => m.state === 'ground', 5);
    expect(m.state).toBe('ground');
    r.tick();
    expect(p.wantsFlight).toBe(false);
    seatCheck(p, m, spec.seatHeight);
  });

  it('a flyer out of stamina glides down and lands', () => {
    const { r, m, inp } = rig(creature(2));
    r.press('p1', 'fuse'); r.tick();
    r.press('p1', 'jump'); inp.jumpHeld = true; r.tick(8);
    r.press('p1', 'jump'); r.tick();
    r.run(1.5);
    // a long hold of the burst drains it
    inp.dashHeld = true;
    for (let i = 0; i < 10; i++) { r.press('p1', 'dash'); r.run(0.4); }
    inp.dashHeld = false;
    expect(r.runUntil(() => m.state === 'ground', 30)).toBe(true);
  });
});

describe('riding: the ways off', () => {
  it('the button again: a hop to the side, keeping the mount\'s speed', () => {
    const { r, p, m, inp } = rig(creature(1));
    r.press('p1', 'fuse'); r.tick();
    inp.move.y = 1; r.run(2);
    r.press('p1', 'fuse'); r.tick();
    expect(p.ridingId).toBeNull();
    expect(p.state).toBe('air');
    expect(p.vel.y).toBeGreaterThan(4);
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeGreaterThan(8);
    expect(r.of('mount').map((e) => e.on)).toEqual([true, false]);
    inp.move.y = 0;
    r.runUntil(() => p.state === 'ground', 2);
    expect(Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z)).toBeGreaterThan(0.5);
  });

  it('a big knock throws you off; a small one is absorbed; a downed mount drops you', () => {
    const a = rig(creature(1));
    a.r.press('p1', 'fuse'); a.r.tick();
    a.p.impulse = { x: 1, y: 1, z: 0 }; a.r.tick();
    expect(a.p.state).toBe('riding');
    a.p.impulse = { x: 8, y: 3, z: 0 }; a.r.tick();
    expect(a.p.state).toBe('air');
    const b = rig(creature(1));
    b.r.press('p1', 'fuse'); b.r.tick();
    b.m.stats.hp.cur = 0; b.r.tick();
    expect(b.p.ridingId).toBeNull();
    expect(b.p.state).toBe('air');
  });

  it('a flyer dismounted in the air: you fall (unfused), it drops too', () => {
    const { r, p, m, inp } = rig(creature(2));
    r.press('p1', 'fuse'); r.tick();
    r.press('p1', 'jump'); inp.jumpHeld = true; r.tick(8);
    r.press('p1', 'jump'); r.run(1);
    r.press('p1', 'fuse'); r.tick(2);
    expect(p.state).toBe('air');
    expect(m.state).toBe('air');
    r.runUntil(() => p.state === 'ground' && m.state === 'ground', 5);
    expect(p.state).toBe('ground');
  });
});
