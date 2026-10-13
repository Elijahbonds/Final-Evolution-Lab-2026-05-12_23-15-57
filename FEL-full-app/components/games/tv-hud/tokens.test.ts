// The TV HUD's rules, held without a browser (A9.13, lane/tv-hud): the 10-foot floor at 1080p, phones unchanged, one
// palette that matches the app's theme, the safe frame console view already draws, motion that calms, and the end-card
// hand-off pointed at the card the shell really renders.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  END_CARD_ATTR, HUD_RGB, HUD_SAFE, HUD_SIZES, HUD_THEME_VAR, HUD_TONES, HUD_TYPE, TV_MIN_READ_PX, TV_ZOOM,
  clamp01, hudColor, hudDesignPx, hudEnter, hudFontSize, hudPop, hudRenderedPx, hudType, meterPct,
} from './tokens';
import { HUD_ZOOM_MAX, TV_SAFE, consoleLayout } from '@/lib/ui/consoleView';

const read = (f: string) => readFileSync(path.resolve(__dirname, '../../..', f), 'utf8');

/** Evaluate hudFontSize's calc() for a zoom, the way the browser does against --fel-hud-zoom. */
function evalCalc(css: string, zoom: number): number {
  const m = /^calc\(([\d.]+)px \+ \(var\(--fel-hud-zoom, 1\) - 1\) \* ([\d.]+)px\)$/.exec(css);
  if (!m) throw new Error(`unexpected font-size: ${css}`);
  return Number(m[1]) + (zoom - 1) * Number(m[2]);
}

describe('the 10-foot type scale', () => {
  it('every step draws at least 24 px on a 1080p TV (the console zoom there)', () => {
    expect(TV_ZOOM).toBe(HUD_ZOOM_MAX);
    expect(consoleLayout(1920, 1080).hudZoom).toBe(TV_ZOOM);
    for (const s of HUD_SIZES) expect(hudRenderedPx(s, TV_ZOOM), s).toBeGreaterThanOrEqual(TV_MIN_READ_PX);
    expect(TV_MIN_READ_PX).toBe(24);
  });

  it('the floor is the caption, and it is needed: a plain 10 px caption under the same zoom drew 22.5 px', () => {
    expect(10 * TV_ZOOM).toBeLessThan(TV_MIN_READ_PX);
    const smallest = Math.min(...HUD_SIZES.map((s) => hudRenderedPx(s, TV_ZOOM)));
    expect(smallest).toBe(hudRenderedPx('caption', TV_ZOOM));
  });

  it('a phone (zoom 1) gets exactly the phone size, so a phone layout covers no more of the play area', () => {
    for (const s of HUD_SIZES) expect(hudDesignPx(s, 1)).toBe(HUD_TYPE[s].phone);
    expect(consoleLayout(844, 390).hudZoom).toBe(1);
    expect(consoleLayout(390, 844).hudZoom).toBe(1);
    // the phone sizes are the roles' sizes in the hosts before the migration (text-[10px], [11px], text-xs, text-sm, text-lg, text-2xl, text-3xl)
    expect(HUD_SIZES.map((s) => HUD_TYPE[s].phone)).toEqual([10, 11, 12, 14, 18, 24, 24, 30]);
  });

  it('grows monotonically with the zoom, and junk zooms read as 1', () => {
    for (const s of HUD_SIZES) {
      let prev = 0;
      for (const z of [1, 1.25, 1.5, 1.8, 2, 2.25]) { const px = hudRenderedPx(s, z); expect(px).toBeGreaterThan(prev); prev = px; }
      expect(hudDesignPx(s, Number.NaN)).toBe(HUD_TYPE[s].phone);
      expect(hudDesignPx(s, 0.5)).toBe(HUD_TYPE[s].phone);
    }
  });

  it('the CSS the browser evaluates is the same rule as the tested maths', () => {
    for (const s of HUD_SIZES) for (const z of [1, 1.5, 2.25]) expect(evalCalc(hudFontSize(s), z)).toBeCloseTo(hudDesignPx(s, z), 6);
    expect(hudType('score').fontSize).toBe(hudFontSize('score'));
  });

  it('the steps are ordered smallest first, and the big reads are bigger than the small ones at every zoom', () => {
    for (const z of [1, 2.25]) {
      const px = HUD_SIZES.map((s) => hudRenderedPx(s, z));
      for (let i = 1; i < px.length; i++) expect(px[i]).toBeGreaterThanOrEqual(px[i - 1]);
    }
  });
});

