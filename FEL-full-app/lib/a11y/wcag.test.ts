import { describe, expect, it } from 'vitest';
import {
  backwardFocusJumps, composite, contrastRatio, contrastSeverity, dedupe, isLargeText, luminance, parseColor, tally,
  targetSizeOk, type Violation,
} from './wcag';

const c = (s: string) => parseColor(s)!;

describe('colour parsing (what getComputedStyle returns)', () => {
  it('reads rgb, rgba, hex, color(srgb) and transparent', () => {
    expect(c('rgb(0, 229, 255)')).toEqual({ r: 0, g: 229, b: 255, a: 1 });
    expect(c('rgba(255, 255, 255, 0.45)')).toEqual({ r: 255, g: 255, b: 255, a: 0.45 });
    expect(c('rgb(255 255 255 / 50%)')).toEqual({ r: 255, g: 255, b: 255, a: 0.5 });
    expect(c('#050505')).toEqual({ r: 5, g: 5, b: 5, a: 1 });
    expect(c('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(c('#00E5FF80').a).toBeCloseTo(0.502, 2);
    expect(c('color(srgb 1 0 0 / 0.5)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(c('transparent').a).toBe(0);
    expect(parseColor('oklch(0.7 0.1 200)')).toBeNull();
  });
});

describe('contrast (WCAG 2.2 relative luminance and ratio)', () => {
  it('matches the known anchors', () => {
    expect(contrastRatio(c('#000'), c('#fff'))).toBe(21);
    expect(contrastRatio(c('#777'), c('#fff'))).toBeCloseTo(4.48, 2);
    expect(luminance(c('#fff'))).toBeCloseTo(1, 5);
  });

  it('composites translucent text over the page ink before measuring: text-white/45 on #050505 misses 4.5 by a hair', () => {
    const ink = c('#050505');
    const white45 = composite(c('rgba(255,255,255,0.45)'), ink);
    expect(contrastRatio(white45, ink)).toBeCloseTo(4.46, 1);
    expect(contrastRatio(composite(c('rgba(255,255,255,0.35)'), ink), ink)).toBeLessThan(3.2);
    // --fel-text-dim, the token the sweep moves secondary text onto, clears AA with room
    expect(contrastRatio(c('#8b97a5'), ink)).toBeGreaterThan(6.5);
  });

  it('large text: 24 px, or 18.66 px bold', () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(19, 700)).toBe(true);
    expect(isLargeText(19, 600)).toBe(false);
    expect(isLargeText(14, 900)).toBe(false);
  });

  it('severity: under 3:1 at body size is critical, between 3 and 4.5 serious, at or above the floor nothing', () => {
    expect(contrastSeverity(2.5, 12, 400)).toBe('critical');
    expect(contrastSeverity(3.5, 12, 400)).toBe('serious');
    expect(contrastSeverity(4.5, 12, 400)).toBeNull();
    expect(contrastSeverity(2.5, 30, 400)).toBe('serious');   // large text below its 3:1 floor
    expect(contrastSeverity(3.1, 30, 400)).toBeNull();
  });
});

describe('2.5.8 target size', () => {
  it('24 × 24 passes outright', () => {
    expect(targetSizeOk([{ left: 0, top: 0, width: 24, height: 24 }], 0)).toBe(true);
  });
  it('a small target alone passes on spacing; crowded by a neighbour it fails', () => {
    const alone = [{ left: 0, top: 0, width: 16, height: 16 }, { left: 100, top: 0, width: 40, height: 40 }];
    expect(targetSizeOk(alone, 0)).toBe(true);
    const crowded = [{ left: 0, top: 0, width: 16, height: 16 }, { left: 18, top: 0, width: 40, height: 40 }];
    expect(targetSizeOk(crowded, 0)).toBe(false);
  });
  it('two small targets whose 24 px circles overlap both fail', () => {
    const pair = [{ left: 0, top: 0, width: 16, height: 16 }, { left: 20, top: 0, width: 16, height: 16 }];
    expect(targetSizeOk(pair, 0)).toBe(false);
    expect(targetSizeOk(pair, 1)).toBe(false);
  });
});

describe('2.4.3 focus order', () => {
  it('flags a step back up the page, not a step into the next column', () => {
    const rows = [
      { left: 0, top: 0, width: 100, height: 40 },
      { left: 0, top: 100, width: 100, height: 40 },
      { left: 0, top: 10, width: 100, height: 20 },     // back up, same column: a jump
      { left: 200, top: 0, width: 100, height: 40 },    // next column, at the top: reading order
    ];
    expect(backwardFocusJumps(rows)).toEqual([2]);
  });
});

describe('the report', () => {
  it('dedupes one miss seen twice and keeps the worse severity', () => {
    const vs: Violation[] = [
      { rule: 'contrast', severity: 'serious', target: 'p "x"' },
      { rule: 'contrast', severity: 'critical', target: 'p "x"' },
      { rule: 'name', severity: 'critical', target: 'button ""' },
    ];
    const d = dedupe(vs);
    expect(d).toHaveLength(2);
    expect(tally(d)).toEqual({ total: 2, critical: 2, serious: 0, moderate: 0, byRule: { contrast: 1, name: 1 } });
  });
});
