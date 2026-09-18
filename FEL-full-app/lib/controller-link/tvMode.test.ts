// TV Mode — Phase C's timing compensation (2026-09-13).
//
// The thing these guard is not arithmetic, it is FRAMING. Widening a timing window is indistinguishable in
// code from making a game easier, and the only difference is why it happens and what it is called. A test
// suite can hold that: the factor is bounded, direct play is never widened, and the copy never says "easy".

import { describe, it, expect } from 'vitest';
import {
  DIRECT_FACTOR, MIRROR_FACTOR, FACTOR_MIN, FACTOR_MAX,
  factorFor, widen, guessDisplay, readDisplaySetting, displayBanner,
  type DisplayMode, type DisplaySetting,
} from './tvMode';
import { presenceSummary } from './presence';

describe('a delayed picture gets its time back, and nothing else does', () => {
  it('direct play is NEVER widened', () => {
    expect(factorFor('direct')).toBe(1);
    expect(factorFor('direct', 1.9)).toBe(1);        // even if a factor is lying around from a mirrored session
    expect(widen(0.09, factorFor('direct'))).toBeCloseTo(0.09, 6);
  });

  it('a mirrored display starts at the mission’s 1.35×', () => {
    expect(factorFor('mirrored')).toBe(MIRROR_FACTOR);
    expect(MIRROR_FACTOR).toBe(1.35);
    expect(widen(0.09, factorFor('mirrored'))).toBeCloseTo(0.1215, 6);
  });

  it('the factor is configurable but BOUNDED — past 2× it stops being a timing mechanic', () => {
    expect(factorFor('mirrored', 1.6)).toBe(1.6);
    expect(factorFor('mirrored', 9)).toBe(FACTOR_MAX);
    expect(factorFor('mirrored', 0.2)).toBe(FACTOR_MIN);
    expect(factorFor('mirrored', Number.NaN)).toBe(MIRROR_FACTOR);
    expect(FACTOR_MAX).toBeLessThanOrEqual(2);
    expect(FACTOR_MIN).toBe(1);                       // it can only ever GIVE time back, never take it
  });

  it('widen never shrinks a window', () => {
    for (const f of [1, 1.35, 2, 0.1, 99]) expect(widen(0.2, f)).toBeGreaterThanOrEqual(0.2);
  });
});

describe('detection SUGGESTS, it does not decide', () => {
  it('a TV browser is confident: the page is on the screen it draws to', () => {
    for (const ua of ['Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)', 'Mozilla/5.0 (Web0S; Linux/SmartTV)', 'Mozilla/5.0 (Linux; Android 12; Chromecast) CrKey/1.56']) {
      const g = guessDisplay({ userAgent: ua });
      expect(g.suggested).toBe('direct');
      expect(g.confident).toBe(true);
    }
  });

  it('a second screen suggests mirrored, but is NOT confident', () => {
    const g = guessDisplay({ userAgent: 'Mozilla/5.0 (Macintosh)', screenIsExternal: true });
    expect(g.suggested).toBe('mirrored');
    expect(g.confident).toBe(false);
  });

  it('a phone in your hand is direct', () => {
    const g = guessDisplay({ userAgent: 'Mozilla/5.0 (iPhone)', touchPoints: 5, width: 390, height: 844 });
    expect(g.suggested).toBe('direct');
  });

  it('every guess carries its REASON, so the suggestion is legible rather than magic', () => {
    for (const h of [{ userAgent: 'Tizen' }, { userAgent: 'x', screenIsExternal: true }, { userAgent: 'x' }]) {
      expect(guessDisplay(h).because.length).toBeGreaterThan(10);
    }
  });

  it('no hints at all still produces a usable default', () => {
    const s = readDisplaySetting();
    expect(['direct', 'mirrored']).toContain(s.mode);
    expect(s.chosen).toBe(false);                     // nobody chose this, and the UI should know
    expect(s.factor).toBeGreaterThanOrEqual(1);
  });
});

describe('IT IS NOT A DIFFICULTY SETTING AND NEVER SAYS IT IS', () => {
  it('the banner explains the delay, not the difficulty', () => {
    const mirrored: DisplaySetting = { mode: 'mirrored', factor: 1.35, chosen: true };
    const banner = displayBanner(mirrored).toLowerCase();
    expect(banner).toContain('delay');
    for (const word of ['easy', 'easier', 'assist', 'beginner', 'casual', 'handicap', 'cheat']) {
      expect(banner.includes(word), `the banner says "${word}"`).toBe(false);
    }
  });

  it('direct play says so plainly', () => {
    expect(displayBanner({ mode: 'direct', factor: 1, chosen: true })).toMatch(/standard/i);
  });

  it('the two modes are distinguishable at a glance', () => {
    const a = displayBanner({ mode: 'direct', factor: 1, chosen: false });
    const b = displayBanner({ mode: 'mirrored', factor: 1.35, chosen: false });
    expect(a).not.toBe(b);
  });
});

describe('presence reports what it actually managed', () => {
  it('summarises only what was acquired', () => {
    expect(presenceSummary({ fullscreen: true, wakeLock: true, orientation: true, notes: [] })).toContain('fullscreen');
    expect(presenceSummary({ fullscreen: true, wakeLock: false, orientation: false, notes: [] })).not.toContain('awake');
  });

  it('a host that got nothing still reports ready rather than an error', () => {
    // a TV browser has no wake lock and no orientation lock and does not need either
    expect(presenceSummary({ fullscreen: false, wakeLock: false, orientation: false, notes: ['x'] })).toBe('Host ready');
  });
});

describe('the timing factor reaches a real window', () => {
  it('a 3PT-scale perfect band widens by a third on a mirrored screen', () => {
    // the shot bands in this tree are ~0.09 s; a typical wireless mirror adds ~150 ms of picture delay
    const perfect = 0.09;
    const mirrored = widen(perfect, factorFor('mirrored'));
    expect(mirrored - perfect).toBeGreaterThan(0.02);
    expect(mirrored).toBeLessThan(perfect * 2);      // still a timing mechanic
  });

  it('the same call on a direct display is a no-op, so one code path serves both', () => {
    const perfect = 0.09;
    expect(widen(perfect, factorFor('direct'))).toBe(perfect);
  });
});
