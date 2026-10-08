import { describe, expect, it } from 'vitest';
import {
  CONSOLE_MIN_ASPECT, HUD_DESIGN_HEIGHT, HUD_ZOOM_MAX, PHONE_SAFE, TV_SAFE,
  consoleLayout, consoleStageVars, touchDeckLayout,
} from './consoleView';

// The screens the console-view probe measured (scripts/probes/_console-view-probe.mts).
const PORTRAIT = [390, 844] as const;
const PHONE_844 = [844, 390] as const;
const PHONE_932 = [932, 430] as const;
const TV_1080 = [1920, 1080] as const;
const TV_720 = [1280, 720] as const;

describe('consoleLayout — which screens are console view', () => {
  it('portrait keeps the page layout, untouched (the control the owner believes looks right)', () => {
    expect(consoleLayout(...PORTRAIT)).toEqual({ console: false, hudZoom: 1, safeX: 0, safeY: 0 });
  });

  it('every sideways screen is console view: landscape phones AND TVs (TVs were left on the page layout)', () => {
    for (const s of [PHONE_844, PHONE_932, TV_1080, TV_720]) expect(consoleLayout(...s).console).toBe(true);
  });

  it('a near-square screen is not "sideways"', () => {
    expect(consoleLayout(1024, 900).console).toBe(false);
    expect(consoleLayout(Math.ceil(900 * CONSOLE_MIN_ASPECT), 900).console).toBe(true);
  });

  it('garbage in is the page layout, never NaN styles', () => {
    for (const [w, h] of [[0, 0], [NaN, 400], [800, -1], [Infinity, 400]]) {
      const l = consoleLayout(w, h);
      expect(l.console).toBe(false);
      expect(Number.isFinite(l.hudZoom)).toBe(true);
    }
  });
});

describe('consoleLayout — the HUD scales with HEIGHT', () => {
  it('is 1:1 on a landscape phone, where its pixel sizes were drawn', () => {
    expect(consoleLayout(...PHONE_844).hudZoom).toBe(1);
    expect(consoleLayout(...PHONE_932).hudZoom).toBe(1);
  });

  it('grows on a TV so a 10 px caption is couch-legible at 1080p (>= 20 px)', () => {
    const z1080 = consoleLayout(...TV_1080).hudZoom;
    const z720 = consoleLayout(...TV_720).hudZoom;
    expect(z1080).toBe(2.25);
    expect(z720).toBe(1.5);
    expect(10 * z1080).toBeGreaterThanOrEqual(20);
    // the same proportion of the screen height at 720 and 1080: a TV's HUD does not shrink with resolution
    expect(Math.abs((10 * z720) / 720 - (10 * z1080) / 1080)).toBeLessThan(0.001);
  });

  it('depends on height, not width (an ultra-wide window does not inflate the HUD)', () => {
    expect(consoleLayout(3440, 1080).hudZoom).toBe(consoleLayout(1920, 1080).hudZoom);
  });

  it('is clamped: a 4K window is not all HUD, and nothing ever shrinks below 1', () => {
    expect(consoleLayout(3840, 2160).hudZoom).toBe(HUD_ZOOM_MAX);
    expect(consoleLayout(700, 300).hudZoom).toBe(1);
    expect(consoleLayout(Math.round(HUD_DESIGN_HEIGHT * 1.6), HUD_DESIGN_HEIGHT).hudZoom).toBe(1);
  });
});

describe('consoleLayout — title-safe frame', () => {
  it('is 5 % each side on a TV (overscan)', () => {
    expect(consoleLayout(...TV_1080)).toMatchObject({ safeX: 1920 * TV_SAFE.x, safeY: 1080 * TV_SAFE.y });
    expect(consoleLayout(...TV_1080).safeX).toBe(96);
    expect(consoleLayout(...TV_1080).safeY).toBe(54);
  });

  it('is tighter on a phone, whose height is the scarcest thing it has', () => {
    const l = consoleLayout(...PHONE_844);
    expect(l.safeY).toBe(Math.round(390 * PHONE_SAFE.y));
    expect(l.safeY).toBeLessThan(Math.round(390 * TV_SAFE.y));
    expect(l.safeX).toBe(Math.round(844 * PHONE_SAFE.x));
  });

  it('writes the CSS custom properties game-surface.css reads', () => {
    expect(consoleStageVars(consoleLayout(...TV_1080))).toEqual({ '--fel-hud-zoom': '2.25', '--fel-safe-x': '96px', '--fel-safe-y': '54px' });
  });
});

describe('touchDeckLayout', () => {
  it('portrait keeps the bottom deck; a tall landscape keeps the side stacks', () => {
    expect(touchDeckLayout(...PORTRAIT)).toBe('portrait');
    expect(touchDeckLayout(1024, 768)).toBe('landscape');
    expect(touchDeckLayout(...TV_1080)).toBe('landscape');
  });
  it('a phone held sideways gets the compact deck', () => {
    expect(touchDeckLayout(...PHONE_844)).toBe('compact');
    expect(touchDeckLayout(...PHONE_932)).toBe('compact');
  });
  it('square is not landscape (matches TouchOverlay\'s old innerWidth > innerHeight test)', () => {
    expect(touchDeckLayout(600, 600)).toBe('portrait');
  });
  it('a screen with no touch draws no touch deck, in any orientation', () => {
    expect(touchDeckLayout(...TV_1080, false)).toBe('none');
    expect(touchDeckLayout(...PORTRAIT, false)).toBe('none');
    expect(touchDeckLayout(...TV_1080, true)).toBe('landscape');
  });
});
