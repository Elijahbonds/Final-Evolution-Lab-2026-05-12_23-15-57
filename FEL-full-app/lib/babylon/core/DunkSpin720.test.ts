// THE 720 (DUNK MOTION phase 10b, owner 2026-09-24: "720"). The 360 thrown again while it is still turning carries straight on into
// a second revolution — DunkSpin.extend re-plans the turn from where the body IS and how fast it is GOING, so the second turn is the
// first one continuing, never a restart (a second spin.start used to snap the yaw layer back to the wind-up mid-turn).
import { describe, it, expect } from 'vitest';
import { DunkSpin, DunkFlight, DUNK_TRICKS, DUNK_CUES, SPIN_720, SPIN_720_UPGRADE_BY, SIGNATURE_DUNKS, cueOf, type SpinRecord } from './DunkSystem';
import { spinProgress } from './DunkSpinBody';

const TAU = Math.PI * 2;
const rate = (rec: SpinRecord, t: number, h = 1 / 480): number => (DunkSpin.yawAt(rec, t + h) - DunkSpin.yawAt(rec, t - h)) / (2 * h);

describe('DunkSpin.extend — the 360 carries on into a 720', () => {
  const extended = (at: number): { before: SpinRecord; after: SpinRecord } => {
    const s = new DunkSpin(); s.start(1, 0.3, 1.0);
    const before = s.record;
    expect(s.extend(1, at, 1.0)).toBe(true);
    return { before, after: s.record };
  };

  it('leaves from exactly where the body is, exactly as fast as it is turning', () => {
    for (const at of [0.36, 0.45, 0.55]) {
      const { before, after } = extended(at);
      expect(DunkSpin.yawAt(after, at)).toBeCloseTo(DunkSpin.yawAt(before, at), 9);
      expect(rate(after, at + 2e-4, 1e-4) / rate(before, at - 2e-4, 1e-4)).toBeCloseTo(1, 1);   // C1 at the join (the acceleration may change)
    }
  });

  it('turns two whole turns, never backwards and never past the second one, then lands rim-facing', () => {
    const { after } = extended(0.45);
    let prev = DunkSpin.yawAt(after, 0.3), peak = 0;
    for (let t = 0.3; t < 1.2; t += 1 / 240) {
      const y = DunkSpin.yawAt(after, t);
      if (y !== 0) { expect(y).toBeGreaterThanOrEqual(prev - 1e-9); peak = Math.max(peak, y); prev = y; }
    }
    expect(peak).toBeGreaterThan(2 * TAU - 0.05);
    expect(peak).toBeLessThanOrEqual(2 * TAU + 1e-6);
    expect(DunkSpin.yawAt(after, 1.0)).toBe(0);   // two whole turns ARE rim-facing
  });

  it('the replay reads the whole turn: the 360 before the second press, the 720 after it', () => {
    const { before, after } = extended(0.45);
    for (const t of [0.32, 0.38, 0.44]) expect(DunkSpin.yawAt(after, t)).toBeCloseTo(DunkSpin.yawAt(before, t), 9);
    expect(after.prev).toBeDefined();
  });

  it('the body around the turn reads ONE window from where it began (the tuck never re-opens between the turns)', () => {
    const { after } = extended(0.45);
    expect(spinProgress(after, 0.3)).toBe(0);
    expect(spinProgress(after, 0.65)).toBeCloseTo(0.5, 5);
  });

  it('turns the way the 360 was turning (the mirrored body turns the other way round)', () => {
    const s = new DunkSpin(); s.start(-1, 0.3, 1.0); s.extend(-1, 0.45, 1.0);
    expect(s.record.turns).toBe(-2);
    expect(DunkSpin.yawAt(s.record, 0.7)).toBeLessThan(-TAU);
  });

  it('nothing to extend when nothing is turning', () => {
    const s = new DunkSpin();
    expect(s.extend(1, 0.4, 1.0)).toBe(false);
    s.start(1, 0.3, 1.0); s.update(1.1);   // landed
    expect(s.extend(1, 1.1, 1.2)).toBe(false);
  });

  it('a plain turn is still the old smoothstep (y0 = v0 = 0)', () => {
    const rec = { turns: 1, from: 0.3, until: 1.0 };
    const d = 0.7 * 0.8;
    for (const u of [0.1, 0.25, 0.5, 0.75, 0.9]) expect(DunkSpin.yawAt(rec, 0.3 + u * d)).toBeCloseTo(TAU * u * u * (3 - 2 * u), 9);
  });
});

describe('the 720 in the flight', () => {
  it('is the 360 grown, not a second trick: the same slot, the bigger window tax', () => {
    const f = new DunkFlight(); f.launch(1, 3);
    const spin360 = DUNK_TRICKS.find((t) => t.id === 'spin360')!;
    expect(f.take(spin360)).not.toBeNull();
    expect(f.upgrade('spin360', SPIN_720)).toBe(true);
    expect(f.attempt.tricks.map((t) => t.id)).toEqual(['spin720']);
    expect(f.slamWindowScale).toBeCloseTo(1 - SPIN_720.windowCost * 0.5, 9);
    expect(f.upgrade('spin360', SPIN_720)).toBe(false);   // nothing left to grow
  });

  it('two turns, the 360\'s window, harder than it, and credited', () => {
    expect(DUNK_CUES.spin720.turns).toBe(2);
    expect(cueOf(SPIN_720).fire).toBe(DUNK_CUES.spin360.fire);
    expect(cueOf(SPIN_720).last).toBe(DUNK_CUES.spin360.last);
    expect(SPIN_720.difficulty).toBeGreaterThan(DUNK_TRICKS.find((t) => t.id === 'spin360')!.difficulty);
    expect(SPIN_720_UPGRADE_BY).toBeGreaterThan(0.3); expect(SPIN_720_UPGRADE_BY).toBeLessThan(0.8);
    expect(SIGNATURE_DUNKS.find((s) => s.air.length === 1 && s.air[0] === 'spin720')?.name).toBe('THE 720');
  });

  it('has no direction + button slot of its own (it is the 360\'s press, thrown again)', () => {
    expect(DUNK_TRICKS.some((t) => t.id === 'spin720')).toBe(false);
  });
});
