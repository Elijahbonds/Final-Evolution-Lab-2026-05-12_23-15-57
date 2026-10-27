// Colour-blind-safe cues (A11-03): measured, the default palette loses a critical pair for deuteranopia and tritanopia;
// each setting's swaps hold every critical pair apart as that player sees it; and only colours and patterns change — the
// meter's bands keep the mode's exact geometry.
import { afterEach, describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  COLOR_VISIONS, CRITICAL_PAIRS, CUE_MIN_DELTA_E, CUE_SWAPS, cuePalette, deltaE, isColorVision, seenDeltaE, shapeCues,
  simulate, type ColorVision, type CueTone, type Rgb,
} from './colorVision';
import { HUD_RGB, hudColor, hudColorVision, hudCueShape, setHudColorVision } from '@/components/games/tv-hud/tokens';
import { HoopsShotMeter } from '@/components/games/hoops-shot-meter';

const BASE = HUD_RGB as unknown as Record<CueTone, Rgb>;
const worst = (pal: Record<CueTone, Rgb>, k: ColorVision) => Math.min(...CRITICAL_PAIRS.map(([a, b]) => seenDeltaE(pal[a], pal[b], k)));

afterEach(() => setHudColorVision('off'));

describe('the simulation', () => {
  it('off is the identity; a dichromat loses the red-green (or blue-yellow) axis', () => {
    expect(simulate([255, 51, 102], 'off')).toEqual([255, 51, 102]);
    // red and green, far apart for most players, close for a deuteranope
    expect(deltaE([255, 0, 0], [0, 160, 0])).toBeGreaterThan(80);
    expect(seenDeltaE([255, 0, 0], [0, 160, 0], 'deuteranopia')).toBeLessThan(deltaE([255, 0, 0], [0, 160, 0]) / 2);
    // greys stay grey
    for (const k of COLOR_VISIONS) {
      const [r, g, b] = simulate([128, 128, 128], k);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(2);
    }
  });
});

describe('the default palette, measured', () => {
  it('reads clearly with full colour vision', () => {
    expect(worst(BASE, 'off')).toBeGreaterThanOrEqual(CUE_MIN_DELTA_E);
  });
  it('loses a critical pair under deuteranopia (GOOD green vs danger) and tritanopia (heat vs danger)', () => {
    expect(seenDeltaE(BASE.good, BASE.danger, 'deuteranopia')).toBeLessThan(CUE_MIN_DELTA_E);
    expect(seenDeltaE(BASE.heat, BASE.danger, 'tritanopia')).toBeLessThan(CUE_MIN_DELTA_E);
  });
});

describe('each setting holds every critical pair apart, as that player sees it', () => {
  for (const k of COLOR_VISIONS.filter((v) => v !== 'off')) {
    it(k, () => {
      const pal = cuePalette(BASE, k);
      for (const [a, b] of CRITICAL_PAIRS) expect(seenDeltaE(pal[a], pal[b], k), `${a}/${b}`).toBeGreaterThanOrEqual(CUE_MIN_DELTA_E);
      // and the worst pair is never worse than the default's
      expect(worst(pal, k)).toBeGreaterThanOrEqual(worst(BASE, k));
      // the PERFECT band inside the GOOD band is at least as clear as it was
      expect(seenDeltaE(pal.good, pal.score, k)).toBeGreaterThanOrEqual(seenDeltaE(BASE.good, BASE.score, k));
    });
  }
  it('text and ink are never swapped; off is the signed-off palette exactly', () => {
    for (const k of COLOR_VISIONS.filter((v) => v !== 'off') as Exclude<ColorVision, 'off'>[]) {
      expect(CUE_SWAPS[k]).not.toHaveProperty('text');
      expect(CUE_SWAPS[k]).not.toHaveProperty('ink');
    }
    expect(cuePalette(BASE, 'off')).toBe(BASE);
    expect(shapeCues('off')).toBe(false);
    expect(isColorVision('deuteranopia')).toBe(true);
    expect(isColorVision('red')).toBe(false);
  });
});

describe('the HUD draws with it', () => {
  it('hudColor follows the setting, and off puts the palette back', () => {
    expect(hudColor('good')).toBe('rgb(0, 255, 157)');
    setHudColorVision('deuteranopia');
    expect(hudColorVision()).toBe('deuteranopia');
    expect(hudColor('good')).toBe('rgb(86, 180, 233)');
    expect(hudColor('text')).toBe('rgb(242, 245, 249)');
    setHudColorVision('off');
    expect(hudColor('good')).toBe('rgb(0, 255, 157)');
  });

  it('shape beside colour: the PERFECT band hatched, danger cross-hatched, GOOD edged — only with a setting on', () => {
    expect(hudCueShape('score', 'red')).toEqual({ background: 'red' });
    setHudColorVision('protanopia');
    expect(hudCueShape('score', 'red').background).toMatch(/^repeating-linear-gradient\(135deg.*, red$/);
    expect(hudCueShape('danger', 'red').background).toMatch(/45deg[\s\S]*135deg[\s\S]*, red$/);
    expect(hudCueShape('good', 'red').boxShadow).toMatch(/inset 2px[\s\S]*inset -2px/);
    expect(hudCueShape('you', 'red')).toEqual({ background: 'red' });
  });

  it('the shot meter\'s bands keep the mode\'s exact geometry under every setting (colours only, no window changes)', () => {
    const geometry = () => {
      const m = renderToStaticMarkup(h(HoopsShotMeter, { t: 0.4, green: '0.55,0.75', perfect: '0.04' }));
      return [...m.matchAll(/data-hud-band="(\w+)"[^>]*style="left:([\d.]+)%;width:([\d.]+)%/g)].map((x) => x.slice(1).join(' '));
    };
    const off = geometry();
    expect(off.length).toBeGreaterThanOrEqual(2);
    for (const k of COLOR_VISIONS) {
      setHudColorVision(k);
      expect(geometry(), k).toEqual(off);
    }
  });
});
