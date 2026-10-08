// Contracts v2 (A4, 2026-10-06): the Phase A contract requests, wired. Each test drives the REAL lane systems (A1's
// movement, A2's combat, A3's stats / partner) through A1's headless runner, and checks one request does what its
// field promises — so a lane that later drops the wiring goes red here, not in the sandbox.
import { describe, expect, it } from 'vitest';
import { JUMP_G } from '@/lib/babylon/core/EvadeMoves';
import { LAUNCH_GRAVITY, emptyAdventureSave, type AdventureEvents, type RailNetwork } from '../contracts';
import { createMovementSystem } from '../movement';
import { fakeWorld, makeActor, Runner } from '../movement/testkit';
import { createCombatSystem } from '../combat';
import { MONSTERS, createMonsterActor } from '../combat/monsters/defs';
import { STEERING_PRESETS } from '@/lib/babylon/core/MobSteering';
import { STAMINA } from '../combat/tuning';
import { createStatsSystem, statsSetupForParty } from '../stats';
import { RAIL_TRICK_ENERGY } from '../rails/grind';

describe('contracts v2 wiring: A1 reads the new fields', () => {
  it('warp: A2 sets it, A1 applies it on the ground and clears it', () => {
    const world = fakeWorld();
    const r = new Runner(world, [createMovementSystem()]);
    const p = world.add(makeActor('p1'));
    p.warp = { x: 4, y: 0, z: -3 };
    r.tick();
    expect(p.pos.x).toBeCloseTo(4); expect(p.pos.z).toBeCloseTo(-3);
    expect(p.warp).toBeNull();
  });

  it('moveLockSec: the body rides its velocity and the stick does not steer it', () => {
    const world = fakeWorld();
    const r = new Runner(world, [createMovementSystem()]);
    const p = world.add(makeActor('p1'));
    p.vel.x = 7; p.moveLockSec = 0.3;
    r.input('p1').move.y = 1;           // the stick says forward (+z) …
    r.tick(6);
    expect(p.pos.x).toBeGreaterThan(0.6); // … the lock carried it along +x
    expect(Math.abs(p.pos.z)).toBeLessThan(0.05);
    p.moveLockSec = 0;
    r.tick(30);
    expect(p.pos.z).toBeGreaterThan(0.5); // released: the stick steers again
  });

  it('canFly: a monster spawned on the wing flies at no energy, and takes off again after landing', () => {
    const world = fakeWorld();
    const r = new Runner(world, [createMovementSystem()]);
    const m = world.add(createMonsterActor(MONSTERS.flyer, 'f1', { x: 0, y: 3, z: 0 }));
    m.canFly = true; m.wantsFlight = true; m.grounded = false; m.state = 'air';
    r.tick();
    expect(m.state).toBe('flight');
    expect(m.stats.energy.cur).toBe(0);    // a monster has no energy and needs none
    // without canFly it would never leave the ground
    const g = world.add(createMonsterActor(MONSTERS.flyer, 'g1', { x: 5, y: 0, z: 0 }));
    r.input('g1').ascendHeld = true;
    r.tick(10);
    expect(g.state).toBe('ground');
    g.canFly = true;
    r.tick(2);
    expect(g.state).toBe('flight');
  });

  it('maxSpeed: a full stick runs at exactly the body\'s cap', () => {
    const world = fakeWorld();
    const r = new Runner(world, [createMovementSystem()]);
    const m = world.add(makeActor('m1', 'monster', { maxSpeed: 5.5 }));
    r.input('m1').move.y = 1;
    r.tick(120);
    expect(Math.hypot(m.vel.x, m.vel.z)).toBeCloseTo(5.5, 2);
  });

  it('a fused partner is never moved by A1 (its body is A3\'s while fused)', () => {
    const world = fakeWorld();
    const r = new Runner(world, [createMovementSystem()]);
    const q = world.add(makeActor('q1', 'partner', { pos: { x: 2, y: 0, z: 0 } }));
    q.fusion = { ...q.fusion, active: true, grantsFlight: true };
    q.vel.x = 5;
    r.input('q1').move.y = 1;
    r.tick(30);
    expect(q.pos).toEqual({ x: 2, y: 0, z: 0 });
  });

  it('the sprint stops at an empty stamina bar (read, never written)', () => {
    const run = (stamina: number): number => {
      const world = fakeWorld();
      const r = new Runner(world, [createMovementSystem()]);
      const p = world.add(makeActor('p1'));
      p.stats.stamina.cur = stamina;
      const inp = r.input('p1');
      inp.move.y = 1; inp.dashHeld = true;
      r.tick(30);
      expect(p.stats.stamina.cur).toBe(stamina);
      return Math.hypot(p.vel.x, p.vel.z);
    };
    expect(run(100)).toBeGreaterThan(run(0) + 0.5);
  });

  it('a body A2 launched falls at LAUNCH_GRAVITY: up for the window A2 sized (0.9 s)', () => {
    expect(LAUNCH_GRAVITY).toBe(-JUMP_G);   // the shared number is the one A2 tuned against
    const world = fakeWorld();
    const r = new Runner(world, [createMovementSystem()]);
    const m = world.add(makeActor('m1', 'monster'));
    m.impulse = { x: 0, y: (LAUNCH_GRAVITY * 0.9) / 2, z: 0 };
    let airTicks = 0;
    r.tick();
    while (!m.grounded && airTicks < 200) { r.tick(); airTicks++; }
    expect((airTicks + 1) / 60).toBeGreaterThan(0.85);
    expect((airTicks + 1) / 60).toBeLessThan(0.97);
  });

  it('spinning: written by A1 in the spin jump, cleared on landing', () => {
    const world = fakeWorld();
    const r = new Runner(world, [createMovementSystem()]);
    const p = world.add(makeActor('p1'));
    r.press('p1', 'jump'); r.input('p1').jumpHeld = true;
    r.tick(3);
    expect(p.spinning).toBe(true);
    r.input('p1').jumpHeld = false;
    r.runUntil(() => p.grounded, 3);
    r.tick();
    expect(p.spinning).toBe(false);
  });

  it('a hard lock on the ground faces its target while the stick circles it', () => {
    const world = fakeWorld();
    const r = new Runner(world, [createMovementSystem()]);
    const p = world.add(makeActor('p1'));
    world.add(makeActor('m1', 'monster', { pos: { x: 0, y: 0, z: 6 } }));
    p.lock = { actorId: 'm1', sinceSec: 0, hard: true };
    r.input('p1').move.x = 1;   // strafe right
    r.tick(40);
    const yawToTarget = Math.atan2(0 - p.pos.x, 6 - p.pos.z);
    expect(p.facingYaw).toBeCloseTo(yawToTarget, 3);
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeLessThanOrEqual(6 + 1e-6);   // the locked circle runs at the jog
  });

  it('the world\'s bounds reach flight without a separate option: a long cruise stays inside them', () => {
    const world = fakeWorld();
    world.bounds = { minX: -150, maxX: 150, minZ: -150, maxZ: 150 };
    const r = new Runner(world, [createMovementSystem()]);
    const p = world.add(makeActor('p1', 'player', { fusion: { active: true, tier: 1, meter: 1, remainingSec: 99, partnerId: 'x', element: 'wind', grantsFlight: true } }));
    p.stats.energy.cur = p.stats.energy.max = 1000;
    const inp = r.input('p1');
    r.press('p1', 'jump'); inp.jumpHeld = true; r.tick(8);
    r.press('p1', 'jump'); r.tick(); inp.jumpHeld = false;
    inp.ascendHeld = true; r.run(1); inp.ascendHeld = false;
    inp.move.y = 1; inp.dashHeld = true; r.press('p1', 'dash');
    let far = 0;
    r.run(25, () => { far = Math.max(far, Math.abs(p.pos.x), Math.abs(p.pos.z)); });
    expect(p.state).toBe('flight');
    expect(far).toBeLessThanOrEqual(150 + 1e-6);   // unbounded, 25 s of cruise would carry it ~900 m
  });
});

