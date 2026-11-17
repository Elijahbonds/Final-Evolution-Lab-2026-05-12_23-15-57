// lane/move-feel-2 (owner 2026-11-17): THE PHONE STICK — "it appears under the thumb, about 1.5× today's size, a 10 % dead zone, the same
// push always the same speed" (lib/babylon/ui/floatStick, TouchOverlay FloatStick, knob `touch.floatStick`; 0 = today's fixed stick).
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { floatStickVector, floatKnobOffset, FLOAT_BASE_PX, FLOAT_RADIUS_PX, FLOAT_DEAD, FIXED_STICK_PX, FLOAT_ZONE_W, FLOAT_ZONE_H, TOUCH_FLOAT_STICK } from './floatStick';
import { TouchOverlay, FLOAT_STICK_MODES } from './TouchOverlay';
import type { InputBus } from '../core/InputBus';
import { setFeelUser, setFeelSession, setFeelOverride, resetFeelForTests } from '@/lib/feel-panel/feel';

describe('the floating stick: the thumb → stick mapping', () => {
  it('1.5× today\'s stick; full speed at its rim', () => {
    expect(FLOAT_BASE_PX).toBe(FIXED_STICK_PX * 1.5);
    const v = floatStickVector(FLOAT_RADIUS_PX, 0); expect(v.x).toBeCloseTo(1, 9); expect(v.y).toBe(0);
    const far = floatStickVector(0, -3 * FLOAT_RADIUS_PX); expect(Math.hypot(far.x, far.y)).toBeCloseTo(1, 9); expect(far.y).toBeLessThan(0);
  });
  it('a 10 % dead zone: a thumb that lands and wobbles is a standstill; past it the travel is rescaled from 0', () => {
    expect(FLOAT_DEAD).toBe(0.1);
    expect(floatStickVector(0, 0)).toEqual({ x: 0, y: 0 });
    expect(floatStickVector(0.1 * FLOAT_RADIUS_PX - 0.01, 0)).toEqual({ x: 0, y: 0 });
    expect(floatStickVector(0.55 * FLOAT_RADIUS_PX, 0).x).toBeCloseTo(0.5, 9);   // halfway through the live travel = half the stick
    expect(floatStickVector(0.1 * FLOAT_RADIUS_PX + 0.5, 0).x).toBeLessThan(0.01);   // continuous out of the dead zone (no step)
  });
  it('the direction is the thumb\'s, at every magnitude', () => {
    for (const a of [0, 0.3, 1.2, 2.5, -2]) { const v = floatStickVector(Math.cos(a) * 50, Math.sin(a) * 50); expect(Math.atan2(v.y, v.x)).toBeCloseTo(a, 9); }
  });
  it('the knob is held to the base\'s rim', () => {
    const k = floatKnobOffset(300, 0); expect(k.x).toBeCloseTo(FLOAT_RADIUS_PX, 9);
    expect(floatKnobOffset(10, 5)).toEqual({ x: 10, y: 5 });
  });
  it('the zone is wider than the base (it floats) and far over a 44 px tap target; no taller than the old column needs (the upright fit)', () => {
    expect(FLOAT_ZONE_W).toBeGreaterThan(FLOAT_BASE_PX); expect(Math.min(FLOAT_ZONE_W, FLOAT_ZONE_H)).toBeGreaterThan(44);
    expect(72 + 8 + FLOAT_ZONE_H).toBeLessThanOrEqual(216);   // d-pad + gap + zone: fitDeck keeps ≥ 0.97 on a 390 × 844 stage (234 − 24 px)
  });
});

describe('the floating stick on the deck (touch.floatStick)', () => {
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
  // test changed (venice-v1, 2026-11-17): + venice_hub — the Venice hub walks on the courts' stick (coordinator's V1 brief: "the floating
  // phone stick (#600)"). Still an exact list, so any other mode added fails here.
  it('ships ON for 1v1, 3v3 and the Venice hub, portrait and sideways; every other mode keeps the fixed stick', () => {
    expect(TOUCH_FLOAT_STICK).toBe(1);
    expect([...FLOAT_STICK_MODES].sort()).toEqual(['onevone', 'threevthree', 'venice_hub']);
    for (const [w, h] of [[390, 844], [844, 390]]) for (const m of FLOAT_STICK_MODES) expect(deck(m, w, h)).toContain('data-float-stick');
    expect(deck('skateboard')).not.toContain('data-float-stick');
  });
  it('OFF (0): today\'s fixed MOVE stick on 1v1 / 3v3', () => {
    setFeelUser(true); setFeelSession(null); expect(setFeelOverride('touch.floatStick', 0)).toBe(0);
    const html = deck('onevone');
    expect(html).not.toContain('data-float-stick');
    expect(html).toContain('h-24 w-24');
  });
});
