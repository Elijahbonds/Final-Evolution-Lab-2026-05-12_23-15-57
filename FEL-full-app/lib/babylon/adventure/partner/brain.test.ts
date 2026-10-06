// A3 partner brain (docs/ADVENTURE-PLAN.md A3): it emits ONLY a MoveInput, a valid one in every situation; it follows,
// assists the player's lock (closing in, striking on a cadence with a heavy every third), guards, and runs to a downed
// player and stands inside the revive range.
import { describe, expect, it } from 'vitest';
import { REVIVE_RANGE } from '@/lib/babylon/core/OnslaughtCore';
import { NEUTRAL_MOVE_INPUT, wishDir, type AdventureActor, type MoveInput } from '../contracts';
import {
  ATTACK_RANGE_M, HEAVY_EVERY, LOW_STAMINA_FRAC, PARTNER_COMMANDS, PartnerBrain, REVIVE_STAND_M,
  copyMoveInput, seededRandom, type PartnerCommand,
} from './brain';
import { makeActor, makeRig } from './testRig';

const KEYS = Object.keys(NEUTRAL_MOVE_INPUT).sort();

/** A MoveInput is valid: exactly the contract's keys, sticks in −1..1 and finite, booleans boolean, slot null / 0..3. */
function expectValid(m: MoveInput): void {
  expect(Object.keys(m).sort()).toEqual(KEYS);
  for (const v of [m.move.x, m.move.y, m.look.x, m.look.y, m.lean, m.camYaw]) expect(Number.isFinite(v)).toBe(true);
  expect(Math.hypot(m.move.x, m.move.y)).toBeLessThanOrEqual(1 + 1e-9);
  expect(Math.abs(m.lean)).toBeLessThanOrEqual(1);
  for (const k of ['jump', 'jumpHeld', 'dash', 'dashHeld', 'attackLight', 'attackHeavy', 'lock', 'guardHeld', 'magic', 'magicHeld', 'focusHeld', 'partner', 'fuse', 'ascendHeld', 'descendHeld'] as const) {
    expect(typeof m[k]).toBe('boolean');
  }
  expect(m.magicSlot === null || (Number.isInteger(m.magicSlot) && m.magicSlot >= 0 && m.magicSlot < 4)).toBe(true);
  expect(m.fuse).toBe(false);      // the brain never fuses: that is the player's call
  expect(m.partner).toBe(false);
  expect(!(m.attackLight && m.attackHeavy)).toBe(true);
}

/** Where the brain's stick points, in world XZ. */
const aim = (m: MoveInput) => wishDir(m);

function scene() {
  const rig = makeRig();
  const p = rig.add(makeActor('p1', 'player', 0));
  const q = rig.add(makeActor('q1', 'partner', 0, { x: -6, z: -6 }));
  return { rig, p, q };
}

