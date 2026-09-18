// BOARD-10PHASE P6 — the balance channel's difficulty and its pay, measured rather than asserted.
import { describe, expect, it } from 'vitest';
import {
  BalanceChannel, GRIND_PTS_PER_SEC, KIND_DRIFT, MANUAL_PTS_PER_SEC, NOSEMANUAL_PTS_PER_SEC,
  type BalanceChannelKind,
} from './GrindManual';

const balanceStub = () => ({ kick: () => {} }) as never;

/** A seeded generator, so a slip time is a number and not a coin flip. */
const seeded = (seed: number) => {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
};

/**
 * MEAN seconds a channel survives with no stick input, across many seeds.
 *
 * Averaged rather than sampled once: the drift's direction flips on its own schedule, so a single run can hold
 * twice as long as another on the same constants. One run proves nothing; the mean over 200 does.
 */
function slipTime(kind: BalanceChannelKind, speed01 = 0.5, runs = 200): number {
  let total = 0;
  for (let n = 0; n < runs; n++) {
    const ch = new BalanceChannel(kind, balanceStub(), seeded(n + 1));
    ch.start(speed01);
    let t = 0;
    for (let i = 0; i < 60 * 30; i++) {
      const r = ch.update(1 / 60, 0, speed01);
      t += 1 / 60;
      if (r.slipped) break;
    }
    total += t;
  }
  return total / runs;
}

/**
 * What a player who reads the needle does.
 *
 * Note the SIGN. In this model the correcting input opposes the needle:
 * `needle += drift + stickX·k`, so reducing a positive needle needs a negative
 * stick. The asymmetry is load-bearing and easy to read backwards.
 */
const correct = (needle: number, gain = 3): number =>
  -Math.sign(needle) * Math.min(1, Math.abs(needle) * gain);

/** Points a channel accrues over `sec` while a player actually reads the needle. */
function heldPoints(kind: BalanceChannelKind, sec: number, speed01 = 0.5): number {
  const ch = new BalanceChannel(kind, balanceStub(), seeded(7));
  ch.start(speed01);
  let pts = 0;
  for (let i = 0; i < 60 * sec; i++) {
    // counter the needle: what a player who can see it does
    const r = ch.update(1 / 60, correct(ch.needle), speed01);
    pts += r.pts;
    if (r.slipped) break;
  }
  return pts;
}

describe('grind and manual are not the same difficulty', () => {
  it('says so in the drift table', () => {
    expect(KIND_DRIFT.grind).toBeLessThan(KIND_DRIFT.manual);
    expect(KIND_DRIFT.manual).toBeLessThan(KIND_DRIFT.nosemanual);
  });

  it('and the drift table is what the channel actually uses', () => {
    // a rail carries the board for you; two wheels do not
    const grind = slipTime('grind');
    const manual = slipTime('manual');
    const nose = slipTime('nosemanual');
    expect(manual).toBeLessThan(grind);
    expect(nose).toBeLessThan(manual);
  });

  it('still lets a player who reads the needle hold any of them', () => {
    for (const kind of ['grind', 'manual', 'nosemanual'] as const) {
      const ch = new BalanceChannel(kind, balanceStub(), seeded(11));
      ch.start(0.5);
      let slipped = false;
      for (let i = 0; i < 60 * 12; i++) {
        const r = ch.update(1 / 60, correct(ch.needle), 0.5);
        if (r.slipped) { slipped = true; break; }
      }
      expect(slipped, `${kind} could not be held for 12 s by a reading player`).toBe(false);
    }
  });

  it('pays a manual less per second than a grind, because its value is the link', () => {
    expect(MANUAL_PTS_PER_SEC).toBeLessThan(GRIND_PTS_PER_SEC);
    expect(NOSEMANUAL_PTS_PER_SEC).toBeLessThan(GRIND_PTS_PER_SEC);
  });

  it('pays the harder manual more than the easier one', () => {
    expect(NOSEMANUAL_PTS_PER_SEC).toBeGreaterThan(MANUAL_PTS_PER_SEC);
  });

  it('raises a manual out of the range that made it not worth linking', () => {
    // it was 45 against a grind's 90 AND harder to hold; half the pay for more attention is a reason never to
    // link one, and the mode's notes recorded zero manual frames in a 40 s run
    expect(MANUAL_PTS_PER_SEC).toBeGreaterThan(50);
    expect(MANUAL_PTS_PER_SEC / GRIND_PTS_PER_SEC).toBeGreaterThan(0.6);
  });

  it('accrues points in the ratio the constants promise', () => {
    const g = heldPoints('grind', 6);
    const m = heldPoints('manual', 6);
    expect(g).toBeGreaterThan(0);
    expect(m).toBeGreaterThan(0);
    expect(m / g).toBeGreaterThan(0.5);
    expect(m / g).toBeLessThan(1);
  });

  it('still punishes hands-off on every channel', () => {
    for (const kind of ['grind', 'manual', 'nosemanual'] as const) {
      expect(slipTime(kind), kind).toBeLessThan(3);
    }
  });

  it('reports the same number twice, which it could not before', () => {
    // start() drew its drift seed from Math.random, so a slip time was a coin flip and no claim about difficulty
    // could be checked at all. This is the guard on that.
    expect(slipTime('manual', 0.5, 30)).toBe(slipTime('manual', 0.5, 30));
  });

  it('drifts harder at speed, on every channel', () => {
    for (const kind of ['grind', 'manual', 'nosemanual'] as const) {
      expect(slipTime(kind, 1.0)).toBeLessThanOrEqual(slipTime(kind, 0.1) + 1e-9);
    }
  });
});
