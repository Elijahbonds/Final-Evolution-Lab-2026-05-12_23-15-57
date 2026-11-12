// The plate detector on generated frames: a dark bumper with a steel hub on a lit wall, a rack upright and the lifter's
// legs behind it, sensor noise; seeded off-centre (the wrist is not the plate's centre).
import { describe, expect, it } from 'vitest';
import { detectPlate, drawPlateFrame, fitCircle, lumaOf, PlateTracker } from './plate';
import { filmSet } from './bench';
import { LIFTS } from './lifts';
import { readSet } from './reps';
import { trackOf, type VbtFrame } from './track';

describe('detectPlate', () => {
  it.each([
    [{ cx: 160, cy: 120, r: 48 }, 1],
    [{ cx: 200, cy: 150, r: 30 }, 2],
    [{ cx: 100, cy: 90, r: 60 }, 3],
    [{ cx: 296, cy: 120, r: 45 }, 4],        // a quarter of it off the frame's edge
  ])('finds %o within a pixel, from a seed 15 px off', (c, seed) => {
    const f = drawPlateFrame(320, 240, c, { seed, noise: 8, clutter: true });
    const r = detectPlate(f, { x: c.cx + 12, y: c.cy - 9 }, c.r * 0.6, c.r * 1.6);
    expect(r).not.toBeNull();
    expect(Math.hypot(r!.cx - c.cx, r!.cy - c.cy)).toBeLessThan(1);
    expect(Math.abs(r!.r - c.r)).toBeLessThan(1);
  });

  it('finds nothing where there is no plate (the rack and the legs are not circles)', () => {
    const f = drawPlateFrame(320, 240, null, { seed: 9, noise: 8, clutter: true });
    expect(detectPlate(f, { x: 160, y: 120 }, 25, 70)).toBeNull();
    expect(detectPlate(f, { x: 240, y: 150 }, 25, 70)).toBeNull();
  });

  it('the algebraic fit is exact on a clean circle', () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({ x: 50 + 20 * Math.cos(i / 6), y: 40 + 20 * Math.sin(i / 6) }));
    const c = fitCircle(pts)!;
    expect(c.cx).toBeCloseTo(50, 6);
    expect(c.cy).toBeCloseTo(40, 6);
    expect(c.r).toBeCloseTo(20, 6);
  });

  it('luma from RGBA', () => {
    const l = lumaOf(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
    expect([...l.data]).toEqual([255, 0]);
  });
});

describe('PlateTracker through a set', () => {
  it('tracks a moving plate frame to frame, and the set reads its speed at the plate', () => {
    // the bench's plate path, drawn as frames (240 px tall): the tracker's output replaces the bench's plate
    const film = filmSet(LIFTS.back_squat, { reps: [{ romM: 0.5, concMs: 700 }, { romM: 0.5, concMs: 900 }] }, { fps: 30, seed: 6, plate: true, plateSd: 0, poseSd: 0.002 });
    const H = 240, W = Math.round(H * film.aspect);
    const tracker = new PlateTracker();
    let found = 0;
    const frames: VbtFrame[] = film.frames.map((fr, i) => {
      const p = fr.plate!;
      if (!p) return { ...fr, plate: null };
      const img = drawPlateFrame(W, H, { cx: p.cx * H, cy: p.cy * H, r: p.r * H }, { seed: i + 1, noise: 6 });
      const wrist = fr.image[15];
      const obs = tracker.push(fr.t, img, { x: wrist.x * film.aspect, y: wrist.y }, { min: p.r * 0.7, max: p.r * 1.4 });
      if (obs) { found++; expect(Math.hypot(obs.cx - p.cx, obs.cy - p.cy) * H).toBeLessThan(1.2); }
      return { ...fr, plate: obs };
    });
    expect(found / film.frames.length).toBeGreaterThan(0.85);
    const tr = trackOf(LIFTS.back_squat, frames, film.aspect, film.heightM);
    expect(tr.ok && tr.track.source).toBe('plate');
    if (!tr.ok) return;
    const r = readSet(LIFTS.back_squat, tr.track);
    expect(r.counted).toBe(2);
    r.reps.forEach((x, i) => expect(Math.abs(x.mcv - film.truth[i].mcv)).toBeLessThan(0.06));
  });
});
