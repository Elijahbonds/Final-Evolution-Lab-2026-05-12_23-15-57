// DUNK-BIOMECH (2026-09-08): the cue table and the momentum-led turn — pure logic the dunk mode reads every frame.
import { describe, it, expect } from 'vitest';
import { DUNK_TRICKS, DUNK_CUES, CUE_BEAT_T, SPIN_RESOLVE_T, SPIN_LAND_FRAC, DunkSpin, DunkFlight, cueVerdict, cueFireAt, cueLastAt, cueOf } from './DunkSystem';
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
    expect(Math.abs(s.update(0.3 + 0.7 * SPIN_LAND_FRAC / 2) - Math.PI)).toBeLessThan(1e-9);   // half-way at the middle of the TURN
    expect(s.update(0.3 + 0.7 * SPIN_LAND_FRAC)).toBe(0);                                       // landed, and square from there
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
    for (let t = 0.3; t < 0.3 + 0.7 * SPIN_LAND_FRAC - 0.01; t += 0.01) { const y = s.update(t); expect(y).toBeGreaterThanOrEqual(prev - 1e-9); prev = y; }
    expect(s.update(0.3 + 0.7 * SPIN_LAND_FRAC)).toBe(0);   // and the landing frame is rim-facing, not 2*PI
  });
  it('the contact latch settles a cut turn to the nearest whole turn, never back through 180°', () => {
    const s = new DunkSpin(); s.start(1, 0.3, 1.0);
    s.update(0.3 + 0.7 * SPIN_LAND_FRAC * 0.62);   // ~5/8 of the way round
    const y0 = s.yaw; expect(y0).toBeGreaterThan(Math.PI);
    let y = y0, steps = 0;
    while (s.active && steps++ < 200) { const n = s.settle(1 / 60); if (s.active) expect(n).toBeGreaterThanOrEqual(y - 1e-9); y = n; }   // forward, to 2π (= 0 once there)
    expect(s.active).toBe(false); expect(s.yaw).toBe(0);
    const b = new DunkSpin(); b.start(1, 0.3, 1.0); b.update(0.3 + 0.7 * SPIN_LAND_FRAC * 0.25);   // early in the turn: back to 0
    const yb = b.yaw; expect(yb).toBeGreaterThan(0); expect(yb).toBeLessThan(Math.PI);
    let steps2 = 0; while (b.active && steps2++ < 200) b.settle(1 / 60);
    expect(b.yaw).toBe(0);
  });
  it('a completed turn replays from its record', () => {
    const s = new DunkSpin(); s.start(1, 0.3, 1.0); const rec = s.record;
    expect(DunkSpin.yawAt(rec, 0.3 + 0.7 * SPIN_LAND_FRAC / 2)).toBeCloseTo(Math.PI, 9);
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
  // DUNK-BODY-MID (2026-09-09): the air is read ONCE, at the takeoff. A walk-up's FIRST trick always fits (the cue
  // table is the timing gate); it is the SECOND one the run-up decides, and the refusal is knowable before the flight.
  it('a walk-up still throws its first trick, deep into the flight', () => {
    const f = new DunkFlight(); f.launch(0, 3);   // airTotal 1.0 s — under COMBO_AIR_SEC, so one trick fits
    expect(f.trickCapacity).toBe(1);
    f.update(0.71);   // most of the air is gone; the cue window, not the budget, owns this press
    const t = DUNK_TRICKS.find((x) => x.id === 'eastbay')!;
    expect(f.take(t)?.id).toBe('eastbay'); expect(f.rejectedForAir).toBe(false); expect(f.refusal).toBeNull();
  });
  it("a walk-up's SECOND trick is refused for air, out loud", () => {
    const f = new DunkFlight(); f.launch(0, 3);
    expect(f.take(DUNK_TRICKS[0])).not.toBeNull();
    expect(f.canTake()).toBe(false);
    expect(f.take(DUNK_TRICKS[1])).toBeNull(); expect(f.rejectedForAir).toBe(true); expect(f.refusal).toBe('air');
  });
  it('a real run-up buys the combo the walk-up could not have', () => {
    const f = new DunkFlight(); f.launch(0.7, 3);   // airTotal 1.385 s — a real run-up, short of the full-speed attack a TRIPLE needs
    expect(f.trickCapacity).toBe(2);
    const spin = DUNK_TRICKS.find((x) => x.id === 'spin360')!, mill = DUNK_TRICKS.find((x) => x.id === 'windmill')!;
    expect(f.take(spin)?.id).toBe('spin360');
    f.update(0.19);   // clip 0.30 → 0.49: the beat the baseline refused the windmill on ("refused windmill @0.49: air")
    expect(f.take(mill)?.id).toBe('windmill');
    expect(f.attempt.isCombo).toBe(true);
  });
  it('ONE DIRECTION, ONE TRICK — the A that follows a windmill under the same hold is not another windmill', () => {
    const f = new DunkFlight(); f.launch(1, 3);
    const press = { t: 'button', btn: 'A', pressed: true } as const;
    f.recognizer.feed({ t: 'dpad', dir: 'up', pressed: true });
    expect(f.peek(press)?.id).toBe('windmill');
    expect(f.recognizer.dirSpent).toBe(false);
    f.take(f.peek(press)!); f.recognizer.spend();
    expect(f.recognizer.dirSpent).toBe(true);          // the mode reads the SLAM out of this press
    f.recognizer.feed({ t: 'dpad', dir: 'up', pressed: false });
    f.recognizer.feed({ t: 'dpad', dir: 'up', pressed: true });
    expect(f.recognizer.dirSpent).toBe(false);         // let go and press again and the direction speaks for a trick once more
  });
  // THE RUN-UP BUYS THE CHAIN (2026-09-16). It used to buy at most two, full stop. The owner's "360 eastbay scorpion"
  // is three, so there is a third tier — but only at the very top of the budget (a full-speed attack with a SIGNATURE
  // called is 1.80 s against a 1.72 s bar), and one past whatever this flight bought is still refused OUT LOUD.
  it('a walk-up gets one, and the second is refused for the AIR', () => {
    const f = new DunkFlight(); f.launch(0.2, 3);
    const [a, b] = DUNK_TRICKS;
    expect(f.take(a)).not.toBeNull();
    expect(f.take(b)).toBeNull(); expect(f.refusal).toBe('air'); expect(f.rejectedForAir).toBe(true);
  });
  it('a real run-up gets two, and the third is refused for the LIMIT', () => {
    const f = new DunkFlight(); f.launch(0.7, 3);
    const [a, b, c] = DUNK_TRICKS;
    expect(f.take(a)).not.toBeNull(); expect(f.take(b)).not.toBeNull();
    expect(f.take(c)).toBeNull(); expect(f.refusal).toBe('limit'); expect(f.rejectedForAir).toBe(false);
  });
  it('a FULL-SPEED attack buys THREE, and the fourth is refused', () => {
    const f = new DunkFlight(); f.launch(1, 3);
    const [a, b, c, d] = DUNK_TRICKS;
    expect(f.take(a)).not.toBeNull(); expect(f.take(b)).not.toBeNull(); expect(f.take(c)).not.toBeNull();
    expect(f.take(d)).toBeNull(); expect(f.refusal).toBe('limit'); expect(f.rejectedForAir).toBe(false);
  });
  it('calling a bigger style buys slack on the speed, rather than being required for a triple', () => {
    const cap = (speed: number, tier: number) => { const f = new DunkFlight(); f.launch(speed, tier); return f.capacity; };
    expect(cap(0.75, 8)).toBe(3);   // signature: three-quarter speed still gets it
    expect(cap(0.75, 3)).toBe(2);   // power at the same speed does not
    // and the bar is not sitting on the exact value of a float sum: a full-speed POWER attack "is" 1.55 and evaluates
    // to 1.5499999999999998, which is how the first two attempts at this constant refused the dunk they were sized for
    expect(cap(1, 3)).toBe(3);
  });
  it('and a triple costs most of the slam window — it should be the hardest thing in the mode', () => {
    const one = new DunkFlight(); one.launch(1, 8); one.take(DUNK_TRICKS[0]);
    const three = new DunkFlight(); three.launch(1, 8);
    for (const t of DUNK_TRICKS.slice(0, 3)) three.take(t);
    expect(three.slamWindow).toBeLessThan(one.slamWindow * 0.75);
  });
});

