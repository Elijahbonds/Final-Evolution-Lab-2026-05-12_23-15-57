// vis-race (visual wave 2) — when a race may replay a moment, and where a vehicle leaves its marks.
import { describe, expect, it } from 'vitest';
import { KILL, OVERTAKE, OvertakeWatch, REPLAY_PACE, ReplayCue, ReplayPacer, TYRE_SPACING_M, TyreTrail, rearAxle, stepPlants, strideLength } from './raceMoments';

/** Run a watch through a race: `places` is the place at each second (from t0). Returns the race seconds a replay fired. */
function run(places: number[], opts: { t0?: number; total?: number; reduced?: boolean; watch?: OvertakeWatch } = {}): number[] {
  const w = opts.watch ?? new OvertakeWatch();
  const t0 = opts.t0 ?? 20, total = opts.total ?? 100;
  const fired: number[] = [];
  const dt = 0.1;
  for (let s = 0; s < places.length; s++) {
    for (let k = 0; k < 10; k++) {
      const t = t0 + s + k * dt;
      if (w.step(places[s], t, Math.min(1, t / total), !!opts.reduced)) fired.push(+t.toFixed(1));
    }
  }
  return fired;
}

describe('the replay pacer', () => {
  it('not early, not twice in a row, not more than twice a race, not at the end, never in reduced motion', () => {
    const p = new ReplayPacer();
    expect(p.allow(REPLAY_PACE.minRaceSec - 0.1, 0.1, false)).toBe(false);   // the field has not sorted itself
    expect(p.allow(REPLAY_PACE.minRaceSec, 0.1, false)).toBe(true);
    expect(p.allow(30, 0.1, true)).toBe(false);                              // reduced motion
    expect(p.allow(30, REPLAY_PACE.endGuard01, false)).toBe(false);          // the finish is never replayed
    expect(p.allow(30, REPLAY_PACE.endGuard01 - 0.01, false)).toBe(true);
    p.commit(30);
    expect(p.allow(30 + REPLAY_PACE.minGapSec - 1, 0.5, false)).toBe(false);
    expect(p.allow(30 + REPLAY_PACE.minGapSec, 0.5, false)).toBe(true);
    p.commit(60);
    expect(p.count).toBe(2);
    expect(p.allow(200, 0.5, false)).toBe(false);                            // two a race
    p.reset();
    expect(p.allow(200, 0.5, false)).toBe(true);
  });
});

describe('the overtake watch', () => {
  it('taking the lead replays once, a beat after the pass', () => {
    const fired = run([3, 3, 2, 2, 1, 1, 1, 1, 1, 1]);   // second 4: a pass for the lead
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBeCloseTo(20 + 4 + OVERTAKE.settleSec, 0);
  });
  it('two places inside four seconds is big; one place is not', () => {
    expect(run([5, 5, 4, 4, 3, 3, 3, 3, 3])).toHaveLength(1);   // 5 → 4 → 3: two places in two seconds
    expect(run([5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4])).toHaveLength(0);   // one place
    // two places, but eight seconds apart: the window forgot the first
    expect(run([5, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3])).toHaveLength(0);
  });
  it('a pass that does not hold through the settle beat is not a highlight; one that does is', () => {
    const lost = new OvertakeWatch();
    let fired = false;
    const f = (place: number, t: number): void => { if (lost.step(place, t, t / 100, false)) fired = true; };
    f(3, 20); f(3, 20.1); f(1, 20.2);               // the lead taken…
    f(3, 20.4); f(3, 20.8); f(3, 21.5);            // …and handed straight back inside the beat
    expect(fired).toBe(false);
    const held = new OvertakeWatch();
    let ok = false;
    for (const [pl, t] of [[3, 20], [3, 20.1], [1, 20.2], [1, 20.5], [1, 20.95], [3, 21.5]] as const) if (held.step(pl, t, t / 100, false)) ok = true;
    expect(ok).toBe(true);                          // held for OVERTAKE.settleSec: it plays, whatever happens after
  });
  it('never inside the first seconds, never at the end, never in reduced motion', () => {
    expect(run([3, 3, 1, 1, 1, 1], { t0: 2 })).toHaveLength(0);
    expect(run([3, 3, 1, 1, 1, 1], { t0: 88, total: 100 })).toHaveLength(0);   // 88 % in: the finish is played, not replayed
    expect(run([3, 3, 1, 1, 1, 1], { reduced: true })).toHaveLength(0);
  });
  it('at most two a race, with a gap between them', () => {
    const w = new OvertakeWatch();
    // lead taken, lost, taken again 4 s later (inside the gap), again 30 s later, again 70 s after that
    const seq = [3, 3, 1, 1, 1, 3, 3, 3, 1, 1, 1, ...Array(30).fill(3), 1, 1, 1, ...Array(70).fill(3), 1, 1, 1];
    const fired = run(seq, { watch: w, total: 400 });
    expect(fired).toHaveLength(2);
    expect(fired[1] - fired[0]).toBeGreaterThanOrEqual(REPLAY_PACE.minGapSec);
    expect(w.pacer.count).toBe(2);
  });
  it('reset starts a new race clean', () => {
    const w = new OvertakeWatch();
    expect(run([3, 3, 1, 1, 1, 1], { watch: w })).toHaveLength(1);
    w.reset();
    expect(run([3, 3, 1, 1, 1, 1], { watch: w })).toHaveLength(1);
  });
});

