import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { aeroCircuits, locate, pointAlong } from './aeroCircuits';
import { startRace, stepRace } from '../core/RaceCourse';

const all = aeroCircuits();

describe('three themed circuits', () => {
  it('canyon, island and glacier — one each, each ~1–2 km a lap', () => {
    expect(all.map((c) => c.theme).sort()).toEqual(['canyon', 'glacier', 'island']);
    for (const c of all) {
      expect(c.line.length, c.course.id).toBeGreaterThan(1000);
      expect(c.line.length, c.course.id).toBeLessThan(2400);
    }
  });

  it('the racing line flies above its own ground, and inside the corridor the walls are low', () => {
    for (const c of all) for (let d = 0; d < c.line.length; d += 25) {
      const { pos } = pointAlong(c.line, d);
      expect(pos.y - c.floorAt(pos.x, pos.z), `${c.course.id} @${d}`).toBeGreaterThan(5);
    }
  });

  it('the canyon and glacier walls rise off the corridor edge; the island is open sea', () => {
    for (const c of all) {
      const { pos, tangent } = pointAlong(c.line, c.line.length * 0.25);
      const right = new Vector3(tangent.z, 0, -tangent.x);
      const out = pos.add(right.scale(c.corridor + 30));
      const rise = c.floorAt(out.x, out.z) - c.floorAt(pos.x, pos.z);
      if (c.theme === 'island') expect(rise, c.course.id).toBeLessThan(35);
      else expect(rise, c.course.id).toBeGreaterThan(30);
    }
  });

  it('the glacier has a cave with a roof over the line; the others are open sky', () => {
    for (const c of all) {
      if (c.theme === 'glacier') {
        const mid = pointAlong(c.line, (c.tunnel!.from + c.tunnel!.to) / 2).pos;
        expect(c.ceilingAt(mid.x, mid.z) - mid.y).toBeCloseTo(c.tunnel!.clear, 0);
      } else expect(c.tunnel).toBeNull();
    }
  });

  it('locate() finds the line under a point and the side it is on', () => {
    for (const c of all) {
      const { pos, tangent } = pointAlong(c.line, 300);
      const right = new Vector3(tangent.z, 0, -tangent.x);
      const at = locate(c.line, pos.x + right.x * 10, pos.z + right.z * 10);
      expect(Math.abs(at.dist - 300), c.course.id).toBeLessThan(6);
      expect(at.lateral, c.course.id).toBeCloseTo(10, 0);
    }
  });

  it('flying the line takes every checkpoint, three laps, and finishes', () => {
    for (const c of all) {
      const p = startRace();
      let prev = c.course.start.at.clone();
      for (let d = -18; d < c.line.length * 3 + 40 && !p.finished; d += 3) {
        const now = pointAlong(c.line, d).pos;
        stepRace(p, c.course, prev, now, 0.1);
        prev = now;
      }
      expect(p.finished, c.course.id).toBe(true);
      expect(p.lap, c.course.id).toBe(4);
    }
  });

  it('balloon rows carry every item colour, and there are banana lines to chase', () => {
    for (const c of all) {
      expect(new Set(c.balloons.map((b) => b.kind)).size, c.course.id).toBe(4);
      expect(c.bananas.length, c.course.id).toBeGreaterThanOrEqual(20);
      for (const b of c.balloons) expect(Math.abs(locate(c.line, b.pos.x, b.pos.z).lateral), c.course.id).toBeLessThan(c.corridor);
    }
  });
});
