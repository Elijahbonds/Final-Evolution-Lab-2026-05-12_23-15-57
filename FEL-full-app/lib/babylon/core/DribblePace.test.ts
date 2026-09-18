import { describe, it, expect } from 'vitest';
import { CourtMovement, DEFAULT_MOVEMENT, GEARS_HOOPS } from './CourtMovement';
import { DribbleController } from './BasketballCore';

const DT = 1 / 60;
const run = (m: CourtMovement, sec: number, x: number, y: number, sprint: boolean) => { let last = m.update(DT, x, y, sprint); for (let t = DT; t < sec; t += DT) last = m.update(DT, x, y, sprint); return last; };
const geared = () => new CourtMovement({ ...DEFAULT_MOVEMENT, gears: GEARS_HOOPS });

describe('dribble pace: three speeds', () => {
  it('a soft stick walks, a pushed stick jogs, the turbo sprints — three distinct tops', () => {
    const walk = run(geared(), 2, 0, 0.3, false).vel.length();
    const jog = run(geared(), 2, 0, 1, false).vel.length();
    const sprint = run(geared(), 2, 0, 1, true).vel.length();
    expect(walk).toBeGreaterThan(1.2); expect(walk).toBeLessThan(2.6);
    expect(jog).toBeGreaterThan(3.8); expect(jog).toBeLessThan(4.6);
    expect(sprint).toBeCloseTo(DEFAULT_MOVEMENT.maxSpeed, 2);
    expect(run(geared(), 2, 0, 1, true).gear).toBe('sprint');
    expect(run(geared(), 2, 0, 0.3, false).gear).toBe('walk');
  });
  it('the start-up is loaded and smooth: no frame accelerates harder than the sprint cap, and the sprint reaches its top faster than the jog', () => {
    for (const sprint of [false, true]) {
      const m = geared(); let prev = 0, maxA = 0, reach = -1; const top = sprint ? DEFAULT_MOVEMENT.maxSpeed : DEFAULT_MOVEMENT.maxSpeed * DEFAULT_MOVEMENT.jogFactor;
      for (let i = 0; i < 120; i++) { const v = m.update(DT, 0, 1, sprint).vel.length(); maxA = Math.max(maxA, (v - prev) / DT); prev = v; if (reach < 0 && v >= top * 0.95) reach = i * DT; }
      expect(maxA).toBeLessThanOrEqual((sprint ? GEARS_HOOPS.sprintAccel : GEARS_HOOPS.jogAccel) + 1e-6);
      if (sprint) expect(reach).toBeLessThan(0.5); else expect(reach).toBeLessThan(0.75);
    }
    // the first frame off the mark is the loaded one: lighter than the frame a few steps in
    const m = geared(); const v1 = m.update(DT, 0, 1, true).vel.length(); m.update(DT, 0, 1, true); m.update(DT, 0, 1, true); const v3 = m.update(DT, 0, 1, true).vel.length(); m.update(DT, 0, 1, true);
    const v5 = m.update(DT, 0, 1, true).vel.length();
    expect(v1).toBeLessThan(v5 - v3 + 1e-9 + v1 * 0.5);
  });
  it('the stop scales with pace: a sprint slides longer than a jog, both smooth', () => {
    const stopSec = (sprint: boolean) => { const m = geared(); run(m, 1.5, 0, 1, sprint); let t = 0; while (m.update(DT, 0, 0, false).vel.length() > 0.05 && t < 3) t += DT; return t; };
    const fromSprint = stopSec(true), fromJog = stopSec(false);
    expect(fromSprint).toBeGreaterThan(fromJog * 1.4);
    expect(fromSprint).toBeGreaterThan(0.35); expect(fromSprint).toBeLessThan(0.9);
    expect(fromJog).toBeLessThan(0.4);
  });
  it('letting off the turbo with the stick held eases down instead of snapping', () => {
    const m = geared(); run(m, 1.5, 0, 1, true); const v0 = m.vel.length(); const v1 = m.update(DT, 0, 1, false).vel.length();
    expect(v0 - v1).toBeLessThan(0.3);
    let t = 0; while (m.update(DT, 0, 1, false).vel.length() > DEFAULT_MOVEMENT.maxSpeed * DEFAULT_MOVEMENT.jogFactor + 0.05 && t < 2) t += DT;
    expect(t).toBeGreaterThan(0.12); expect(t).toBeLessThan(0.5);
  });
  it('the sprint PRESS kicks a body already moving, not one standing still', () => {
    const m = geared(); run(m, 1.5, 0, 1, false); const before = m.vel.length(); const after = m.update(DT, 0, 1, true).vel.length();
    expect(after - before).toBeGreaterThan(GEARS_HOOPS.sprintKick * 0.8);
    const s = geared(); const first = s.update(DT, 0, 1, true).vel.length();
    expect(first).toBeLessThan(GEARS_HOOPS.sprintKick);
  });
  it('intensity reads the sprint hotter than a jog at the same normalised speed, and a kick adds to it', () => {
    const jog = run(geared(), 2, 0, 1, false), sprint = run(geared(), 2, 0, 1, true);
    expect(sprint.intensity01!).toBeGreaterThan(jog.intensity01! + 0.2);
    const m = geared(); run(m, 1.5, 0, 1, false); const base = m.update(DT, 0, 1, false).intensity01!; const kicked = m.update(DT, 0, 1, true).intensity01!;
    expect(kicked).toBeGreaterThan(base + 0.05);
  });
});

describe('DribbleController change of pace', () => {
  it('R2 let off at pace, then pressed again inside the window = the explode burst (once)', () => {
    const d = new DribbleController();
    for (let i = 0; i < 90; i++) d.update(DT, 0, 1, true);
    const atPace = d.vel.length();
    for (let i = 0; i < 12; i++) d.update(DT, 0, 1, false);   // 0.2 s off the turbo, stick held
    const eased = d.vel.length(); expect(eased).toBeLessThan(atPace);
    const r = d.update(DT, 0, 1, true);
    expect(r.paceChange).toBe(true);
    expect(d.vel.length()).toBeGreaterThan(eased + 1.5);
    const again = d.update(DT, 0, 1, true);
    expect(again.paceChange).toBe(false);
  });
  it('no window without a sprint to let off: a press from a jog only kicks', () => {
    const d = new DribbleController();
    for (let i = 0; i < 90; i++) d.update(DT, 0, 1, false);
    const r = d.update(DT, 0, 1, true);
    expect(r.paceChange).toBe(false);
    expect(r.gear).toBe('sprint');
  });
});
