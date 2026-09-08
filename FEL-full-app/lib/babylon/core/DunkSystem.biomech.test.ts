// DUNK-BIOMECH (2026-09-08): the cue table and the momentum-led turn — pure logic the dunk mode reads every frame.
import { describe, it, expect } from 'vitest';
import { DUNK_TRICKS, DUNK_CUES, CUE_BEAT_T, SPIN_RESOLVE_T, DunkSpin, DunkFlight, cueVerdict, cueFireAt, cueLastAt, cueOf } from './DunkSystem';
import { EASTBAY_TIMING as T } from '../anim/authored/timing';

describe('cue table', () => {
  it('every air trick has a named fire beat and a last beat at or after it', () => {
    for (const t of DUNK_TRICKS) {
      const c = DUNK_CUES[t.id];
      expect(c, t.id).toBeDefined();
      expect(cueLastAt(t)).toBeGreaterThanOrEqual(cueFireAt(t));
    }
  });
  it('the beats are on the flight clock: rise < hang < pre-slam < the extension', () => {
    expect(CUE_BEAT_T.rise).toBe(T.rise);
    expect(CUE_BEAT_T.hang).toBeGreaterThan(CUE_BEAT_T.rise);
    expect(CUE_BEAT_T.preSlam).toBeGreaterThan(CUE_BEAT_T.hang);
    expect(CUE_BEAT_T.preSlam).toBeLessThan(T.extend);
  });
  it('a spinThrough trick can always finish its turn before the wrist reach (last beat < SPIN_RESOLVE_T)', () => {
    for (const t of DUNK_TRICKS) { const c = cueOf(t); if (c.facing === 'spinThrough') { expect(c.turns).toBeGreaterThan(0); expect(cueLastAt(t)).toBeLessThan(SPIN_RESOLVE_T); } }
  });
  it('early / fire / late against the window', () => {
    const spin = DUNK_TRICKS.find((t) => t.id === 'spin360')!;
    expect(cueVerdict(spin, 0.1)).toBe('early');
    expect(cueVerdict(spin, T.rise)).toBe('fire');
    expect(cueVerdict(spin, CUE_BEAT_T.hang)).toBe('fire');
    expect(cueVerdict(spin, 0.75)).toBe('late');
    const scorpion = DUNK_TRICKS.find((t) => t.id === 'scorpion')!;
    expect(cueVerdict(scorpion, T.rise)).toBe('early');   // fires at the hang
    expect(cueVerdict(scorpion, CUE_BEAT_T.hang)).toBe('fire');
  });
});

describe('DunkSpin — the momentum-led turn', () => {
  it('is 0 at the cue, a whole turn (= rim-facing, 0) by the deadline, and half-way round at the middle', () => {
    const s = new DunkSpin();
    s.start(1, 0.3, 1.0);
    expect(s.update(0.3)).toBe(0);
    expect(Math.abs(s.update(0.65) - Math.PI)).toBeLessThan(1e-9);
    expect(s.update(1.0)).toBe(0);
    expect(s.active).toBe(false);
  });
  it('fired later, the same turn is quicker (it spends what flight is left)', () => {
    const early = new DunkSpin(), late = new DunkSpin();
    early.start(1, 0.3, 1.0); late.start(1, 0.6, 1.0);
    const rateEarly = early.update(0.85) - early.update(0.8), rateLate = late.update(0.85) - late.update(0.8);
    expect(rateLate).toBeGreaterThan(rateEarly);
  });
  it('the yaw never runs backwards through the turn', () => {
    const s = new DunkSpin(); s.start(1, 0.3, 1.0);
    let prev = 0;
    for (let t = 0.3; t < 1.0; t += 0.01) { const y = s.update(t); expect(y).toBeGreaterThanOrEqual(prev - 1e-9); prev = y; }
  });
  it('the contact latch settles a cut turn to the nearest whole turn, never back through 180°', () => {
    const s = new DunkSpin(); s.start(1, 0.3, 1.0);
    s.update(0.75);   // ~5/8 of the way round
    const y0 = s.yaw; expect(y0).toBeGreaterThan(Math.PI);
    let y = y0, steps = 0;
    while (s.active && steps++ < 200) { const n = s.settle(1 / 60); if (s.active) expect(n).toBeGreaterThanOrEqual(y - 1e-9); y = n; }   // forward, to 2π (= 0 once there)
    expect(s.active).toBe(false); expect(s.yaw).toBe(0);
    const b = new DunkSpin(); b.start(1, 0.3, 1.0); b.update(0.45);   // early in the turn: back to 0
    const yb = b.yaw; expect(yb).toBeGreaterThan(0); expect(yb).toBeLessThan(Math.PI);
    let steps2 = 0; while (b.active && steps2++ < 200) b.settle(1 / 60);
    expect(b.yaw).toBe(0);
  });
  it('a completed turn replays from its record', () => {
    const s = new DunkSpin(); s.start(1, 0.3, 1.0); const rec = s.record;
    expect(DunkSpin.yawAt(rec, 0.65)).toBeCloseTo(Math.PI, 9);
    expect(DunkSpin.yawAt(rec, 2)).toBe(0);
    expect(DunkSpin.yawAt({ turns: 0, from: 0, until: 0 }, 0.5)).toBe(0);
  });
});

describe('DunkFlight.take / peek', () => {
  it('peek reads the held direction without spending air; take spends it', () => {
    const f = new DunkFlight(); f.launch(1, 3);
    f.recognizer.feed({ t: 'dpad', dir: 'right', pressed: true });
    const press = { t: 'button', btn: 'B', pressed: true } as const;
    const t = f.peek(press); expect(t?.id).toBe('spin360');
    expect(f.attempt.tricks.length).toBe(0);
    expect(f.take(t!)?.id).toBe('spin360');
    expect(f.attempt.tricks.length).toBe(1);
  });
  it('take refuses for air and says so', () => {
    const f = new DunkFlight(); f.launch(0, 3);
    f.update(0.71);   // most of a walk-up's air is gone (1.0 s total: 0.29 left < the 0.30 a first trick needs)
    const t = DUNK_TRICKS.find((x) => x.id === 'eastbay')!;
    expect(f.take(t)).toBeNull(); expect(f.rejectedForAir).toBe(true); expect(f.refusal).toBe('air');
  });
  it('a third trick is refused for the limit, out loud', () => {
    const f = new DunkFlight(); f.launch(1, 8);
    const [a, b, c] = DUNK_TRICKS;
    expect(f.take(a)).not.toBeNull(); expect(f.take(b)).not.toBeNull();
    expect(f.take(c)).toBeNull(); expect(f.refusal).toBe('limit'); expect(f.rejectedForAir).toBe(false);
  });
});