describe('one palette', () => {
  it('the tones that mirror a theme token carry exactly its value (app/theme.css)', () => {
    const theme = read('app/theme.css');
    for (const t of HUD_TONES) {
      const v = HUD_THEME_VAR[t];
      if (!v) continue;
      const m = new RegExp(`${v}:\\s*#([0-9a-fA-F]{6})`).exec(theme);
      expect(m, v).not.toBeNull();
      const hex = m![1];
      expect(HUD_RGB[t], t).toEqual([0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)));
    }
  });

  it('two HUD-only tones, named, and nothing else', () => {
    expect(HUD_TONES.filter((t) => !HUD_THEME_VAR[t]).sort()).toEqual(['info', 'them']);
  });

  it('hudColor: solid as rgb(), with alpha as rgba() (an older TV browser has no color-mix), alpha clamped', () => {
    expect(hudColor('you')).toBe('rgb(0, 229, 255)');
    expect(hudColor('danger', 0.25)).toBe('rgba(255, 51, 102, 0.25)');
    expect(hudColor('score', 7)).toBe('rgb(255, 215, 0)');
    expect(hudColor('text', -1)).toBe('rgba(242, 245, 249, 0)');
  });
});

describe('safe frame, meters, motion, end card', () => {
  it('the safe margin is console view\'s TV frame — 5 % — and a 1080p TV gets it', () => {
    expect(HUD_SAFE).toBe(TV_SAFE);
    expect(HUD_SAFE).toEqual({ x: 0.05, y: 0.05 });
    expect(consoleLayout(1920, 1080)).toMatchObject({ console: true, safeX: 96, safeY: 54 });
  });

  it('meter maths clamps, and junk is empty', () => {
    expect(meterPct(50, 100)).toBe('50%');
    expect(meterPct(150, 100)).toBe('100%');
    expect(meterPct(-3, 100)).toBe('0%');
    expect(meterPct(Number.NaN, 100)).toBe('0%');
    expect(meterPct('x', 100)).toBe('0%');
    expect(meterPct(0.333, 1)).toBe('33.3%');
    expect(meterPct(5, 0)).toBe('100%');
    expect(clamp01(2)).toBe(1);
    expect(clamp01(undefined)).toBe(0);
  });

  it('reduced motion: no movement on enter (a fade only), no number swell', () => {
    const calm = hudEnter(true);
    for (const k of ['scale', 'y', 'x', 'rotate']) {
      expect(calm.initial).not.toHaveProperty(k);
      expect(calm.animate).not.toHaveProperty(k);
    }
    expect(hudPop(true).initial).toBe(false);
    const full = hudEnter(false);
    expect(full.initial).toHaveProperty('scale');
    expect(hudPop(false).initial).toEqual({ scale: 1.22 });
  });

  it('the hand-off watches the attribute the shell\'s end card really carries', () => {
    expect(END_CARD_ATTR).toBe('data-end-screen');
    expect(read('components/games/end-screen/end-screen.tsx')).toMatch(/<motion\.div\s+data-end-screen\b/);
    // and the card is the stage's child: GameShell renders it beside the host, inside the stage
    expect(read('components/games/game-shell.tsx')).toMatch(/<AnimatePresence>\s*\{result && \(\s*<EndScreen/);
  });
});
