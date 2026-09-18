// FEL NETPLAY — prediction and reconciliation (2026-09-12).
// Driven with a deterministic 1-D integrator so replay correctness is checkable to the frame.
import { describe, it, expect } from 'vitest';
import { Predictor, CorrectionSmoother } from '../../lib/net/Prediction';

interface S { x: number; v: number }
interface I { thrust: number }
const DT = 1 / 30;
const step = (s: S, i: I, dt: number): S => ({ v: s.v + i.thrust * dt, x: s.x + (s.v + i.thrust * dt) * dt });
const dist = (a: S, b: S) => Math.abs(a.x - b.x);
const mk = (init: S = { x: 0, v: 0 }) => new Predictor<S, I>(init, { step, distance: dist, dt: DT, tolerance: 0.01 });

describe('prediction moves the local body immediately', () => {
  it('the player does not wait for the server to see their own input', () => {
    const p = mk();
    p.predict(1, { thrust: 10 });
    expect(p.state.x).toBeGreaterThan(0);
  });
  it('keeps history for a possible replay', () => {
    const p = mk();
    p.predict(1, { thrust: 1 }); p.predict(2, { thrust: 1 });
    expect(p.pending).toBe(2);
  });
});

describe('reconciliation', () => {
  it('costs nothing when the authority agrees', () => {
    const p = mk();
    const s1 = p.predict(1, { thrust: 10 });
    const r = p.reconcile(1, { ...s1 });
    expect(r.corrected).toBe(false);
    expect(r.replayed).toBe(0);
    expect(p.state.x).toBeCloseTo(s1.x, 12);   // our own present is kept, no re-derivation drift
  });

  it('ignores divergence inside the tolerance - float noise is not a correction', () => {
    const p = mk();
    const s1 = p.predict(1, { thrust: 10 });
    const r = p.reconcile(1, { x: s1.x + 0.005, v: s1.v });
    expect(r.corrected).toBe(false);
  });

  it('REPLAYS later inputs from corrected truth rather than yanking the body to a stale spot', () => {
    const p = mk();
    p.predict(1, { thrust: 10 });
    p.predict(2, { thrust: 10 });
    p.predict(3, { thrust: 10 });
    // authority says tick 1 ended somewhere else entirely
    const r = p.reconcile(1, { x: 5, v: 1 });
    expect(r.corrected).toBe(true);
    expect(r.replayed).toBe(2);                       // ticks 2 and 3 re-simulated
    // the present is truth-at-1 advanced by the two inputs the player really made,
    // NOT the authority's stale tick-1 position
    let expected: S = { x: 5, v: 1 };
    expected = step(expected, { thrust: 10 }, DT);
    expected = step(expected, { thrust: 10 }, DT);
    expect(p.state.x).toBeCloseTo(expected.x, 12);
    expect(p.state.v).toBeCloseTo(expected.v, 12);
  });

  it('settles: a corrected client that keeps agreeing stops correcting', () => {
    const local = mk();
    const server = mk();
    local.predict(1, { thrust: 10 });
    server.predict(1, { thrust: 10 });
    // one divergence, then both run identically
    local.reconcile(1, { x: 99, v: 3 });
    let corrections = 0;
    for (let t = 2; t < 30; t++) {
      const input = { thrust: t % 3 };
      local.predict(t, input);
      const truth = server.predict(t, input);
      // server ran from a different start, so feed ITS state as truth only once more
      if (t === 2) { local.reconcile(t, truth); corrections++; continue; }
      const r = local.reconcile(t, local.state);      // now agreeing
      if (r.corrected) corrections++;
    }
    expect(corrections).toBe(1);
  });

  it('drops settled history so it cannot be corrected twice', () => {
    const p = mk();
    p.predict(1, { thrust: 1 }); p.predict(2, { thrust: 1 }); p.predict(3, { thrust: 1 });
    p.reconcile(2, p.state);
    expect(p.pending).toBe(1);                        // only tick 3 remains open
  });

  it('trusts the authority outright for a tick it never predicted (a fresh join)', () => {
    const p = mk();
    const r = p.reconcile(50, { x: 12, v: 4 });
    expect(r.corrected).toBe(true);
    expect(p.state).toEqual({ x: 12, v: 4 });
  });

  it('reset drops the past for a respawn or an ordered teleport', () => {
    const p = mk();
    p.predict(1, { thrust: 5 });
    p.reset({ x: 0, v: 0 });
    expect(p.pending).toBe(0);
    expect(p.state).toEqual({ x: 0, v: 0 });
  });
});

describe('CorrectionSmoother', () => {
  it('absorbs a jump so the drawn body closes the gap instead of teleporting', () => {
    const s = new CorrectionSmoother();
    s.absorb(0, 0, 0, 1, 0, 0);
    expect(s.magnitude).toBeCloseTo(1, 6);
    expect(s.offset.x).toBeCloseTo(-1, 6);
  });
  it('decays to nothing', () => {
    const s = new CorrectionSmoother();
    s.absorb(0, 0, 0, 1, 0, 0);
    for (let i = 0; i < 120; i++) s.update(1 / 60);
    expect(s.magnitude).toBeLessThan(0.001);
  });
  it('accumulates successive corrections rather than losing one', () => {
    const s = new CorrectionSmoother();
    s.absorb(0, 0, 0, 1, 0, 0);
    s.absorb(0, 0, 0, 1, 0, 0);
    expect(s.magnitude).toBeCloseTo(2, 6);
  });
  it('never leaves the simulation holding the lie - offset is visual only', () => {
    const s = new CorrectionSmoother();
    s.absorb(0, 0, 0, 5, 0, 0);
    s.update(10);                  // a huge dt must not overshoot into a growing offset
    expect(s.magnitude).toBeLessThanOrEqual(5);
  });
});