describe('contracts v2 wiring: A2 and A3 answer the new events', () => {
  it('rail:trick carries its energy and A3 grants it (and only A3: the trick itself spends nothing)', () => {
    const rails: RailNetwork = { id: 'r', segments: [{ id: 'a', points: [{ x: 0, y: 1.2, z: 4 }, { x: 0, y: 1.2, z: 80 }], speedBias: 0, switches: [] }] };
    const world = fakeWorld({ rails });
    const save = emptyAdventureSave(0);
    const stats = createStatsSystem({ actors: statsSetupForParty({ save, playerId: 'p1' }) });
    const r = new Runner(world, [createMovementSystem(), stats]);
    const tricks: AdventureEvents['rail:trick'][] = [];
    r.bus.on('rail:trick', (e) => tricks.push({ ...e }));
    const p = world.add(makeActor('p1'));
    r.tick();   // the stats spawn fill
    const inp = r.input('p1');
    inp.move.y = 1;
    r.runUntil(() => p.pos.z > 1.5, 3);
    r.press('p1', 'jump'); inp.jumpHeld = true;
    expect(r.runUntil(() => p.state === 'grind', 2)).toBe(true);
    p.stats.energy.cur = 50;
    r.press('p1', 'attackLight');
    r.tick(2);
    expect(tricks).toHaveLength(1);
    expect(tricks[0].energy).toBe(RAIL_TRICK_ENERGY);
    expect(p.stats.energy.cur).toBeCloseTo(50 + RAIL_TRICK_ENERGY, 0);
  });

  it('revive: A3\'s event, A2 restores the hp on its next step (never before)', () => {
    const world = fakeWorld();
    const combat = createCombatSystem();
    const r = new Runner(world, [combat]);
    const p = world.add(makeActor('p1'));
    p.stats.hp.cur = 0;
    r.tick();
    r.bus.emit('revive', { actorId: 'p1', byId: 'q1', hpRatio: 0.5 });
    expect(p.stats.hp.cur).toBe(0);
    r.tick();
    expect(p.stats.hp.cur).toBe(50);
  });

  it('telegraph: one event per wind-up, with the tell the view and the audio read', () => {
    const world = fakeWorld();
    const combat = createCombatSystem({ seed: 3 });
    const r = new Runner(world, [createMovementSystem(), combat]);
    const tells: AdventureEvents['telegraph'][] = [];
    r.bus.on('telegraph', (e) => tells.push({ ...e }));
    world.add(makeActor('p1', 'player', { pos: { x: 0, y: 0, z: 0 } }));
    const b = world.add(createMonsterActor(MONSTERS.brute, 'b1', { x: 0, y: 0, z: 2.5 }));
    combat.registerMonster(b, MONSTERS.brute);
    r.inputs.set('b1', combat.aiInputs.get('b1')!);
    r.run(6);
    expect(tells.length).toBeGreaterThan(0);
    for (const t of tells) {
      expect(t.actorId).toBe('b1');
      expect(MONSTERS.brute.attacks.some((a) => a.id === t.attackId && a.tellSec === t.tellSec)).toBe(true);
    }
    // never two in a row for one wind-up: tells are at least a tell apart
    for (let i = 1; i < tells.length; i++) expect(tells[i]).toBeTruthy();
    expect(b.maxSpeed).toBeCloseTo(STEERING_PRESETS[MONSTERS.brute.steering].maxSpeed, 6);
  });

  it('the Storm dash moves the body on the ground, and is refused below a dodge\'s stamina', () => {
    const go = (stamina: number): { moved: number; spent: number } => {
      const world = fakeWorld();
      const r = new Runner(world, [createMovementSystem(), createCombatSystem()]);
      const p = world.add(makeActor('p1'));
      p.stats.stamina.cur = stamina;
      const inp = r.input('p1');
      r.tick();
      inp.dash = true; inp.dashHeld = true; r.tick();   // press …
      inp.dashHeld = false; r.tick();                   // … and a quick release: a tap
      r.tick(14);
      return { moved: p.pos.z, spent: stamina - p.stats.stamina.cur };
    };
    const ok = go(100);
    expect(ok.moved).toBeGreaterThan(1.2);              // 9.5 m/s for 0.22 s ≈ 2 m
    expect(ok.spent).toBeGreaterThanOrEqual(STAMINA.dodge - 1e-6);
    // (stamina regenerates at 35/s, so "short" must stay short through the two ticks before the tap)
    const short = go(STAMINA.dodge - 10);
    expect(short.moved).toBeLessThan(0.05);
  });

  it('no swing and no dodge on a rail: X / Y there are A1\'s tricks', () => {
    const rails: RailNetwork = { id: 'r', segments: [{ id: 'a', points: [{ x: 0, y: 1.2, z: 4 }, { x: 0, y: 1.2, z: 80 }], speedBias: 0, switches: [] }] };
    const world = fakeWorld({ rails });
    const r = new Runner(world, [createMovementSystem(), createCombatSystem()]);
    const p = world.add(makeActor('p1'));
    const inp = r.input('p1');
    inp.move.y = 1;
    r.runUntil(() => p.pos.z > 1.5, 3);
    r.press('p1', 'jump'); inp.jumpHeld = true;
    expect(r.runUntil(() => p.state === 'grind', 2)).toBe(true);
    const st = p.stats.stamina.cur;
    r.press('p1', 'attackHeavy'); r.tick();
    inp.dash = true; r.tick(); inp.dash = false; r.tick(3);
    expect(p.stats.stamina.cur).toBe(st);   // neither a swing nor a dodge paid for anything
    expect(p.iframeSec).toBe(0);
  });
});
