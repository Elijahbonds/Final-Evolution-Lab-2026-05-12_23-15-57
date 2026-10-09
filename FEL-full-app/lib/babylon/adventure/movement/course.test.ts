// Scripted headless courses (lane A1): the plan's "a scripted 30 s course run headless with no NaN", and the lane
// brief's line "run onto a rail at 12 m/s, lean, switch rails at the switch point, jump off, homing-dash a target",
// played as one continuous run at 60 Hz with the real system and the fake world.
import { describe, expect, it } from 'vitest';
import type { AdventureActor, MovementState, RailNetwork, Vec3 } from '../contracts';
import { createMovementSystem } from './index';
import { fakeWorld, makeActor, Runner } from './testkit';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

describe('course: onto a rail, lean, switch, jump off, homing dash', () => {
  it('plays the whole line in order', () => {
    const rails: RailNetwork = { id: 'line', segments: [
      { id: 'a', points: [v(0, 1.2, 70), v(0, 1.2, 130)], speedBias: 0, switches: [{ atM: 20, windowM: 1.5, side: 1, toSegment: 'b', toAtM: 20 }] },
      { id: 'b', points: [v(3, 1.2, 70), v(3, 1.2, 130)], speedBias: 0, switches: [] },
    ] };
    const world = fakeWorld({ rails });
    const sys = createMovementSystem();
    const r = new Runner(world, [sys]);
    const p = world.add(makeActor('p1'));
    world.add(makeActor('target', 'monster', { pos: v(3, 3.5, 134), height: 1.4 }));
    const inp = r.input('p1');
    inp.move.y = 1;

    // build past 12 m/s on the flat (FLOW tier 2), then jump onto the rail
    r.runUntil(() => p.pos.z >= 66, 9);
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeGreaterThanOrEqual(11.9);
    r.press('p1', 'jump'); inp.jumpHeld = true;
    expect(r.runUntil(() => p.state === 'grind', 2)).toBe(true);
    inp.jumpHeld = false;
    const caughtAt = p.rail!.speed;
    expect(caughtAt).toBeGreaterThanOrEqual(11.5);
    // lean (a tuck on the straight) builds speed on the rail
    r.runUntil(() => p.rail!.sM >= 19.4, 3);
    expect(p.rail!.speed).toBeGreaterThan(caughtAt);
    // lean right and jump at the switch point: over to rail b
    inp.lean = 1; r.press('p1', 'jump'); r.tick();
    inp.lean = 0;
    r.run(0.4);
    expect(p.rail?.segmentId).toBe('b');
    // jump off near the end, then homing-dash the target ahead
    r.runUntil(() => p.pos.z >= 124, 3);
    inp.move.y = 0;
    r.press('p1', 'jump'); inp.jumpHeld = true; r.tick(12);
    r.press('p1', 'jump');
    r.runUntil(() => r.of('homing').length > 0, 1.5);

    const line = r.events
      .filter((e) => e.name !== 'state')
      .map((e) => {
        const p = e.payload as Record<string, unknown>;
        return e.name === 'homing' ? `homing:${p.targetId}:${p.hit}` : e.name === 'rail:switch' ? `switch:${p.from}>${p.to}` : `${e.name}:${p.segmentId}${p.reason ? `:${p.reason}` : ''}`;
      });
    expect(line).toEqual(['rail:enter:a', 'switch:a>b', 'rail:exit:b:jump', 'homing:target:true']);
    expect(p.vel.y).toBeGreaterThan(5);           // the bounce
  });
});

