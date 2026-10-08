// IMPROVE (2026-10-06), velocitykart #13: the kart rival's two locates a frame go through the window (lineWindow) and the
// mode reads its road height off the same fix — and the drive is the full scan's, step for step.
import { describe, expect, it } from 'vitest';
import { spawnKartDrive, stepKartDrive } from './RivalDriver';
import { makeField, raceLineFromPoints, rivalPace } from './RaceField';
import { kartCircuits } from './kartCircuits';
import { lineWindowStats } from './lineWindow';
import { KART_STARTER } from '../core/KartModel';

describe('the kart field drives off a windowed fix', () => {
  it('matches the full-scan driver on every circuit, and answers almost every fix from the window', () => {
    for (const c of kartCircuits()) {
      const line = c.line;
      const raceLine = raceLineFromPoints(line.pts, true);
      const [ra] = makeField(1, KART_STARTER.vMax, 0.7);
      const rb = { ...ra };
      const a = spawnKartDrive(line, ra), b = spawnKartDrive(line, rb);
      expect(a.fix).toBeDefined();
      delete b.fix;                                     // b: the old full scan
      const w0 = lineWindowStats.windowed, f0 = lineWindowStats.full;
      for (let i = 0; i < 40 * 60; i++) {
        const t = i / 60;
        stepKartDrive(a, ra, line, rivalPace(ra, raceLine, 0, { topSpeed: KART_STARTER.vMax }, t), 1 / 60, KART_STARTER, c.halfWidth);
        stepKartDrive(b, rb, line, rivalPace(rb, raceLine, 0, { topSpeed: KART_STARTER.vMax }, t), 1 / 60, KART_STARTER, c.halfWidth);
      }
      expect(ra.dist, c.course.id).toBeCloseTo(rb.dist, 6);
      expect(a.state.pos.x).toBeCloseTo(b.state.pos.x, 6);
      expect(ra.dist).toBeGreaterThan(line.length * 0.5);    // it really drove
      const windowed = lineWindowStats.windowed - w0, full = lineWindowStats.full - f0;
      expect(windowed / (windowed + full), c.course.id).toBeGreaterThan(0.9);
    }
  });
});
