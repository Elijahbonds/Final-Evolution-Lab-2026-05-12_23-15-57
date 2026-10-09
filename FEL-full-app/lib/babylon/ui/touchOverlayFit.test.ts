// QA P1-10 (2026-09-27): "controls are clipped in Threes and Venice Lines". The deck is positioned inside the mode's 16:10
// stage, which clips (overflow hidden) and is laid out by GameShell: on a 390 × 844 phone the stage is 374 × 234 below the
// 56 px header and the 12 px pad; sideways (844 × 390, full bleed) it is 844 × 527 from the top; on a 1280 × 720 desktop it
// is 1168 × 730 under the header. The right column is 306 px tall with a boost pill (Venice Lines: the pill, the diamond,
// the stick and two 8 px gaps) and 252 without (Threes). fitDeck lifts and scales each column into what is visible.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fitDeck } from './TouchOverlay';

const MARGIN = 12;
const VIEWS = [
  { name: '390×844 (portrait)', vh: 844, stage: { top: 68, bottom: 68 + 234 } },
  { name: '844×390 (sideways, full bleed)', vh: 390, stage: { top: 0, bottom: 527.5 } },
  { name: '1280×720 (desktop)', vh: 720, stage: { top: 68, bottom: 68 + 730 } },
  { name: '1280×720, scrolled 200 px', vh: 720, stage: { top: -132, bottom: 598 } },
];
const COLUMNS = { 'Venice Lines right (boost)': 306, 'Threes right': 252, left: 176 };

describe('fitDeck: every control lies inside the visible stage and the viewport', () => {
  for (const v of VIEWS) for (const [col, h] of Object.entries(COLUMNS)) {
    it(`${v.name} · ${col}`, () => {
      const { lift, scale } = fitDeck(v.stage, v.vh, h, MARGIN);
      const bottom = v.stage.bottom - lift - MARGIN;          // the column's bottom edge, in viewport px
      const top = bottom - h * scale;                           // scaled from its bottom corner
      expect(bottom).toBeLessThanOrEqual(Math.min(v.stage.bottom, v.vh));
      expect(top).toBeGreaterThanOrEqual(Math.max(v.stage.top, 0));
      expect(top).toBeGreaterThanOrEqual(0);
      expect(bottom).toBeLessThanOrEqual(v.vh);
      expect(scale).toBeGreaterThan(0.6);                       // still thumb-sized: a 64 px button stays ≥ 38 px
    });
  }

  it('a stage with room keeps the deck at full size and where it was', () => {
    expect(fitDeck({ top: 0, bottom: 700 }, 900, 306)).toEqual({ lift: 0, scale: 1 });
  });

  it('both columns are placed through the fit (the safe-area insets still apply under it)', () => {
    const src = readFileSync(path.resolve(__dirname, 'TouchOverlay.tsx'), 'utf8');
    // the release's console-view layouts (2026-10-06): the compact (sideways phone) columns go through the same fit, on top
    // of their own COMPACT_SCALE
    expect(src).toContain("style={lifted(compact ? COMPACT_LEFT : SAFE_LEFT, cs * fit.l, 'bottom left')}");
    expect(src).toContain("style={lifted(SAFE_RIGHT, fit.r, 'bottom right')}");
    expect(src).toContain("style={lifted(COMPACT_RIGHT, cs * fit.r, 'bottom right')}");
    expect(src).toContain('bottom: `calc(max(0.75rem, env(safe-area-inset-bottom)) + ${fit.lift}px)`');
  });
});
