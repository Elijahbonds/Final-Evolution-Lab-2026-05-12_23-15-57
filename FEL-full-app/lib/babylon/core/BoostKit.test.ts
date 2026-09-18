import { describe, it, expect } from 'vitest';
import { BoostKit, BOOST_BURN_SEC, BOOST_MIN_START, BOOST_TOP_SPEED, BOOST_EARN, BOOST_PAD_FILL } from './BoostKit';

const run = (b: BoostKit, sec: number, held: boolean, dt = 1 / 60) => { const out = { started: 0, ended: 0, full: 0, empty: 0, denied: 0 }; for (let t = 0; t < sec; t += dt) { const e = b.update(dt, held); for (const k of Object.keys(out) as (keyof typeof out)[]) if (e[k]) out[k]++; } return out; };

describe('BoostKit — one boost for every speed mode', () => {
  it('skill and pads fill it; the same event pays the same everywhere; it never overfills', () => {
    const b = new BoostKit();
    b.earn('trickBig'); expect(b.meter).toBeCloseTo(BOOST_EARN.trickBig, 5);
    b.pad(); expect(b.meter).toBeCloseTo(BOOST_EARN.trickBig + BOOST_PAD_FILL, 5);
    b.earnOver('drift', 0.5); expect(b.meter).toBeCloseTo(BOOST_EARN.trickBig + BOOST_PAD_FILL + BOOST_EARN.drift * 0.5, 5);
    for (let i = 0; i < 10; i++) b.pad();
    expect(b.meter).toBe(1);
  });

  it('HOLD burns: a full meter lasts BOOST_BURN_SEC, release stops it and keeps the rest', () => {
    const b = new BoostKit(1);
    const e = run(b, 1, true);
    expect(e.started).toBe(1); expect(b.burning).toBe(true);
    expect(b.meter).toBeCloseTo(1 - 1 / BOOST_BURN_SEC, 1);
    const kept = b.meter;
    run(b, 0.5, false);
    expect(b.burning).toBe(false); expect(b.meter).toBeCloseTo(kept, 5);
    const e2 = run(b, BOOST_BURN_SEC, true);
    expect(e2.empty).toBe(1); expect(b.meter).toBe(0); expect(b.burning).toBe(false);
  });

  it('needs a little in the tank to START, but never flickers once lit', () => {
    const b = new BoostKit(BOOST_MIN_START * 0.5);
    expect(run(b, 0.5, true).started).toBe(0);
    b.reset(BOOST_MIN_START + 0.01);
    const e = run(b, 1, true);
    expect(e.started).toBe(1); expect(e.ended).toBe(1);     // one start, one end — not a start/stop per frame
  });

  it('the speed ramps in and bleeds out; top speed is +40% at a full burn, 1× at rest', () => {
    const b = new BoostKit(1);
    expect(b.speedMult()).toBe(1);
    b.update(1 / 60, true);
    expect(b.speedMult()).toBeGreaterThan(1); expect(b.speedMult()).toBeLessThan(1.1);   // not a snap
    run(b, 0.8, true);
    expect(b.speedMult()).toBeCloseTo(BOOST_TOP_SPEED, 2);
    run(b, 0.1, false);
    expect(b.k).toBeGreaterThan(0.5);                                                    // bleeds, not a cliff
    run(b, 2, false);
    expect(b.speedMult()).toBe(1);
  });

  it('the ramp is frame-rate independent (the same wall-clock curve at 30, 60 and 144 fps)', () => {
    const at = (fps: number) => { const b = new BoostKit(1); run(b, 0.12, true, 1 / fps); return b.k; };
    expect(Math.abs(at(30) - at(144))).toBeLessThan(0.05);
    expect(Math.abs(at(60) - at(144))).toBeLessThan(0.03);
  });

  it('FULL is one event per fill, and the HUD carries meter / burning / full', () => {
    const b = new BoostKit(0.95);
    b.add(0.1);
    expect(run(b, 0.1, false).full).toBe(1);
    b.add(0.01); expect(run(b, 0.1, false).full).toBe(0);    // topping a full meter does not re-flash
    expect(b.hud()).toEqual({ boost: 100, boosting: false, boostFull: true, boostDenied: false });
    run(b, 0.5, true);
    expect(b.hud().boostFull).toBe(false);                   // burned below the exit line
    b.add(1); expect(run(b, 0.05, false).full).toBe(1);      // a second fill flashes again
  });

  it('hudIfChanged only reports a change', () => {
    const b = new BoostKit(0.5);
    expect(b.hudIfChanged()).toEqual({ boost: 50, boosting: false, boostFull: false, boostDenied: false });
    expect(b.hudIfChanged()).toBeNull();
    b.add(0.2); expect(b.hudIfChanged()?.boost).toBe(70);
  });

  it('a mode can forbid the burn (mid-wipeout) without losing the meter', () => {
    const b = new BoostKit(0.6);
    for (let i = 0; i < 30; i++) b.update(1 / 60, true, false);
    expect(b.burning).toBe(false); expect(b.meter).toBeCloseTo(0.6, 5);
  });

  it('MECHANICS: a press with an empty tank is DENIED once, and the HUD says so for a moment', () => {
    const b = new BoostKit(0);
    const e = run(b, 0.5, true);
    expect(e.denied).toBe(1); expect(e.started).toBe(0);          // one event for the press, not one per held frame
    expect(b.hud().boostDenied).toBe(true);
    run(b, 1.0, false);
    expect(b.hud().boostDenied).toBe(false);
    b.add(0.5); expect(run(b, 0.2, true).denied).toBe(0);         // with fuel, the press lights instead
  });
});