describe('course: a scripted 30 s run, headless, no NaN, nothing stuck', () => {
  it('runs, slopes, grinds, switches, wall-runs, homes, fuses, flies, cruises and lands', () => {
    // flat to z 60, a 15% downhill to z 120, flat beyond; a void pit at z 170..176 (jumped)
    const ground = (_x: number, z: number): number | null => {
      if (z > 170 && z < 176) return null;
      if (z < 60) return 0;
      if (z < 120) return -(z - 60) * 0.15;
      return -9;
    };
    const rails: RailNetwork = { id: 'course', segments: [
      { id: 'r1', points: [v(0, 1.2, 14), v(0, 1.2, 44)], speedBias: 0, switches: [{ atM: 15, windowM: 2, side: 1, toSegment: 'r2', toAtM: 15 }] },
      { id: 'r2', points: [v(3, 1.2, 14), v(3, 1.2, 40), v(8, 0.8, 52)], smooth: true, speedBias: 1, switches: [] },
    ] };
    const walls = [{ a: { x: 6, z: 128 }, b: { x: 6, z: 160 }, nx: -1, nz: 0, height: 5 }];
    const world = fakeWorld({ ground, rails, walls });
    const sys = createMovementSystem({ bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 500 } });
    const r = new Runner(world, [sys]);
    const p = world.add(makeActor('p1'));
    p.stats.energy.cur = p.stats.energy.max = 400;
    const mobs: AdventureActor[] = [world.add(makeActor('m1', 'monster', { pos: v(4, -7, 185) })), world.add(makeActor('m2', 'monster', { pos: v(4, -5.5, 191) }))];
    const inp = r.input('p1');
    const visited = new Set<MovementState>();
    let maxAirSec = 0, nan = 0;

    r.run(30, (t) => {
      for (const a of world.actors.values()) {
        if (![a.pos.x, a.pos.y, a.pos.z, a.vel.x, a.vel.y, a.vel.z, a.facingYaw].every(Number.isFinite)) nan++;
      }
      // the script: a stick and a few presses on a timetable, steered by where the body is
      inp.move.x = 0; inp.move.y = 1; inp.lean = 0; inp.ascendHeld = false; inp.descendHeld = false;
      const z = p.pos.z;
      if (p.state === 'ground' && z > 9 && z < 12) { r.press('p1', 'jump'); inp.jumpHeld = true; }
      if (p.state === 'grind' && p.rail?.segmentId === 'r1' && p.rail.sM > 14) { inp.lean = 1; r.press('p1', 'jump'); }
      if (p.state === 'grind' && p.rail?.segmentId === 'r2') inp.move.y = 1;
      // to the wall: line up beside it, then run into it, jump, and jump again at the face
      if (z > 100 && z < 126) inp.move.x = Math.max(-1, Math.min(1, (3.8 - p.pos.x) * 0.6));
      if (z >= 126 && z < 158 && p.state !== 'wallrun') inp.move.x = 0.8;
      if (p.state === 'ground' && z > 126 && z < 158 && 6 - p.pos.x < 3.2) { r.press('p1', 'jump'); inp.jumpHeld = true; }
      if (p.state === 'air' && z > 127 && z < 158 && 6 - p.pos.x < 1.6) r.press('p1', 'jump');
      if (z > 160 && z < 200) inp.move.x = Math.max(-1, Math.min(1, (4 - p.pos.x) * 0.6));
      if (p.state === 'ground' && z > 165 && z < 168) { r.press('p1', 'jump'); inp.jumpHeld = true; }
      if (p.state === 'air' && z > 172 && z < 186 && p.vel.y < 0) r.press('p1', 'jump');   // jump again on the way down: home in
      if (t > 18 && !p.fusion.active) p.fusion = { active: true, tier: 2, meter: 1, remainingSec: 12, partnerId: null, element: 'wind', grantsFlight: true };
      if (t > 18.5 && t < 18.6 && p.state !== 'flight') { r.press('p1', 'jump'); inp.jumpHeld = true; }
      if (t > 18.8 && t < 18.9 && p.state === 'air') r.press('p1', 'jump');
      if (p.state === 'flight' && t < 21) inp.ascendHeld = true;
      if (p.state === 'flight' && t >= 21 && t < 26) { inp.dashHeld = true; if (t < 21.05) r.press('p1', 'dash'); inp.move.x = Math.sin(t); }
      if (t >= 26) { inp.dashHeld = false; inp.descendHeld = true; inp.move.y = 0; }
      if (p.state === 'ground' || p.state === 'grind' || p.state === 'flight') inp.jumpHeld = inp.jumpHeld && p.state === 'ground';
    });
    for (const e of r.of('state')) visited.add(e.to);
    // the longest single stretch in the air
    let since = 0;
    for (const e of r.events.filter((x) => x.name === 'state' && (x.payload as { actorId: string }).actorId === 'p1')) {
      const pl = e.payload as { from: MovementState; to: MovementState };
      if (pl.to === 'air') since = e.tSec;
      if (pl.from === 'air') maxAirSec = Math.max(maxAirSec, e.tSec - since);
    }
    expect(nan).toBe(0);
    expect([...visited]).toEqual(expect.arrayContaining(['ground', 'air', 'grind', 'wallrun', 'flight']));
    expect(r.of('rail:enter').length).toBeGreaterThanOrEqual(1);
    expect(r.of('rail:switch')).toEqual([{ actorId: 'p1', from: 'r1', to: 'r2' }]);
    expect(r.of('homing').some((h) => h.hit)).toBe(true);
    expect(sys.inspect('p1')!.flight.boomAtSec).not.toBeNull();         // it cruised to the boom
    expect(maxAirSec).toBeLessThan(6);
    expect(p.state).toBe('ground');                                    // and it landed
    expect(mobs.every((m) => m.state === 'ground')).toBe(true);
  });
});
