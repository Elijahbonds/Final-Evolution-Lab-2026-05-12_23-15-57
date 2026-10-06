// IMPROVE (2026-10-06), aeroaces #13: the windowed locate answers what the full scan answers, for less.
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { aeroCircuits, locate, pointAlong } from './aeroCircuits';
import { locateNear, newLineFix, LINE_WINDOW, lineWindowStats } from './lineWindow';
import { sampleLine, locate as locateLine } from './racingLine';

describe('locateNear — the windowed fix', () => {
  it('flying every circuit\'s corridor (weaving edge to edge, 3 m a frame) it matches the full scan everywhere', () => {
    for (const c of aeroCircuits()) {
      const fix = newLineFix();
      let worst = 0;
      for (let d = 0; d < c.line.length * 1.05; d += 3) {
        const { pos, tangent } = pointAlong(c.line, d);
        const right = new Vector3(tangent.z, 0, -tangent.x);
        const p = pos.add(right.scale(Math.sin(d * 0.013) * c.corridor * 0.98));
        const full = locate(c.line, p.x, p.z);
        locateNear(c.line, p.x, p.z, fix);
        expect(fix.i, `${c.course.id} @${d}`).toBe(full.i);
        worst = Math.max(worst, Math.abs(fix.dist - full.dist), Math.abs(fix.lateral - full.lateral));
      }
      expect(worst, c.course.id).toBeLessThan(1e-6);
    }
  });

  it('on the racing line itself (where the field flies) the window answers nearly every fix — the scan is the exception', () => {
    lineWindowStats.windowed = 0; lineWindowStats.full = 0;
    for (const c of aeroCircuits()) {
      const fix = newLineFix();
      for (let d = 0; d < c.line.length * 3; d += 0.6) {   // three laps at ~36 m/s, 60 fps
        const { pos, tangent } = pointAlong(c.line, d);
        const p = pos.add(new Vector3(tangent.z, 0, -tangent.x).scale(Math.sin(d * 0.01) * 8));
        locateNear(c.line, p.x, p.z, fix);
      }
    }
    const rate = lineWindowStats.windowed / (lineWindowStats.windowed + lineWindowStats.full);
    expect(rate).toBeGreaterThan(0.9);
  });

  it('a jump past the window (a respawn) falls back to the full scan and still answers right', () => {
    const c = aeroCircuits()[1];
    const fix = newLineFix();
    const a = pointAlong(c.line, 10).pos, b = pointAlong(c.line, c.line.length / 2).pos;
    locateNear(c.line, a.x, a.z, fix);
    const firstI = fix.i;
    locateNear(c.line, b.x, b.z, fix);
    expect(Math.abs(fix.i - firstI)).toBeGreaterThan(LINE_WINDOW);
    expect(fix.dist).toBeCloseTo(locate(c.line, b.x, b.z).dist, 6);
  });

  it('writes into the caller\'s object — the same tangent and point every call, nothing allocated per frame', () => {
    const c = aeroCircuits()[0];
    const fix = newLineFix();
    const { tangent, point } = fix;
    for (let d = 0; d < 200; d += 4) { const p = pointAlong(c.line, d).pos; locateNear(c.line, p.x, p.z, fix); }
    expect(fix.tangent).toBe(tangent);
    expect(fix.point).toBe(point);
  });

  it('works on a looped RacingLine too (the rival driver\'s line), matching racingLine.locate', () => {
    const line = sampleLine([[0, 0, 8], [220, 0, 20], [220, 220, 35], [0, 220, 12], [-80, 110, 10]], { loop: true });
    const fix = newLineFix();
    for (let d = 0; d < line.length; d += 2.5) {
      const p = pointAlong({ pts: line.pts, cum: line.cum, length: line.length }, d).pos;
      const full = locateLine(line, p.x + 3, p.z - 2);
      locateNear(line, p.x + 3, p.z - 2, fix);
      expect(fix.dist).toBeCloseTo(full.dist, 6);
      expect(fix.lateral).toBeCloseTo(full.lateral, 6);
    }
  });
});
