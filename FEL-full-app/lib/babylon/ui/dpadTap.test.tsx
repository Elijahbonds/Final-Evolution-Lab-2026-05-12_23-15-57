// hoops-items (2026-11-18): the touch deck's d-pad arrows at a 44 px tap target AS DRAWN (dpadTap.ts, TouchOverlay DPad, knob
// `touch.dpadTapOn`; 0 = the 24 px cross as before). The drawn rects on a real phone layout are measured by
// scripts/probes/hoops-items/dpad.mjs; this holds the numbers and the markup.
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dpadLayout, DPAD_TAP_PX, DPAD_COMPACT_SCALE, TOUCH_DPAD_TAP_ON } from './dpadTap';
import { TouchOverlay, DEAD_DPAD } from './TouchOverlay';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FLOAT_ZONE_H } from './floatStick';
import type { InputBus } from '../core/InputBus';
import { setFeelUser, setFeelSession, setFeelOverride, resetFeelForTests } from '@/lib/feel-panel/feel';

describe('dpadLayout', () => {
  it('upright: a row of four 44 px arrows, shorter than the old 72 px cross, so the d-pad + stick column never shrinks the stick', () => {
    const r = dpadLayout('portrait', true);
    expect(r).toEqual({ shape: 'row', arm: DPAD_TAP_PX, w: 4 * DPAD_TAP_PX, h: DPAD_TAP_PX });
    // the upright column (d-pad + 8 px gap + the float zone) fits a 390 × 844 stage's 234 − 24 px of room at scale 1
    expect(r.h + 8 + FLOAT_ZONE_H).toBeLessThanOrEqual(210);
    expect(r.h).toBeLessThan(72);
  });
  it('sideways (the compact deck, drawn at 0.85): arms large enough to be 44 px as drawn', () => {
    const r = dpadLayout('compact', true);
    expect(r.shape).toBe('cross');
    expect(r.arm * DPAD_COMPACT_SCALE).toBeGreaterThanOrEqual(44);
    expect(r.w).toBe(3 * r.arm);
  });
  it('a tablet or touch laptop: a 44 px cross', () => {
    expect(dpadLayout('landscape', true)).toEqual({ shape: 'cross', arm: 44, w: 132, h: 132 });
  });
  it('off: the old 24 px cross in a 72 px box, in every layout', () => {
    for (const l of ['portrait', 'landscape', 'compact'] as const) expect(dpadLayout(l, false)).toEqual({ shape: 'cross', arm: 24, w: 72, h: 72 });
  });
});

describe('the d-pad on the deck (touch.dpadTapOn)', () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { window: g.window, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
  afterEach(() => {
    resetFeelForTests(); g.window = saved.window;
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator); else delete g.navigator;
  });
  const deck = (modeId: string, w = 390, h = 844) => {
    g.window = { innerWidth: w, innerHeight: h, matchMedia: () => ({ matches: true }), ontouchstart: null };
    Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 5 }, configurable: true, writable: true });
    return renderToStaticMarkup(createElement(TouchOverlay, { bus: { emit: () => {}, gamepadActive: false } as unknown as InputBus, modeId, visible: true }));
  };
  it('ships ON: four labelled 44 px arrows in a row upright, a 52 px cross sideways — every mode that uses the d-pad', () => {
    expect(TOUCH_DPAD_TAP_ON).toBe(1);
    for (const m of ['sprint', 'karate', 'dunk', 'carnival']) {
      const up = deck(m);
      expect(up).toContain('data-dpad-shape="row"');
      expect(up.match(/data-dpad="(up|down|left|right)"/g)).toHaveLength(4);
      expect(up.match(/style="width:44px;height:44px/g)).toHaveLength(4);
      for (const l of ['D-pad up', 'D-pad down', 'D-pad left', 'D-pad right']) expect(up).toContain(`aria-label="${l}"`);
      const side = deck(m, 844, 390);
      expect(side).toContain('data-dpad-shape="cross"');
      expect(side.match(/style="width:52px;height:52px/g)).toHaveLength(4);
    }
  });
  it('1v1 and 3v3 (no d-pad verb): a hollow, unpressable cross in the old 72 px place, upright and sideways', () => {
    expect([...DEAD_DPAD].sort()).toEqual(['onevone', 'threevthree']);
    for (const m of DEAD_DPAD) for (const [w, h] of [[390, 844], [844, 390]]) {
      const html = deck(m, w, h);
      expect(html).toContain('data-dpad-shape="hollow"');
      expect(html).toContain('aria-hidden="true" data-dpad-shape="hollow" class="pointer-events-none relative h-[72px] w-[72px]');
      expect(html).not.toMatch(/data-dpad="/);
      expect(html).not.toMatch(/>▲<\/button>/);
    }
  });
  it('the hollow modes really use no d-pad: 1v1 reads none, 3v3 only refuses it', () => {
    const src = (f: string) => readFileSync(join(__dirname, '..', 'modes', f), 'utf8');
    expect(src('OneVOneMode.ts')).not.toMatch(/t === 'dpad'/);
    const lines = src('ThreeVThreeMode.ts').split('\n'); const at = lines.flatMap((l, i) => (/t === 'dpad'/.test(l) ? [i] : []));
    expect(at).toHaveLength(1);
    expect(lines.slice(at[0], at[0] + 2).join(' ')).toContain("refuse(ctx, 'MOVE WITH THE STICK')");
  });
  it('OFF (0): the 24 px cross exactly as before', () => {
    setFeelUser(true); setFeelSession(null); expect(setFeelOverride('touch.dpadTapOn', 0)).toBe(0);
    const html = deck('onevone');
    expect(html).not.toContain('data-dpad');
    expect(html).toContain('relative h-[72px] w-[72px]');
    expect(html.match(/h-6 w-6 -translate-[xy]-1\/2 rounded-[tblr]-md/g)).toHaveLength(4);
  });
});
