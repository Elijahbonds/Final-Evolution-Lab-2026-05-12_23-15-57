import { describe, expect, it } from 'vitest';
import { CLOCK_T0, CROWD_CLIPS, CROWD_FPS, contentIndex, holdSettings, layoutClips, loopOffset, startOffset, vatFrame } from './crowdVat';

describe('the VAT clock — Babylon\'s shader, replicated', () => {
  it('reproduces the include\'s arithmetic on a hand-worked case', () => {
    // total 11 (rows 10..20), speed 30: at t = 2 s, time = 60/11 = 5.4545… → corr 1, n 10, fract·n = 4.545… → row 4 + 10 + 1
    expect(vatFrame(2, 10, 20, 0, 30)).toBe(15);
    // before the first wrap (time < 1) the pad row is still drawn: t = 0 is row `start`
    expect(vatFrame(0, 10, 20, 0, 30)).toBe(10);
    // the offset shifts the row, and wraps with GLSL's mod (never negative)
    expect(vatFrame(2, 10, 20, 3, 30)).toBe(18);
    expect(vatFrame(2, 10, 20, -7, 30)).toBe(18);
  });

  it('every clip lies behind its own pad row, back to back, and plays at its authored rate', () => {
    const { ranges, rows } = layoutClips();
    let row = 0;
    for (const c of CROWD_CLIPS) {
      const r = ranges[c.name];
      expect(r.start, c.name).toBe(row);
      expect(r.frames, c.name).toBe(Math.round(c.seconds * CROWD_FPS));
      expect(r.end - r.start, c.name).toBe(r.frames);
      // content rows advance at CROWD_FPS: speed · K / (K + 1) = FPS
      expect((r.speed * r.frames) / (r.frames + 1), c.name).toBeCloseTo(CROWD_FPS, 9);
      row = r.end + 1;
    }
    expect(rows).toBe(row);
  });

  it('startOffset puts a clip on its first content row at the moment it starts, then walks it frame by frame', () => {
    const { ranges } = layoutClips();
    for (const t0 of [CLOCK_T0, CLOCK_T0 + 0.37, CLOCK_T0 + 812.123]) {
      for (const c of CROWD_CLIPS) {
        const r = ranges[c.name];
        const off = startOffset(t0, r);
        expect(contentIndex(t0, r, off), `${c.name} @ ${t0}`).toBe(0);
        // a frame later than K/2 frames in, it is at K/2 (± the row boundary)
        const half = Math.floor(r.frames / 2);
        expect(Math.abs(contentIndex(t0 + (half + 0.5) / CROWD_FPS, r, off) - half), c.name).toBeLessThanOrEqual(1);
        // and it has not wrapped back to the start before its length is up
        expect(contentIndex(t0 + (r.frames - 1.2) / CROWD_FPS, r, off), c.name).toBeGreaterThan(r.frames - 4);
      }
    }
  });

  it('never draws the pad row once the clock has started (content rows only)', () => {
    const { ranges } = layoutClips();
    const r = ranges.sit_cheer;
    for (let i = 0; i < 400; i++) {
      const f = vatFrame(CLOCK_T0 + i / 61, r.start, r.end, startOffset(CLOCK_T0, r), r.speed);
      expect(f).toBeGreaterThan(r.start);
      expect(f).toBeLessThanOrEqual(r.end);
    }
  });

  it('loop offsets spread fans across a loop; a held setting draws one row whatever the clock', () => {
    const { ranges } = layoutClips();
    expect(loopOffset(ranges.sit_idle, 0.5)).toBeCloseTo(ranges.sit_idle.frames / 2, 9);
    expect(loopOffset(ranges.sit_idle, 1.25)).toBeCloseTo(ranges.sit_idle.frames / 4, 9);
    const [s, e, o, sp] = holdSettings(42);
    for (const t of [0, 1, CLOCK_T0, CLOCK_T0 + 99.9]) expect(vatFrame(t, s, e, o, sp)).toBe(42);
  });
});