describe('PartnerBrain', () => {
  it('emits a valid MoveInput in every situation (a seeded sweep of 3,000 random scenes)', () => {
    const rnd = seededRandom(42);
    const brain = new PartnerBrain(7);
    const { rig, p, q } = scene();
    const monsters: AdventureActor[] = [];
    for (let i = 0; i < 4; i++) monsters.push(rig.add(makeActor(`m${i}`, 'monster', -1)));
    const r = (a: number, b: number) => a + (b - a) * rnd();
    for (let i = 0; i < 3000; i++) {
      for (const a of [p, q, ...monsters]) {
        a.pos.x = r(-40, 40); a.pos.y = r(-2, 6); a.pos.z = r(-40, 40);
        a.facingYaw = r(-7, 7);
        a.grounded = rnd() < 0.7;
        a.stats.hp.cur = rnd() < 0.15 ? 0 : r(1, 100);
        a.stats.stamina.cur = r(0, 100);
        a.state = a.stats.hp.cur <= 0 ? 'ko' : (['ground', 'air', 'grind', 'flight'] as const)[Math.floor(rnd() * 4)];
        a.stunSec = rnd() < 0.1 ? 0.5 : 0;
      }
      p.lock = rnd() < 0.5 ? { actorId: monsters[Math.floor(rnd() * 4)].id, sinceSec: 0, hard: true } : null;
      q.lock = rnd() < 0.3 ? { actorId: 'm0', sinceSec: 0, hard: rnd() < 0.5 } : null;
      q.fusion.active = rnd() < 0.05;
      p.ridingId = rnd() < 0.05 ? 'q1' : null;
      const command = PARTNER_COMMANDS[Math.floor(rnd() * 3)];
      const out = brain.think({ self: q, player: p, world: rig.world, command, playerDowned: rnd() < 0.15 }, 1 / 60);
      expectValid(out);
    }
  });

  it('follows: walks to a slot behind the player, sprints when far, stops when there', () => {
    const { rig, p, q } = scene();
    const brain = new PartnerBrain();
    q.pos.x = 0; q.pos.z = -20;
    let out = brain.think({ self: q, player: p, world: rig.world, command: 'follow', playerDowned: false }, 1 / 60);
    expect(brain.mode).toBe('follow');
    expect(aim(out).z).toBeGreaterThan(0.9);   // toward the player (+z)
    expect(out.dashHeld).toBe(true);
    q.pos.x = 1.0; q.pos.z = -1.8;              // the slot: behind (−z) and right (+x) at yaw 0
    out = brain.think({ self: q, player: p, world: rig.world, command: 'follow', playerDowned: false }, 1 / 60);
    expect(aim(out).mag).toBe(0);
    expect(out).toEqual({ ...NEUTRAL_MOVE_INPUT, move: { x: 0, y: 0 }, look: { x: 0, y: 0 } });
  });

  it('jumps after a player who is on a ledge above', () => {
    const { rig, p, q } = scene();
    const brain = new PartnerBrain();
    p.pos.y = 2;
    q.pos.x = 1; q.pos.z = -3;
    const out = brain.think({ self: q, player: p, world: rig.world, command: 'follow', playerDowned: false }, 1 / 60);
    expect(out.jump).toBe(true);
    expect(brain.think({ self: q, player: p, world: rig.world, command: 'follow', playerDowned: false }, 1 / 60).jump).toBe(false);   // an edge, once
  });

  it('assists the player\'s lock: closes in, then strikes on a cadence with every third a heavy', () => {
    const { rig, p, q } = scene();
    const m = rig.add(makeActor('m1', 'monster', -1, { x: 0, z: 10 }));
    rig.add(makeActor('m2', 'monster', -1, { x: -5, z: -5 }));   // nearer the partner, but not the lock
    p.lock = { actorId: 'm1', sinceSec: 0, hard: true };
    const brain = new PartnerBrain(3);
    let out = brain.think({ self: q, player: p, world: rig.world, command: 'follow', playerDowned: false }, 1 / 60);
    expect(brain.mode).toBe('engage');
    expect(brain.targetId).toBe('m1');
    const d = aim(out);
    const to = { x: m.pos.x - q.pos.x, z: m.pos.z - q.pos.z };
    expect((d.x * to.x + d.z * to.z) / Math.hypot(to.x, to.z)).toBeGreaterThan(0.99);   // straight at the lock
    expect(out.attackLight || out.attackHeavy).toBe(false);
    // in range: strikes, never two in one tick, a heavy every third
    q.pos.x = 0; q.pos.z = 10 - (ATTACK_RANGE_M * 0.5 + q.radius + m.radius);
    const presses: string[] = [];
    for (let i = 0; i < 60 * 6; i++) {
      out = brain.think({ self: q, player: p, world: rig.world, command: 'follow', playerDowned: false }, 1 / 60);
      expectValid(out);
      if (out.attackLight) presses.push('L');
      if (out.attackHeavy) presses.push('H');
      expect(aim(out).mag).toBeLessThan(0.2);   // faces it, does not walk through it
    }
    expect(presses.length).toBeGreaterThanOrEqual(8);
    expect(presses.length).toBeLessThanOrEqual(11);
    presses.forEach((k, i) => expect(k).toBe((i + 1) % HEAVY_EVERY === 0 ? 'H' : 'L'));
  });

  it('guards instead of striking when its stamina is low', () => {
    const { rig, p, q } = scene();
    rig.add(makeActor('m1', 'monster', -1, { x: 0, z: 1.5 }));
    q.pos.x = 0; q.pos.z = 0.2;
    q.stats.stamina.cur = q.stats.stamina.max * LOW_STAMINA_FRAC * 0.5;
    const brain = new PartnerBrain();
    for (let i = 0; i < 120; i++) {
      const out = brain.think({ self: q, player: p, world: rig.world, command: 'engage', playerDowned: false }, 1 / 60);
      expect(out.attackLight || out.attackHeavy).toBe(false);
      expect(out.guardHeld).toBe(true);
    }
  });

  it('"engage" seeks the nearest enemy near the player; "follow" leaves a distant one alone', () => {
    const { rig, p, q } = scene();
    rig.add(makeActor('m1', 'monster', -1, { x: 8, z: 8 }));
    rig.add(makeActor('far', 'monster', -1, { x: 200, z: 0 }));
    rig.add(makeActor('npc', 'npc', 2, { x: -7, z: -6 }));
    const brain = new PartnerBrain();
    brain.think({ self: q, player: p, world: rig.world, command: 'engage', playerDowned: false }, 1 / 60);
    expect(brain.targetId).toBe('m1');
    const b2 = new PartnerBrain();
    b2.think({ self: q, player: p, world: rig.world, command: 'follow', playerDowned: false }, 1 / 60);
    expect(b2.mode).toBe('follow');
    expect(b2.targetId).toBeNull();
  });

  it('"guard me" stands between the player and the threat and blocks', () => {
    const { rig, p, q } = scene();
    rig.add(makeActor('m1', 'monster', -1, { x: 3.9, z: 0 }));
    q.pos.x = -2; q.pos.z = 0;
    const brain = new PartnerBrain();
    let out = brain.think({ self: q, player: p, world: rig.world, command: 'guard', playerDowned: false }, 1 / 60);
    expect(brain.mode).toBe('guard');
    expect(aim(out).x).toBeGreaterThan(0.5);   // across to the threat's side
    q.pos.x = 1.4;
    out = brain.think({ self: q, player: p, world: rig.world, command: 'guard', playerDowned: false }, 1 / 60);
    expect(out.guardHeld).toBe(true);
  });

  it('runs to a downed player and stands inside the revive range', () => {
    const { rig, p, q } = scene();
    rig.add(makeActor('m1', 'monster', -1, { x: -6, z: -5 }));   // an enemy right beside it does not distract it
    p.stats.hp.cur = 0; p.state = 'ko';
    const brain = new PartnerBrain();
    let out = brain.think({ self: q, player: p, world: rig.world, command: 'engage', playerDowned: true }, 1 / 60);
    expect(brain.mode).toBe('revive');
    const d = aim(out);
    expect(d.x).toBeGreaterThan(0.6); expect(d.z).toBeGreaterThan(0.6);
    expect(out.dashHeld).toBe(true);
    expect(out.attackLight || out.attackHeavy).toBe(false);
    q.pos.x = REVIVE_STAND_M * 0.9; q.pos.z = 0;
    out = brain.think({ self: q, player: p, world: rig.world, command: 'engage', playerDowned: true }, 1 / 60);
    expect(aim(out).mag).toBe(0);
    expect(REVIVE_STAND_M).toBeLessThan(REVIVE_RANGE);
  });

  it('is neutral when it is down, fused, or carrying the player', () => {
    for (const set of [
      (q: AdventureActor) => { q.stats.hp.cur = 0; q.state = 'ko'; },
      (q: AdventureActor) => { q.stunSec = 1; },
      (q: AdventureActor) => { q.fusion.active = true; },
    ]) {
      const { rig, p, q } = scene();
      set(q);
      const out = new PartnerBrain().think({ self: q, player: p, world: rig.world, command: 'engage', playerDowned: true }, 1 / 60);
      expect(aim(out).mag).toBe(0);
    }
    const { rig, p, q } = scene();
    p.ridingId = 'q1';
    const brain = new PartnerBrain();
    expect(aim(brain.think({ self: q, player: p, world: rig.world, command: 'follow', playerDowned: false }, 1 / 60)).mag).toBe(0);
    expect(brain.mode).toBe('mounted');
  });

  it('is deterministic for a seed, and copyMoveInput copies every field', () => {
    const run = (seed: number) => {
      const { rig, p, q } = scene();
      rig.add(makeActor('m1', 'monster', -1, { x: -6, z: -4.5 }));
      p.lock = { actorId: 'm1', sinceSec: 0, hard: true };
      const b = new PartnerBrain(seed);
      const ticks: number[] = [];
      for (let i = 0; i < 600; i++) if (b.think({ self: q, player: p, world: rig.world, command: 'engage' as PartnerCommand, playerDowned: false }, 1 / 60).attackLight) ticks.push(i);
      return ticks;
    };
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
    const a = new PartnerBrain().out, b = { ...NEUTRAL_MOVE_INPUT, move: { x: 0, y: 0 }, look: { x: 0, y: 0 } };
    Object.assign(a, { jump: true, magicSlot: 2, lean: -0.5 }); a.move.x = 0.3;
    copyMoveInput(a, b);
    expect(b).toEqual(a);
    expect(b.move).not.toBe(a.move);
  });
});
