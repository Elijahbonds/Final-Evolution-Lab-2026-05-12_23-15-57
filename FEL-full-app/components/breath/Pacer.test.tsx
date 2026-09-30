// The breathing pacer, rendered (MIRROR-COACH P7, 2026-09-29). A server render is the component's first paint, so this
// reads what the ring actually draws: the count and the caption for the host's seconds, the breath number, the ring's
// size — and, under reduced motion, no size change at all. A server render with no preference paints the calm ring
// (the server has no window to ask), and the explicit prop wins either way.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BreathPacer, ringCount, type BreathPacerProps } from './Pacer';
import { PACER_AFTER_WORD, PACER_BEFORE_WORD, PACER_WORDS, pacerView, ringLook } from '@/lib/breath/pacer';
import { SQUAT_BREATH_PACER } from '@/lib/mirror/squatStage';
import { WAKE_UP } from '@/lib/drills/drills';

const html = (p: BreathPacerProps) => renderToStaticMarkup(createElement(BreathPacer, p));
const attr = (m: string, name: string) => m.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;
// matched by attribute NAME, in any order and with any value (React writes a bare data-x as data-x="true")
const tag = (m: string, a: string) => m.match(new RegExp(`<[a-z]+ [^>]*\\b${a}="[^"]*"[^>]*>`))?.[0] ?? '';
const inner = (m: string, a: string) => m.match(new RegExp(`<([a-z]+) [^>]*\\b${a}="[^"]*"[^>]*>([^<]*)</\\1>`))?.[2] ?? null;
const ring = (m: string) => tag(m, 'data-pacer-ring').match(/style="([^"]*)"/)?.[1] ?? '';
const count = (m: string) => inner(m, 'data-pacer-count');
const caption = (m: string) => inner(m, 'data-pacer-caption');

describe('BreathPacer', () => {
  it("draws the host's seconds: the part's name, its count, the breath number (the Mirror's 4-2-6 at 13 s: breath 2, in, 3)", () => {
    const m = html({ id: 'mirror-breathe', spec: SQUAT_BREATH_PACER, elapsedSec: 13, reducedMotion: false });
    expect(attr(m, 'data-pacer')).toBe('mirror-breathe');
    expect(attr(m, 'data-pacer-state')).toBe('on');
    expect(attr(m, 'data-pacer-phase')).toBe('in');
    expect(count(m)).toBe('3');
    expect(caption(m)).toBe(PACER_WORDS.in);
    expect(m).toContain('breath 2 of 3');
  });

  it('full motion: the ring is drawn at the size the pacer asks for (grows on the breath in)', () => {
    const at = (t: number) => html({ spec: SQUAT_BREATH_PACER, elapsedSec: t, reducedMotion: false });
    const want = (t: number) => ringLook(pacerView(SQUAT_BREATH_PACER, t).fill, false);
    for (const t of [0, 1, 2, 3.5, 5, 8, 11.9]) {
      expect(ring(at(t)), `t=${t}`).toContain(`transform:scale(${want(t).scale.toFixed(3)})`);
      expect(ring(at(t)), `t=${t}`).toContain(`opacity:${Number(want(t).opacity.toFixed(3))}`);
    }
    expect(ring(at(0))).toContain('scale(0.600)');
    expect(ring(at(5))).toContain('scale(1.000)');
    expect(attr(at(0), 'data-reduced')).toBe('false');
  });

  it('REDUCED MOTION: no size change at any moment of the breath — only the brightness paces', () => {
    const opacities = new Set<string>();
    for (let t = 0; t < 36; t += 0.5) {
      const m = html({ spec: SQUAT_BREATH_PACER, elapsedSec: t, reducedMotion: true });
      expect(ring(m), `t=${t}`).not.toContain('transform');
      expect(attr(m, 'data-reduced')).toBe('true');
      opacities.add(ring(m).match(/opacity:([0-9.]+)/)![1]);
    }
    expect(opacities.size).toBeGreaterThan(5);   // it still paces
  });

  it('a server render with no preference paints the calm ring (no window to ask), and the prop wins either way', () => {
    const m = html({ spec: SQUAT_BREATH_PACER, elapsedSec: 2 });
    expect(attr(m, 'data-reduced')).toBe('true');
    expect(ring(m)).not.toContain('transform');
  });

  it("before its first breath it counts down to it (the Wake-Up's Pressurize starts 6 s in); after the last it says so", () => {
    const pacer = WAKE_UP.phases.find((p) => p.id === 'pressurize')!.pacer!;
    const before = html({ spec: pacer, elapsedSec: 2, reducedMotion: false });
    expect(attr(before, 'data-pacer-state')).toBe('before');
    expect(count(before)).toBe('4');
    expect(caption(before)).toBe(PACER_BEFORE_WORD);
    expect(before).not.toContain('data-pacer-round');
    const after = html({ spec: pacer, elapsedSec: 50, reducedMotion: false });
    expect(attr(after, 'data-pacer-state')).toBe('after');
    expect(count(after)).toBe('');
    expect(caption(after)).toBe(PACER_AFTER_WORD);
  });

  it('captions off: the ring and the count only', () => {
    const m = html({ spec: SQUAT_BREATH_PACER, elapsedSec: 1, captions: false, reducedMotion: false });
    expect(m).not.toContain('data-pacer-caption');
    expect(count(m)).toBe('3');
  });
});

// MIRROR-COACH P7 FIX (2026-09-29, review): the Dial-Up's 1 s parts left the ring reading "1" for its whole run, and the
// caption's live region doubled every host's own live line (two announcements a second on the Dial-Up).
describe('BreathPacer: the breath-number count and the opt-in live caption', () => {
  const FAST = { from: 3, inSec: 1, holdSec: 0, outSec: 1, rounds: 5 };
  it("count='breath': the ring shows which breath while breathing, the get-ready count before, nothing after", () => {
    const at = (t: number) => count(html({ spec: FAST, elapsedSec: t, count: 'breath', reducedMotion: false }));
    expect(at(1)).toBe('2');     // get ready: 2 s to the first breath
    expect(at(3.5)).toBe('1');
    expect(at(6.5)).toBe('2');
    expect(at(12.9)).toBe('5');
    expect(at(13)).toBe('');
    // the default is unchanged: seconds left in the part (the Mirror's 4-2-6)
    expect(count(html({ spec: SQUAT_BREATH_PACER, elapsedSec: 1, reducedMotion: false }))).toBe('3');
    expect(ringCount(pacerView(FAST, 5.5), 'seconds')).toBe(1);
    expect(ringCount(pacerView(FAST, 5.5), 'breath')).toBe(2);
  });
  it('the caption is a live region only when the host asks (liveCaption); a host with its own live line keeps the only one', () => {
    expect(html({ spec: SQUAT_BREATH_PACER, elapsedSec: 1 })).not.toContain('aria-live');
    expect(html({ spec: SQUAT_BREATH_PACER, elapsedSec: 1, liveCaption: true })).toContain('aria-live="polite"');
  });
});
