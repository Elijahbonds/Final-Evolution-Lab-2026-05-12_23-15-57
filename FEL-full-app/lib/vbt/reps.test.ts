// Rep segmentation's edge cases: pauses, partial reps, bounce, a sticking point, a deadlift from the floor, the walk-out
// and a long noisy hold (no ghost reps), and the live read agreeing with the final one.
import { describe, expect, it } from 'vitest';
import { filmSet, type BenchRep, type SetSpec } from './bench';
import { LIFTS, type LiftId } from './lifts';
import { VbtLive } from './live';
import { readSet } from './reps';
import { trackOf } from './track';

function read(lift: LiftId, spec: SetSpec, fps = 60, seed = 2) {
  const f = filmSet(LIFTS[lift], spec, { fps, seed, plate: LIFTS[lift].point === 'bar' });
  const tr = trackOf(LIFTS[lift], f.frames, f.aspect, f.heightM);
  if (!tr.ok) throw new Error(tr.why);
  return { r: readSet(LIFTS[lift], tr.track), truth: f.truth, frames: f.frames, aspect: f.aspect, heightM: f.heightM };
}

const rep = (v: number, o: Partial<BenchRep> = {}): BenchRep => ({ romM: 0.5, concMs: (0.5 / v) * 1000, ...o });

describe('rep segmentation', () => {
  it('a long bottom pause is a pause, not a split rep; its length is read', () => {
    const { r } = read('back_squat', { reps: [rep(0.7, { pauseMs: 2000 }), rep(0.6, { pauseMs: 1500 })] });
    expect(r.counted).toBe(2);
    expect(r.reps[0].pauseMs!).toBeGreaterThan(1700);
    expect(r.reps[0].pauseMs!).toBeLessThan(2300);
    expect(r.reps.every((x) => !x.bounce)).toBe(true);
  });

  it('touch-and-go: a bounce, still one rep each', () => {
    const { r } = read('bench_press', { reps: [rep(0.6, { romM: 0.4, pauseMs: 0, eccMs: 600 }), rep(0.55, { romM: 0.4, pauseMs: 0, eccMs: 600 }), rep(0.5, { romM: 0.4, pauseMs: 0, eccMs: 600 })] });
    expect(r.counted).toBe(3);
    expect(r.reps.slice(1).every((x) => x.bounce)).toBe(true);
  });

  it('a partial rep is listed, not counted, and left out of the velocity loss', () => {
    const { r } = read('back_squat', { reps: [rep(0.8), rep(0.75), rep(0.9, { romM: 0.22 }), rep(0.6)] });
    expect(r.reps).toHaveLength(4);
    expect(r.reps.map((x) => x.partial)).toEqual([false, false, true, false]);
    expect(r.counted).toBe(3);
    expect(r.partials).toBe(1);
    expect(r.reps[2].lossPct).toBeNull();
    // loss vs the fastest counted rep (0.8), the partial's 0.9 never the reference
    expect(r.lossPct!).toBeGreaterThan(20);
    expect(r.lossPct!).toBeLessThan(30);
  });

  it('a sticking point is one rep', () => {
    const { r } = read('back_squat', { reps: [rep(0.4, { stick: 0.85 }), rep(0.4, { stick: 0.85 })] });
    expect(r.counted).toBe(2);
  });

  it('a deadlift starts from the floor: no lowering before the first pull', () => {
    const { r } = read('deadlift', { fromFloor: true, reps: [rep(0.6, { romM: 0.55 }), rep(0.5, { romM: 0.55, eccMs: 700, pauseMs: 400 })] });
    expect(r.counted).toBe(2);
    expect(r.reps[0].eccMs).toBeNull();
    expect(r.reps[1].eccMs).not.toBeNull();
  });

  it('no ghost reps from a long, noisy hold or small re-grips', () => {
    const { r } = read('back_squat', { reps: [rep(0.7, { topMs: 4000 }), rep(0.65, { topMs: 4000 })], leadMs: 3000, tailMs: 3000 }, 30, 5);
    expect(r.counted).toBe(2);
    expect(r.partials).toBe(0);
    const tiny = read('back_squat', { reps: [rep(0.6, { romM: 0.05 }), rep(0.6, { romM: 0.06 })] });
    expect(tiny.r.reps).toHaveLength(0);       // a 5 cm re-rack is not a rep at all
  });

  it('eccentric, concentric and lockout are in order', () => {
    const { r, truth } = read('back_squat', { reps: [rep(0.7), rep(0.6)] });
    for (const [i, x] of r.reps.entries()) {
      expect(x.eccStartT!).toBeLessThan(x.startT);
      expect(x.startT).toBeLessThan(x.endT);
      expect(Math.abs(x.startT - truth[i].startT)).toBeLessThan(60);
      expect(Math.abs(x.endT - truth[i].endT)).toBeLessThan(60);
      expect(x.mpv).toBeGreaterThanOrEqual(x.mcv - 0.02);
      expect(x.pv).toBeGreaterThan(x.mcv);
    }
  });

  it('velocity loss and the auto-stop cue (live) at the 20 % default', () => {
    const spec: SetSpec = { reps: [0.8, 0.78, 0.74, 0.7, 0.66, 0.62].map((v) => rep(v)) };
    const f = filmSet(LIFTS.back_squat, spec, { fps: 60, seed: 3, plate: true });
    const live = new VbtLive({ lift: 'back_squat', loadKg: 100, heightM: f.heightM, aspect: f.aspect });
    const seen: { reps: number; stop: boolean }[] = [];
    for (const fr of f.frames) { const v = live.push(fr); seen.push({ reps: v.read?.counted ?? 0, stop: v.stop }); }
    // the reps appear one by one, live, and the cue comes on at the rep whose loss passes 20 % (0.62 vs 0.80 = 22.5 %)
    expect(Math.max(...seen.map((s) => s.reps))).toBe(6);
    const firstStop = seen.findIndex((s) => s.stop);
    expect(seen[firstStop].reps).toBe(6);
    const fin = live.finish();
    expect(fin.read!.counted).toBe(6);
    expect(fin.stop).toBe(true);
    expect(fin.headline!.kind).toBe('mcv');
    // a coach's 30 % line: no cue
    const live30 = new VbtLive({ lift: 'back_squat', loadKg: 100, heightM: f.heightM, aspect: f.aspect, lossStopPct: 30 });
    for (const fr of f.frames) live30.push(fr);
    expect(live30.finish().stop).toBe(false);
  });

  it('the camera clock: an uneven, dropped-frame feed reads the same reps', () => {
    const spec: SetSpec = { reps: [rep(0.8), rep(0.6)] };
    const even = filmSet(LIFTS.back_squat, spec, { fps: 60, seed: 8, plate: true, timeJitterMs: 0, dropShare: 0 });
    const rough = filmSet(LIFTS.back_squat, spec, { fps: 60, seed: 8, plate: true, timeJitterMs: 4, dropShare: 0.15 });
    const a = readSet(LIFTS.back_squat, (trackOf(LIFTS.back_squat, even.frames, even.aspect, 1.78) as { ok: true; track: never }).track);
    const b = readSet(LIFTS.back_squat, (trackOf(LIFTS.back_squat, rough.frames, rough.aspect, 1.78) as { ok: true; track: never }).track);
    expect(b.counted).toBe(2);
    a.reps.forEach((x, i) => expect(Math.abs(x.mcv - b.reps[i].mcv)).toBeLessThan(0.04));
  });
});
