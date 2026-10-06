// A4's host pieces, one at a time: the fixed-step order, the clock (accumulator, time scales, hit-stop), the spatial
// grid, the camera's hint picking and the body budget's fidelity picks.
import { describe, expect, it } from 'vitest';
import { emptyAdventureSave, type AdventureActor, type CameraHint } from '../contracts';
import { makeActor } from '../movement/testkit';
import { AdventureHost } from './AdventureHost';
import { HostClock, MAX_HIT_STOP_SEC, MAX_STEPS_PER_FRAME } from './clock';
import { RESULT_RING, SpatialGrid } from './spatialGrid';
import { AdventureCamera, CAMERA_RIGS, HINT_HOLD_SEC } from './camera';
import { BodyBudget, STORY_BODY_CAP } from './BodyBudget';
import { createSandbox } from '../world/sandboxSetup';

describe('AdventureHost: the fixed step and its order', () => {
  it('runs input → partner → movement → combat → magic → stats → events, once per step', () => {
    const { host } = createSandbox({ seed: 1 });
    const order: string[] = [];
    host.setInputSource(host.playerId, () => order.push('input'));
    for (const s of host.systems) {
      const step = s.step.bind(s);
      (s as { step: typeof s.step }).step = (ctx, dt) => { order.push(s.id); step(ctx, dt); };
    }
    host.onTick(() => order.push('events'));
    host.tick();
    expect(order).toEqual(['input', 'adventure.partner', 'adventure.movement', 'adventure.combat', 'adventure.magic', 'adventure.stats', 'events']);
  });

  it('a 30 fps frame runs two steps, a 60 fps frame one; a press lands on exactly one of them', () => {
    const { host } = createSandbox({ seed: 1 });
    let jumps = 0, fills = 0, pending = true;
    host.setInputSource(host.playerId, (out) => { fills++; if (pending) { out.jump = true; pending = false; } });
    host.bus.on('state', (e) => { if (e.actorId === host.playerId && e.to === 'air') jumps++; });
    expect(host.frame(1 / 30)).toBe(2);
    expect(fills).toBe(2);
    expect(host.frame(1 / 60)).toBe(1);
    expect(jumps).toBe(1);
    expect(host.player.state).toBe('air');
  });

  it('systems get the UNSCALED fixed dt and the unscaled clock; slow-time reaches them only through timeScaleOf', () => {
    const { host } = createSandbox({ seed: 1 });
    const dts: number[] = [];
    const step = host.movement.step.bind(host.movement);
    (host.movement as { step: typeof step }).step = (ctx, dt) => { dts.push(dt, ctx.tSec); step(ctx, dt); };
    host.bus.emit('time:scale', { byId: host.playerId, world: 0.32, self: 0.92, sec: 1 });
    host.tick(); host.tick();
    expect(dts[0]).toBeCloseTo(1 / 60, 12);
    expect(dts[3] - dts[1]).toBeCloseTo(1 / 60, 12);
    expect(host.timeScaleOf(host.playerId)).toBe(0.92);
    expect(host.timeScaleOf('brute.1')).toBe(0.32);
  });

  it('builds the party from the save: the player, the partner (its def from the save), the stats untouched by the first step', () => {
    const save = emptyAdventureSave(0);
    const { host } = createSandbox({ seed: 1, save });
    const before = JSON.stringify(host.player.stats);
    host.tick();
    expect(JSON.stringify(host.player.stats.hp)).toBe(JSON.stringify(JSON.parse(before).hp));
    expect(host.partnerActor?.kind).toBe('partner');
    expect(host.player.partnerId).toBe(host.partnerId);
  });
});

