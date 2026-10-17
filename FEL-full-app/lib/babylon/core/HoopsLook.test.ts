// H3b: where a ball handler's chest and eyes go (HoopsLook). Before, every offensive body aimed both at the rim whatever was in front
// of it — the hold take's head was 78° off a defender a metre away (scripts/probes/_idle-read.mts, h3b-base2).
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { HandlerLook, PROTECT_TURN, READ_GLANCE_EVERY, READ_GLANCE_SEC, CHEST_Y, READ_RANGE } from './HoopsLook';
import type { HoopsWindow } from './HoopsPosture';

const RIM = new Vector3(0, 3.05, -6);
const self = new Vector3(0, 0, 0);
const defender = new Vector3(0, 0, -1.05);   // between him and the rim
const step = (l: HandlerLook, window: HoopsWindow, o: Partial<{ ball: Vector3; defender: Vector3 | null; speed01: number; dt: number }> = {}) =>
  l.update({ self, ball: o.ball ?? new Vector3(0.3, 0.9, 0.1), rim: RIM, defender: o.defender === undefined ? defender : o.defender, window, speed01: o.speed01 ?? 0, dt: o.dt ?? 1 / 60 });

describe('HoopsLook — the handler reads the defender', () => {
  it('sizing up at rest: the eyes on his chest, the chest still on the rim', () => {
    const l = step(new HandlerLook(), 'dribble');
    expect(l.reading).toBe('defender');
    expect(l.eyes.asArray()).toEqual([defender.x, defender.y + CHEST_Y, defender.z]);
    expect(l.aim.equals(RIM)).toBe(true);
  });
  it('the rim when he is running, driving, out of range, behind him, or gone', () => {
    expect(step(new HandlerLook(), 'dribble', { speed01: 0.7 }).reading).toBe('rim');
    expect(step(new HandlerLook(), 'drive').reading).toBe('rim');
    expect(step(new HandlerLook(), 'dribble', { defender: new Vector3(0, 0, -(READ_RANGE + 0.2)) }).reading).toBe('rim');
    expect(step(new HandlerLook(), 'dribble', { defender: new Vector3(0, 0, 1.2) }).reading).toBe('rim');   // beaten: behind me
    expect(step(new HandlerLook(), 'dribble', { defender: null }).reading).toBe('rim');
  });
  it('a glance at the rim every READ_GLANCE_EVERY s, READ_GLANCE_SEC long', () => {
    const l = new HandlerLook(); let rim = 0; const n = Math.round((READ_GLANCE_EVERY * 3) * 60);
    for (let i = 0; i < n; i++) if (step(l, 'dribble').reading === 'rim') rim++;
    expect(rim / 60).toBeGreaterThan(3 * READ_GLANCE_SEC - 0.05);
    expect(rim / 60).toBeLessThan(3 * READ_GLANCE_SEC + 0.05);
  });
  it('the protect: the eyes stay on him (no glance), the chest turns PROTECT_TURN off him toward the ball, either side', () => {
    for (const bx of [0.3, -0.3]) {
      const l = new HandlerLook(); let off = 0;
      for (let i = 0; i < 400; i++) { step(l, 'protect', { ball: new Vector3(bx, 0.6, 0) }); if (l.reading !== 'defender') off++; }
      expect(off).toBe(0);
      const a = Math.atan2(l.aim.x - self.x, -(l.aim.z - self.z));   // + = toward +x off the line to him (−z)
      expect(Math.abs(a)).toBeCloseTo(PROTECT_TURN, 5);
      expect(Math.sign(a)).toBe(Math.sign(bx));   // toward the ball's side: the off shoulder goes into him, the ball away
    }
  });
  it('a ball crossing the line does not swing the chest until it is past the hysteresis', () => {
    const l = new HandlerLook();
    step(l, 'protect', { ball: new Vector3(0.3, 0.6, 0) }); const a0 = l.aim.x;
    step(l, 'protect', { ball: new Vector3(-0.05, 0.6, 0) }); expect(l.aim.x).toBeCloseTo(a0, 9);
    step(l, 'protect', { ball: new Vector3(-0.2, 0.6, 0) }); expect(Math.sign(l.aim.x)).toBe(-Math.sign(a0));
  });
});
