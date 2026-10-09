// QA P1-11 (2026-09-27): the Brain Brawl gallery fascia read "RAIN BRAWL". The title sat at a fixed 56 px, centred in each
// half of a 1024 px texture; a face wider than Arial Black (the fallback on a machine without it) ran the "B" off the
// texture's left edge. fitTitleFont measures and fits it to ≤ 90 % of the half.
import { describe, expect, it } from 'vitest';
import { fitTitleFont } from './BrainBrawlStage';

/** A canvas context whose face is `emPerChar` ems wide per character (Arial Black ≈ 0.72; a wide fallback sans ≈ 0.95). */
function ctx(emPerChar: number) {
  const g = {
    font: '',
    measureText(text: string) { const px = Number(/(\d+)px/.exec(g.font)?.[1] ?? 0); return { width: text.length * emPerChar * px } as TextMetrics; },
  };
  return g;
}
const HALF = 1024 / 2;

describe('the gallery title fits its half of the fascia', () => {
  it('Arial Black at 56 px already fits: the size is kept', () => {
    const g = ctx(0.72);
    expect(fitTitleFont(g, 'BRAIN BRAWL', HALF)).toMatch(/^900 56px /);
    expect(g.measureText('BRAIN BRAWL').width).toBeLessThanOrEqual(HALF * 0.9);
  });

  it('a wider fallback face is shrunk until the whole title fits, B included', () => {
    const g = ctx(0.95);
    expect(11 * 0.95 * 56).toBeGreaterThan(HALF * 0.9);           // at 56 px it would not fit: the QA's "RAIN BRAWL"
    fitTitleFont(g, 'BRAIN BRAWL', HALF);
    const w = g.measureText('BRAIN BRAWL').width;
    expect(w).toBeLessThanOrEqual(HALF * 0.9);
    // centred at a quarter of the texture, the left edge stays on the texture
    expect(HALF / 2 - w / 2).toBeGreaterThanOrEqual(0);
  });

  it('keeps the same face stack', () => {
    const g = ctx(1.2);
    expect(fitTitleFont(g, 'BRAIN BRAWL', HALF)).toMatch(/px "Arial Black", Impact, system-ui, sans-serif$/);
  });
});