describe('HostClock', () => {
  it('accumulates real time into fixed steps and caps a stall', () => {
    const c = new HostClock();
    expect(c.stepsFor(1 / 60)).toBe(1);
    expect(c.stepsFor(0.5 / 60)).toBe(0);
    expect(c.stepsFor(0.5 / 60)).toBe(1);
    expect(c.stepsFor(2)).toBe(MAX_STEPS_PER_FRAME);   // a 2 s stall: the cap, and the rest is dropped
    expect(c.stepsFor(1 / 60)).toBe(1);
    expect(c.stepsFor(NaN)).toBe(0);
    expect(c.stepsFor(-1)).toBe(0);
  });

  it('time:scale: one request per byId, the slowest wins, a cancel ends it, and it runs on unscaled sim time', () => {
    const c = new HostClock();
    c.request({ byId: 'p', world: 0.32, self: 0.92, sec: 0.5 });
    c.request({ byId: 'q', world: 0.5, self: 1, sec: 2 });
    expect(c.scaleOf('p')).toBe(0.5);        // q's world slows p too: the slowest live answer
    expect(c.scaleOf('m')).toBe(0.32);
    c.request({ byId: 'p', world: 1, self: 1, sec: 0 });   // the cancel
    expect(c.scaleOf('m')).toBe(0.5);
    for (let i = 0; i < 119; i++) c.advance();
    expect(c.scaleOf('m')).toBe(0.5);
    c.advance();                              // 2 s of steps later
    expect(c.scaleOf('m')).toBe(1);
    expect(c.slowed()).toBe(false);
  });

  it('a hit-stop (world 0, self 0) freezes the steps for real time, capped', () => {
    const c = new HostClock();
    c.request({ byId: 'p', world: 0, self: 0, sec: 0.1 });
    expect(c.stepsFor(0.05)).toBe(0);
    expect(c.stepsFor(0.05 + 1 / 60)).toBe(1);
    c.hitStop(9);
    expect(c.hitStopSec).toBe(MAX_HIT_STOP_SEC);
  });
});

describe('SpatialGrid', () => {
  const bodies = (n: number): AdventureActor[] =>
    Array.from({ length: n }, (_, i) => makeActor(`a${i}`, 'monster', { pos: { x: ((i * 37) % 101) - 50, y: (i % 3), z: ((i * 53) % 97) - 48 } }));

  it('answers near() exactly as a scan would, in the world\'s order', () => {
    const list = bodies(80);
    const g = new SpatialGrid();
    g.rebuild(list);
    for (const [p, r] of [[{ x: 0, y: 0, z: 0 }, 9], [{ x: 20, y: 1, z: -10 }, 25], [{ x: -50, y: 0, z: 40 }, 3]] as const) {
      const want = list.filter((a) => Math.hypot(a.pos.x - p.x, a.pos.y - p.y, a.pos.z - p.z) <= r).map((a) => a.id);
      expect(g.near(p, r).map((a) => a.id)).toEqual(want);
    }
  });

  it('leaves hidden bodies out (a fused partner is inside its player)', () => {
    const q = makeActor('q', 'partner');
    q.fusion = { ...q.fusion, active: true };
    const g = new SpatialGrid();
    g.rebuild([q, makeActor('p')], (a) => a.kind === 'partner' && a.fusion.active);
    expect(g.near({ x: 0, y: 0, z: 0 }, 5).map((a) => a.id)).toEqual(['p']);
  });

  it('allocates no result arrays: answers come from a fixed ring', () => {
    const g = new SpatialGrid();
    g.rebuild(bodies(10));
    const first = g.near({ x: 0, y: 0, z: 0 }, 50);
    for (let i = 1; i < RESULT_RING; i++) g.near({ x: 0, y: 0, z: 0 }, 50);
    expect(g.near({ x: 0, y: 0, z: 0 }, 50)).toBe(first);
  });
});

describe('AdventureCamera', () => {
  const h = (preset: CameraHint['preset'], priority: number, targetId?: string, fovBoost?: number): CameraHint => ({ preset, priority, targetId, fovBoost });

  it('the highest-priority hint of a step wins; a lock frames its target', () => {
    const cam = new AdventureCamera();
    cam.offer(h('flight', 4, 'p', 3)); cam.offer(h('lock', 50, 'm1')); cam.offer(h('grind', 3, 'p'));
    cam.endStep(0);
    const r = cam.rig();
    expect(r.hint).toBe('lock');
    expect(r.preset).toBe(CAMERA_RIGS.lock.preset);
    expect(r.objectiveId).toBe('m1');
  });

  it('holds a hint through a one-tick gap, then falls back to the follow shot', () => {
    const cam = new AdventureCamera();
    cam.offer(h('grind', 3, 'p')); cam.endStep(0);
    cam.endStep(1 / 60);
    expect(cam.rig().hint).toBe('grind');
    cam.endStep(HINT_HOLD_SEC + 0.05);
    expect(cam.rig().hint).toBe('follow');
    expect(cam.rig().objectiveId).toBeNull();
  });

  it('a cruise widens the FOV by A1\'s boost, capped', () => {
    const cam = new AdventureCamera();
    cam.offer(h('cruise', 5, 'p', 18.5)); cam.endStep(0);
    expect(cam.rig().fovBoostDeg).toBeCloseTo(18.5);
    expect(cam.rig().distance).toBeGreaterThan(CAMERA_RIGS.follow.distance);
    cam.offer(h('cruise', 5, 'p', 99)); cam.endStep(0.1);
    expect(cam.rig().fovBoostDeg).toBe(20);
  });
});

