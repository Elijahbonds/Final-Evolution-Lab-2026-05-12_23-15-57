import { describe, it, expect } from 'vitest';
import { stepRun, cutSlideSec, breakawayMeter, interceptPoint, RUN } from './RushRun';

const DRY = { boost: 1, trucking: false, held: false, grip: 1, drag: 1 };
const run = (frames: number, intent: { x: number; y: number }, o = DRY, s = { vx: 0, vz: 0 }) => { for (let i = 0; i < frames; i++) s = stepRun(s, intent, 1 / 60, o); return s; };

describe('RushRun — a carrier with momentum', () => {
  it('accelerates into the jog over a few frames and stops faster than it starts', () => {
    const first = stepRun({ vx: 0, vz: 0 }, { x: 0, y: -1 }, 1 / 60, DRY);
    expect(first.vz).toBeLessThan(1); expect(first.vz).toBeGreaterThan(0);
    const cruising = run(90, { x: 0, y: -1 });
    expect(cruising.vz).toBeCloseTo(RUN.base + RUN.push, 1);
    const stopping = run(10, { x: 0, y: 0 }, { ...DRY, held: true }, cruising);
    expect(stopping.vz).toBeLessThan(cruising.vz - 3);   // 22 m/s² of decel over 10 frames
    expect(run(60, { x: 0, y: 0 }, DRY).vz).toBeCloseTo(RUN.base, 1);   // a neutral stick jogs
  });
  it('a cut is chased sideways; wet turf answers slower and a truck narrows it', () => {
    const dry = run(6, { x: 1, y: 0 }), wet = run(6, { x: 1, y: 0 }, { ...DRY, grip: 0.9 });
    expect(dry.vx).toBeGreaterThan(wet.vx);
    expect(run(60, { x: 1, y: 0 }).vx).toBeCloseTo(RUN.lateral, 1);
    expect(run(60, { x: 1, y: 0 }, { ...DRY, trucking: true }).vx).toBeCloseTo(RUN.lateralTruck, 1);
    expect(cutSlideSec(0.35, 0.9)).toBeGreaterThan(0.35);
  });
  it('snow underfoot slows the run, the breakaway lifts it', () => {
    expect(run(90, { x: 0, y: -1 }, { ...DRY, drag: 1.12 }).vz).toBeLessThan(run(90, { x: 0, y: -1 }).vz);
    expect(run(90, { x: 0, y: -1 }, { ...DRY, boost: 1.25 }).vz).toBeGreaterThan(run(90, { x: 0, y: -1 }).vz + 1);
  });
  it('the breakaway meter fills per evade with a line per evade, then drains on the clock', () => {
    const m = breakawayMeter(1, 3, 0, 4); expect(m.fill01).toBeCloseTo(1 / 3, 5); expect(m.ticks).toEqual([1 / 3, 2 / 3]); expect(m.active).toBe(false);
    const on = breakawayMeter(3, 3, 2, 4); expect(on.active).toBe(true); expect(on.fill01).toBe(0.5);
  });
  it('the pursuit angle: a defender ahead meets the carrier down his line; one he cannot catch has no point', () => {
    const p = interceptPoint({ x: 0, z: 0 }, { x: 0, z: 7 }, { x: 6, z: 10 }, 6)!;
    expect(p).not.toBeNull(); expect(p.x).toBeCloseTo(0, 5); expect(p.z).toBeGreaterThan(5); expect(p.t).toBeLessThan(3);
    expect(interceptPoint({ x: 0, z: 0 }, { x: 0, z: 8 }, { x: 0, z: -10 }, 5)).toBeNull();   // behind and slower
  });
});
