// QA P1-13 (2026-09-27): "the baseball distance signs overlap". The outfield carried ONE 12 m band across dead centre that
// read "124 FT · 124 FT · 124 FT" (571 px of text on a 512 px texture) over the bottom of the centre bullseye. Separate
// signs now, spaced along the wall and clear of the Parkour Derby targets.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DISTANCE_SIGNS, distanceSignPlacements } from './aimSwingCore';
import { PARK, TARGETS } from '../core/ParkourDerby';

const R = PARK.wallR;
const arc = (degA: number, degB: number) => (Math.abs(degA - degB) * Math.PI / 180) * R;

describe('the outfield distance signs', () => {
  const signs = distanceSignPlacements(R);

  it('sit on the wall and are at least a sign width apart along it', () => {
    for (const s of signs) expect(Math.hypot(s.x, s.z)).toBeCloseTo(R - 0.3, 5);
    const bearings = signs.map((s) => s.bearingDeg).sort((a, b) => a - b);
    for (let i = 1; i < bearings.length; i++) expect(arc(bearings[i], bearings[i - 1])).toBeGreaterThanOrEqual(DISTANCE_SIGNS.width);
  });

  it('never cover a wall target', () => {
    const top = DISTANCE_SIGNS.y + DISTANCE_SIGNS.height / 2;
    for (const s of signs) for (const t of TARGETS) {
      const clearSideways = arc(s.bearingDeg, t.bearingDeg) >= DISTANCE_SIGNS.width / 2 + t.r;
      const clearBelow = top <= t.y - t.r;
      expect(clearSideways || clearBelow, `${s.bearingDeg}° vs ${t.id}`).toBe(true);
    }
  });

  it('each sign carries one number, and the three-in-a-row band is gone', () => {
    const src = readFileSync(path.resolve(__dirname, 'aimSwingCore.ts'), 'utf8');
    expect(src).not.toContain('124 FT  ·  124 FT');
    expect(src).toContain("dt.drawText('124 FT', null, 46");
  });
});
