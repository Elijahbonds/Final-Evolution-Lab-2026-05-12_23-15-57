// MIRROR flight-time step (Research notes): h = g·t²/8 from the flight time, shown rounded with a ± range from the
// frame rate, never as an exact number; copy that calls it an estimate from video,
// with no outside-device comparison.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JumpResult } from '@/app/play/mirror/assess/_components/jump-result';
import { KidResults } from '@/app/play/mirror/assess/_components/kid-results';
import { G, heightCmOf } from '@/lib/assess/graders/t5-cmj';
import { gradeSession } from '@/lib/assess/runner';
import { PROTOCOL as TESTS } from '@/lib/assess/protocol';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import * as COPY from './copy';
import { aboutInches, formatJumpEstimate } from './jump';
import { CLAIM_WORDS } from '@/tests/helpers/claimFree';

const r = gradeSession({
  calibration: syntheticCalibration(), T1: { front: ohsFront().frames, side: ohsSide().frames },
  T2: { left: kneeWall('left').frames, right: kneeWall('right').frames },
  T3: { left: singleLegSquat('left').frames, right: singleLegSquat('right').frames },
  T5: cmj([0, 1, 2].map(() => ({ heightM: 0.42 }))).frames,
});
const t5 = r.tests.find((t) => t.id === 'T5')!.t5!;
const props = (kid: boolean) => ({ heightCm: t5.bestHeightCm, plusMinusCm: t5.heightPlusMinusCm, attempts: 3, kid, jumpIn: null, lastIn: null, onFull: () => {}, onAgain: () => {} });
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('flight-time jump height', () => {
  it('h = g·t²/8 from the flight time', () => {
    expect(heightCmOf(500)).toBeCloseTo(((G * 0.5 ** 2) / 8) * 100, 6);
    expect(t5.bestHeightCm).not.toBeNull();
    expect(heightCmOf(t5.bestFlightMs!)).toBeCloseTo(t5.bestHeightCm!, 0);
  });

  it('the ± range is one frame of timing: about 14% of a 0.5 s jump at 30 fps, half that at 60', () => {
    const h = heightCmOf(500), band = (fps: number) => (G * 0.5 * (1 / fps)) / 4 * 100;
    expect(band(30) / h).toBeGreaterThan(0.12);
    expect(band(30) / h).toBeLessThan(0.15);
    expect(band(60)).toBeCloseTo(band(30) / 2, 6);
    expect(t5.heightPlusMinusCm).toBeCloseTo(Math.round(((G * (t5.bestFlightMs! / 1000) * (1 / t5.poseFps)) / 4) * 1000) / 10, 6);
  });

  it('shown rounded with its range, never as an exact number', () => {
    expect(formatJumpEstimate(42.5, 2.2, 'in')).toBe('about 17 ±1 in');
    expect(formatJumpEstimate(42.5, 2.2, 'cm')).toBe('about 43 ±2 cm');
    expect(formatJumpEstimate(42.5, 0.1, 'cm')).toBe('about 43 ±1 cm');
    expect(formatJumpEstimate(42.5, null, 'in')).toBe('about 17 in');
    expect(aboutInches(16.7)).toBe('about 17 in');
    for (const kid of [false, true]) {
      const h = text(renderToStaticMarkup(createElement(JumpResult, props(kid))));
      expect(h).toMatch(/about \d+ ±\d+ in/);
      expect(h).not.toMatch(/\d+\.\d+ (in|cm)/);
      expect(h).toContain(COPY.JUMP_ESTIMATE_LINE);
    }
    expect(text(renderToStaticMarkup(createElement(KidResults, { jumpIn: 16.7, lastIn: null, onRunAgain: () => {} })))).toContain('about 17 in');
  });

  it('copy: an estimate from video that says what it measures, with no outside-device comparison', () => {
    expect(COPY.JUMP_ESTIMATE_LINE).toMatch(/estimate from video/);
    expect(COPY.JUMP_ESTIMATE_LINE).toMatch(/time in the air/);
    const all = Object.values(COPY).filter((v): v is string => typeof v === 'string').join(' ') + TESTS.map((t) => t.setup).join(' ');
    expect(all).not.toMatch(/vertec|force[- ]plate|lab[- ]grade|as accurate as/i);
    // JUMP-TESTS (2026-10-25): and nothing the jump tools may not say either (accurate, validated, precise, "within ±")
    expect(all).not.toMatch(CLAIM_WORDS);
  });

  it('PM: "Land tall, legs straight" shows on screen during the jump only; the spoken setup line is unchanged', () => {
    expect(COPY.JUMP_LAND_TALL).toBe('Land tall, legs straight');
    const hud = readFileSync(join(__dirname, '../../app/play/mirror/assess/_components/live-hud.tsx'), 'utf8');
    expect(hud).toMatch(/v\.test === 'T5' && !noReading \? \(\s*<p data-jump-land-tall[^>]*>\{JUMP_LAND_TALL\}<\/p>/);
    expect(TESTS.find((t) => t.id === 'T5')!.setup).toBe('Hands on your hips the whole time. Dip and jump as high as you can, land, and stand still. Three jumps.');
  });
});