describe('BodyBudget', () => {
  const ring = (n: number, r: number): AdventureActor[] =>
    Array.from({ length: n }, (_, i) => makeActor(`m${i}`, 'monster', { pos: { x: Math.sin(i) * r, y: 0, z: Math.cos(i) * r } }));
  const eye = { x: 0, y: 0, z: 0 };

  it('picks by the plan\'s radii on a phone: full ≤ 30, reduced ≤ 55, impostor ≤ 90, culled beyond', () => {
    const b = new BodyBudget();
    const bodies = [10, 40, 70, 120].map((d, i) => makeActor(`x${i}`, 'monster', { pos: { x: 0, y: 0, z: d } }));
    b.pick(bodies, { tier: 'mobile', eye, pinned: () => false });
    expect(bodies.map((a) => b.of(a.id))).toEqual(['full', 'reduced', 'impostor', 'culled']);
    b.pick(bodies, { tier: 'desktop', eye, pinned: () => false });
    expect(bodies.map((a) => b.of(a.id))).toEqual(['full', 'full', 'reduced', 'impostor']);   // desktop: 60 / 110 / 180
  });

  it('the player, the partner, the lock and a boss are full at any distance', () => {
    const b = new BodyBudget();
    const boss = makeActor('boss', 'boss', { pos: { x: 0, y: 0, z: 500 } });
    b.pick([boss], { tier: 'mobile', eye, pinned: (a) => a.kind === 'boss' });
    expect(b.of('boss')).toBe('full');
  });

  it('caps full bodies at the story budget (12 on a phone), dropping the farthest; pressure shrinks it by a quarter', () => {
    const b = new BodyBudget();
    const bodies = ring(20, 10);
    b.pick(bodies, { tier: 'mobile', eye, pinned: () => false });
    expect(b.fullCount).toBe(STORY_BODY_CAP.mobile);
    b.pick(bodies, { tier: 'mobile', eye, pinned: () => false, governorLevel: 3 });
    expect(b.fullCount).toBe(Math.floor(STORY_BODY_CAP.mobile * 0.75));
    const near = makeActor('near', 'monster', { pos: { x: 0, y: 0, z: 25 } });
    b.pick([near], { tier: 'mobile', eye, pinned: () => false, hot: true });
    expect(b.of('near')).toBe('reduced');   // 25 m is past the hot phone's 21 m full radius
  });

  it('re-picks every half-second, not every frame', () => {
    const b = new BodyBudget();
    const input = { tier: 'mobile' as const, eye, pinned: () => false };
    expect(b.update([], 0.016, input)).toBe(true);    // the first call picks
    expect(b.update([], 0.2, input)).toBe(false);
    expect(b.update([], 0.31, input)).toBe(true);
    expect(BodyBudget.animates('reduced', 3)).toBe(true);
    expect(BodyBudget.animates('reduced', 4)).toBe(false);
    expect(BodyBudget.animates('impostor', 3)).toBe(false);
  });
});

describe('AdventureHost: the yard', () => {
  it('opens the gate and brings the boss when the camp is cleared, and resets after the boss falls', () => {
    const { host, runtime, spec } = createSandbox({ seed: 2 });
    expect(runtime.gateOpen).toBe(false);
    expect(host.world.actors.has(spec.boss.id)).toBe(false);
    for (const c of spec.camp) host.world.actors.get(c.id)!.stats.hp.cur = 0;
    for (let i = 0; i < 60 * 4; i++) host.tick();
    expect(runtime.gateOpen).toBe(true);
    expect(host.world.actors.has(spec.boss.id)).toBe(true);
    expect(host.world.actors.size).toBe(3);   // the player, the partner, the boss
    expect(host.world.groundY(0, 197)).toBe(0);   // the gate is down: its block no longer stands
    host.world.actors.get(spec.boss.id)!.stats.hp.cur = 0;
    for (let i = 0; i < 60 * 9; i++) host.tick();
    expect(runtime.bossesBeaten).toBe(1);
    expect(spec.camp.every((c) => host.world.actors.has(c.id))).toBe(true);
    expect(host.world.actors.size).toBeLessThanOrEqual(12);
  });
});