// DUNK-BODY-MID (2026-09-09): the turn LANDS inside its window and holds square into the carry-up.
describe('DunkSpin.yawAt — the turn lands, then the body holds', () => {
  const rec = { turns: 1, from: 0.7, until: 1.0 };   // a 360 called at the HANG: the tightest turn the cue table allows
  it('is square to the rim before the window ends, not on its last frame', () => {
    expect(DunkSpin.yawAt(rec, 0.7)).toBe(0);                       // the wind-up starts at 0
    expect(Math.abs(DunkSpin.yawAt(rec, 0.94))).toBe(0);            // landed by 80 % of the window
    expect(Math.abs(DunkSpin.yawAt(rec, 1.0))).toBe(0);
    expect(Math.abs(DunkSpin.yawAt(rec, 0.85))).toBeGreaterThan(0);  // and it is genuinely turning before that
  });
  it('keeps the peak turn rate inside 40 deg a frame at 60 fps', () => {
    let peak = 0;
    for (let t = rec.from; t < rec.until; t += 1 / 60) {
      const d = Math.abs(DunkSpin.yawAt(rec, t + 1 / 60) - DunkSpin.yawAt(rec, t));
      if (d < Math.PI) peak = Math.max(peak, d);   // skip the wrap on the frame the turn completes
    }
    expect(peak * 180 / Math.PI).toBeLessThan(40);
  });
  it('a turn called at the rise is gentler than one called at the hang', () => {
    const early = { turns: 1, from: 0.3, until: 1.0 };
    const rate = (r: typeof early, t: number) => Math.abs(DunkSpin.yawAt(r, t + 1 / 60) - DunkSpin.yawAt(r, t));
    expect(rate(early, 0.3 + 0.28)).toBeLessThan(rate(rec, 0.7 + 0.12));
  });
});