describe('the replay cue (the plane\'s kill)', () => {
  it('armed by a hit, fires after the settle beat if it stands; cancelled when it does not', () => {
    const c = new ReplayCue(new ReplayPacer());
    expect(c.arm(30, 0.3, false, KILL.settleSec)).toBe(true);
    expect(c.arm(30.2, 0.3, false, KILL.settleSec)).toBe(false);   // one at a time
    expect(c.step(30.5, 0.3, false, true)).toBe(false);
    expect(c.step(31.0, 0.3, false, true)).toBe(true);
    expect(c.step(31.1, 0.3, false, true)).toBe(false);            // once
    expect(c.arm(40, 0.4, false, KILL.settleSec)).toBe(false);     // the gap
    const d = new ReplayCue(new ReplayPacer());
    d.arm(30, 0.3, false, KILL.settleSec);
    expect(d.step(30.6, 0.3, false, false)).toBe(false);           // the moment no longer stands
    expect(d.armed).toBe(false);
  });
  it('a kill that lands in the closing stretch is not offered at all', () => {
    expect(new ReplayCue(new ReplayPacer()).arm(80, REPLAY_PACE.endGuard01, false, 1)).toBe(false);
  });
  it('the race running into the closing stretch while armed drops the replay (it would sit on the finish)', () => {
    const c = new ReplayCue(new ReplayPacer());
    c.arm(80, 0.85, false, 1);
    expect(c.step(81, REPLAY_PACE.endGuard01 + 0.01, false, true)).toBe(false);
    expect(c.armed).toBe(false);
  });
});

describe('tyre marks', () => {
  it('one stamp to start, then one every TYRE_SPACING_M along the path, turned to the travel', () => {
    const t = new TyreTrail();
    const first = t.step(0, 0, 0, 10, true);
    expect(first).toHaveLength(1);
    expect(first[0].yaw).toBeCloseTo(0, 9);                 // travelling +z
    let n = 0;
    for (let i = 1; i <= 100; i++) n += t.step(0, i * 0.2, 0, 10, true).length;   // 20 m
    expect(n).toBe(Math.floor(20 / TYRE_SPACING_M));
    const side = new TyreTrail(); side.step(0, 0, 10, 0, true);
    expect(side.step(5, 0, 10, 0, true)[0].yaw).toBeCloseTo(Math.PI / 2, 9);        // travelling +x
  });
  it('lets go: the streak ends, the next slide starts a new one where it is', () => {
    const t = new TyreTrail();
    t.step(0, 0, 0, 1, true);
    expect(t.step(0, 5, 0, 1, false)).toEqual([]);
    const again = t.step(0, 50, 0, 1, true);
    expect(again).toHaveLength(1);
    expect(again[0].z).toBe(50);                           // not a streak back to where it was
  });
  it('a huge step fills the gap (bounded), a standing burnout stamps once', () => {
    const t = new TyreTrail(); t.step(0, 0, 0, 1, true);
    const out = t.step(0, 8.5, 0, 1, true);
    expect(out).toHaveLength(5);
    expect(out.map((s) => +s.z.toFixed(2))).toEqual([1.6, 3.2, 4.8, 6.4, 8]);
    const b = new TyreTrail();
    expect(b.step(3, 3, 0, 0, true)).toHaveLength(1);
    expect(b.step(3, 3, 0, 0, true)).toEqual([]);
  });
  it('the rear axle is behind the centre along the heading', () => {
    expect(rearAxle(0, 0, 0, 0.74).z).toBeCloseTo(-0.74, 9); expect(rearAxle(0, 0, 0, 0.74).x).toBeCloseTo(0, 9);
    const r = rearAxle(10, 10, Math.PI / 2, 1);
    expect(r.x).toBeCloseTo(9, 9); expect(r.z).toBeCloseTo(10, 9);
  });
});

describe('foot plants', () => {
  it('a sprinter\'s stride lengthens with speed, within limits', () => {
    expect(strideLength(0)).toBe(1.2);
    expect(strideLength(5)).toBeLessThan(strideLength(10));
    expect(strideLength(100)).toBe(2.6);
  });
  it('feet land alternately, one stride apart', () => {
    const s = { nextM: 0.5, i: 0 };
    const plants = stepPlants(s, 10, 8);
    expect(plants.length).toBeGreaterThan(3);
    expect(plants.map((p) => p.foot).slice(0, 4)).toEqual(['L', 'R', 'L', 'R']);
    expect(plants[1].m - plants[0].m).toBeCloseTo(strideLength(8), 9);
    expect(stepPlants(s, 10, 8)).toEqual([]);   // nothing new until it has run on
  });
});
