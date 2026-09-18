// A ROLL THAT IS INVULNERABLE FOR ITS WHOLE LENGTH IS A BUTTON YOU HOLD (2026-09-14).
//
// If the i-frames last as long as the roll does, rolling is strictly better than not rolling at every
// moment and the correct play becomes mashing it — the read disappears and so does the fight. The i-frames
// have to end BEFORE the animation does, and there has to be a recovery on the end you can be punished
// during. That is the whole difference between a roll and a dash, and these tests are what hold it.
//
// Everything here is also frame-rate parity: a roll must cover the same ground and last the same time at
// 30 fps and at 144, because a defensive window that is longer on a slow machine is a different game.

import { describe, it, expect } from 'vitest';
import { CombatMovement } from './CombatMovement';

const M = CombatMovement;

/** Run `sec` seconds of update at `fps` with no stick input, reporting the last result. */
function run(m: CombatMovement, sec: number, fps = 60) {
  const dt = 1 / fps;
  let r = m.update(dt, 0, 0, false);
  for (let i = 1; i < Math.round(sec * fps); i++) r = m.update(dt, 0, 0, false);
  return r;
}

describe('CombatMovement — the roll', () => {
  it('starts, and reports itself through the result rather than only through a getter', () => {
    const m = new CombatMovement();
    expect(m.roll(0, 1)).toBe(true);
    const r = m.update(1 / 60, 0, 0, false);
    expect(r.rolling).toBe(true);
    expect(r.iframes).toBe(true);
    expect(r.canAct).toBe(false);
  });

  // THE POINT OF THE FILE.
  it('drops its i-frames BEFORE the roll ends, so the end of a roll can be punished', () => {
    expect(M.ROLL_IFRAMES_SEC).toBeLessThan(M.ROLL_SEC);
    const m = new CombatMovement();
    m.roll(0, 1);
    run(m, M.ROLL_IFRAMES_SEC + 0.02);
    expect(m.rollIFrames).toBe(false);
    expect(m.rolling).toBe(true);        // still rolling, no longer invulnerable
  });

  it('holds the body through a recovery after the roll, where the stick does nothing', () => {
    const m = new CombatMovement();
    m.roll(0, 1);
    run(m, M.ROLL_SEC + 0.02);
    expect(m.rolling).toBe(false);
    expect(m.canAct).toBe(false);        // the price
    run(m, M.ROLL_RECOVER_SEC + 0.02);
    expect(m.canAct).toBe(true);
  });

  it('refuses a second roll until the cooldown is served', () => {
    const m = new CombatMovement();
    expect(m.roll(0, 1)).toBe(true);
    expect(m.roll(0, 1)).toBe(false);                       // mid-roll
    run(m, M.ROLL_SEC + M.ROLL_RECOVER_SEC + 0.02);
    expect(m.roll(0, 1)).toBe(false);                       // still cooling
    run(m, M.ROLL_COOLDOWN_SEC);
    expect(m.roll(0, 1)).toBe(true);
  });

  it('refuses a directionless roll by rolling forward rather than dividing by zero', () => {
    const m = new CombatMovement();
    expect(m.roll(0, 0)).toBe(true);
    const r = m.update(1 / 60, 0, 0, false);
    expect(Number.isFinite(r.vel.x)).toBe(true);
    expect(Number.isFinite(r.vel.z)).toBe(true);
    expect(r.vel.length()).toBeGreaterThan(0);
  });

  it('covers the same ground in the same time at 30, 60 and 144 fps', () => {
    const dist = (fps: number) => {
      const m = new CombatMovement();
      m.roll(0, 1);
      const dt = 1 / fps;
      let d = 0;
      for (let i = 0; i < Math.round(M.ROLL_SEC * fps); i++) d += m.update(dt, 0, 0, false).vel.length() * dt;
      return d;
    };
    const a = dist(30), b = dist(60), c = dist(144);
    expect(Math.abs(a - b)).toBeLessThan(0.25);
    expect(Math.abs(b - c)).toBeLessThan(0.25);
  });
});

describe('CombatMovement — the jump', () => {
  it('leaves the floor and comes back to exactly zero', () => {
    const m = new CombatMovement();
    expect(m.jump()).toBe(true);
    run(m, 0.1);
    expect(m.airborne).toBe(true);
    expect(m.height).toBeGreaterThan(0);
    run(m, 2);
    expect(m.airborne).toBe(false);
    expect(m.height).toBe(0);
  });

  it('clears a sweep and not a high kick — the arc is a beat, not a float', () => {
    const m = new CombatMovement();
    m.jump();
    let peak = 0;
    for (let i = 0; i < 120; i++) { m.update(1 / 60, 0, 0, false); peak = Math.max(peak, m.height); }
    expect(peak).toBeGreaterThan(0.4);
    expect(peak).toBeLessThan(1.2);
  });

  it('refuses a double jump', () => {
    const m = new CombatMovement();
    expect(m.jump()).toBe(true);
    run(m, 0.1);
    expect(m.jump()).toBe(false);
  });

  it('cannot be rolled out of, and cannot be entered from a roll', () => {
    const air = new CombatMovement();
    air.jump(); run(air, 0.1);
    expect(air.roll(0, 1)).toBe(false);            // no rolling in the air

    const rolling = new CombatMovement();
    rolling.roll(0, 1); rolling.update(1 / 60, 0, 0, false);
    expect(rolling.jump()).toBe(false);            // no roll-cancel into a jump
  });

  it('reaches the same apex at every frame rate', () => {
    const peakAt = (fps: number) => {
      const m = new CombatMovement();
      m.jump();
      let peak = 0;
      for (let i = 0; i < Math.round(1.5 * fps); i++) { m.update(1 / fps, 0, 0, false); peak = Math.max(peak, m.height); }
      return peak;
    };
    expect(Math.abs(peakAt(30) - peakAt(60))).toBeLessThan(0.08);
    expect(Math.abs(peakAt(60) - peakAt(144))).toBeLessThan(0.08);
  });
});

describe('CombatMovement — the two verbs stay different', () => {
  it('keeps the dash short and cheap and the roll long and committed', () => {
    expect(M.ROLL_SEC).toBeGreaterThan(M.DASH_SEC);
    expect(M.ROLL_IFRAMES_SEC).toBeGreaterThan(M.DASH_IFRAMES_SEC);
    expect(M.ROLL_COOLDOWN_SEC).toBeGreaterThan(M.DASH_COOLDOWN_SEC);
    expect(M.ROLL_RECOVER_SEC).toBeGreaterThan(0);
  });

  it('leaves the dash actionable and the roll not — that is what makes one a cancel', () => {
    const d = new CombatMovement();
    d.dash(0, 1); d.update(1 / 60, 0, 0, false);
    expect(d.canAct).toBe(true);

    const r = new CombatMovement();
    r.roll(0, 1); r.update(1 / 60, 0, 0, false);
    expect(r.canAct).toBe(false);
  });

  it('reports invulnerability from either source through one flag', () => {
    const d = new CombatMovement();
    d.dash(0, 1);
    expect(d.update(1 / 60, 0, 0, false).iframes).toBe(true);
    const r = new CombatMovement();
    r.roll(0, 1);
    expect(r.update(1 / 60, 0, 0, false).iframes).toBe(true);
  });
});
