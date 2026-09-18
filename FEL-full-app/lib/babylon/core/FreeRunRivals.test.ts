// Do the rivals run, hop, lunge and fall over the way the brief says?
import { describe, it, expect } from 'vitest';
import { RIVALS, makeRivals, stepRival, alongside, stumble, hazardVictims, slamVictims, standing, type CourseRead } from './FreeRunRivals';

const flat: CourseRead = { overGap: () => false, obstacleAhead: () => false, finishZ: 200 };
const TOP = 6.4;

describe('the rival field', () => {
  it('three runners with spread paces, behind the line, on their lanes', () => {
    const rs = makeRivals();
    expect(rs).toHaveLength(3);
    expect(rs[0].pace).toBeLessThan(rs[2].pace);
    for (const r of rs) expect(r.z).toBeLessThan(0);
    expect(new Set(rs.map((r) => r.x)).size).toBe(3);
  });
  it('runs at its pace and finishes; a stumble drops it to a crawl for a while', () => {
    const [r] = makeRivals(1);
    for (let i = 0; i < 300; i++) stepRival(r, 1 / 30, TOP, flat, { x: 50, z: 900 }, i / 30);
    expect(r.speed).toBeGreaterThan(TOP * RIVALS.paceMin * 0.9);
    expect(r.z).toBeGreaterThan(30);
    stumble(r); expect(r.speed).toBeLessThanOrEqual(RIVALS.stumbleSpeed);
    for (let i = 0; i < 10; i++) stepRival(r, 1 / 30, TOP, flat, { x: 50, z: 900 }, 10 + i / 30);
    expect(r.speed).toBeLessThan(2);
    const far: CourseRead = { ...flat, finishZ: r.z + 1 };
    let fin = false; for (let i = 0; i < 60 && !fin; i++) fin = stepRival(r, 1 / 30, TOP, far, { x: 50, z: 900 }, 20 + i / 30).finished;
    expect(fin).toBe(true); expect(r.finished).toBe(true);
  });
  it('hops a gap ahead of it and comes back down', () => {
    const [r] = makeRivals(1); r.z = 10; r.speed = 5;
    const gapped: CourseRead = { ...flat, overGap: (_x, z) => z > 11 && z < 13 };
    let peak = 0;
    for (let i = 0; i < 90; i++) { stepRival(r, 1 / 30, TOP, gapped, { x: 50, z: 900 }, i / 30); peak = Math.max(peak, r.y); }
    expect(peak).toBeGreaterThan(1); expect(r.y).toBe(0); expect(r.air).toBe(false);
  });
  it('telegraphs a lunge at a runner just ahead, lands it after the telegraph, then cools down', () => {
    const [r] = makeRivals(1); r.z = 10; r.speed = 5; r.lungeCool = 0;
    const p = { x: r.x + 0.5, z: 11.5 };
    const first = stepRival(r, 1 / 30, TOP, flat, p, 0);
    expect(first.telegraphed).toBe(true);
    let landed = false;
    for (let i = 0; i < 30 && !landed; i++) { p.z = r.z + 1.5; landed = stepRival(r, 1 / 30, TOP, flat, p, i / 30).lunged; }
    expect(landed).toBe(true); expect(r.lungeCool).toBeGreaterThan(0);
    p.z = r.z + 1.5; expect(stepRival(r, 1 / 30, TOP, flat, p, 5).telegraphed).toBe(false);
  });
  it('alongside is beside, not ahead or behind; hazards and slams find their victims; the standing counts who is ahead', () => {
    const rs = makeRivals(); rs[0].z = 20; rs[0].x = -6; rs[1].z = 30; rs[1].x = 0; rs[2].z = 5; rs[2].x = -3;
    expect(alongside(rs[0], { x: -4.5, z: 20.5 })).toBe(true);
    expect(alongside(rs[0], { x: -4.5, z: 25 })).toBe(false);
    expect(alongside(rs[0], { x: -6, z: 20 })).toBe(false);   // on top of it, not beside it
    expect(hazardVictims({ x: -6, z: 12 }, rs).map((r) => r.name)).toEqual(['VOSS']);
    expect(slamVictims({ x: -4, z: 21 }, rs, 4.5).map((r) => r.name)).toEqual(['VOSS']);
    const s = standing(18, 6, rs);
    expect(s.place).toBe(3); expect(s.field).toBe(4); expect(s.deltaSec).toBeCloseTo((30 - 18) / 6, 6);
    expect(standing(40, 6, rs).place).toBe(1);
  });
});
