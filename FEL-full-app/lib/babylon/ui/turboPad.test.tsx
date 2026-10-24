// hoops round 2 (owner 2026-10-23: "Touch R2: add a TURBO pad"). The TURBO pad IS a pad's R2: the same InputBus event, read by the same
// LocalInputSource, so the R2 escapes reach a phone with no move logic of their own — held + DOWN is the snatch-back, let go + DOWN the
// step-back. It is drawn only on the touch deck of a mode whose R2 is the turbo, never on a screen with no touch, never under a held pad.
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TURBO_DOWN, TURBO_UP, turboControl } from './TurboPad';
import { TouchOverlay } from './TouchOverlay';
import { MODE_VERBS, TURBO_MODES, BOOST_MODES } from './modeVerbs';
import { InputBus, type FelInput } from '../core/InputBus';
import { LocalInputSource } from '../core/PlayerSlot';
import { stickMoveFor, type StickGesture } from '../core/StickHandle';

const DOWN: StickGesture = { kind: 'flick', dir: 'down', dir8: 'down', x: 0, y: 1 };
/** The hoops modes' read of a flick (OneVOneMode / ThreeVThreeMode): `escape` is the slot's sprint — R2 held. */
const pick = (slot: LocalInputSource, hand: 'Left' | 'Right' = 'Right') => {
  const i = slot.poll();
  return stickMoveFor(DOWN, { speed01: 0.5, pressured: true, sprint: i.sprint, hand, escape: !!i.sprint })?.move;
};

describe('TURBO is R2', () => {
  it('press sends a pad\'s R2 pulled all the way, release lets it go — once each', () => {
    const sent: FelInput[] = []; const c = turboControl({ emit: (e) => sent.push(e) });
    c.press(); c.press(); expect(c.held()).toBe(true);
    c.release(); c.release(); expect(c.held()).toBe(false);
    expect(sent).toEqual([TURBO_DOWN, TURBO_UP]);
    expect(TURBO_DOWN).toEqual({ t: 'trigger', side: 'R', value: 1 }); expect(TURBO_UP).toEqual({ t: 'trigger', side: 'R', value: 0 });
  });
  it('through the real InputBus and the hoops slot: TURBO held + DOWN = the snatch-back; TURBO let go + DOWN = the step-back (either hand)', () => {
    for (const hand of ['Right', 'Left'] as const) {
      const bus = new InputBus(); const slot = new LocalInputSource(); bus.on((e) => slot.feed(e));
      const turbo = turboControl(bus);
      expect(pick(slot, hand), 'never touched').toBe('stepback');
      turbo.press();
      expect(slot.poll().turbo).toBe(true);
      expect(pick(slot, hand), `${hand}: held`).toBe('snatchback');
      turbo.release();
      expect(slot.poll().turbo).toBe(false);
      expect(pick(slot, hand), `${hand}: let go`).toBe('stepback');
    }
  });
  it('it reads exactly as a pad\'s R2: the same intent from the pad\'s trigger and from the turbo pad', () => {
    const a = new LocalInputSource(), b = new LocalInputSource();
    a.feed({ t: 'trigger', side: 'R', value: 1 }); turboControl({ emit: (e) => b.feed(e) }).press();
    expect(b.poll()).toEqual(a.poll());
  });
});

describe('who sees it', () => {
  it('the hoops modes, and only they, carry it (not a boost mode)', () => {
    expect([...TURBO_MODES].sort()).toEqual(['onevone', 'threevthree']);
    for (const [k, v] of Object.entries(MODE_VERBS)) expect(v.turbo, k).toBe(TURBO_MODES.has(k));
    for (const k of TURBO_MODES) expect(BOOST_MODES.has(k), k).toBe(false);
  });

  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { window: g.window, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
  afterEach(() => {
    g.window = saved.window;
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator); else delete g.navigator;
  });
  /** A screen: its size, and whether it has touch (a phone) or not (a mouse-and-keyboard desktop, a TV browser). */
  const screen = (w: number, h: number, touch: boolean) => {
    g.window = { innerWidth: w, innerHeight: h, matchMedia: () => ({ matches: touch }), ...(touch ? { ontouchstart: null } : {}) };
    Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: touch ? 5 : 0 }, configurable: true, writable: true });
  };
  const render = (modeId: string, gamepadActive = false) =>
    renderToStaticMarkup(createElement(TouchOverlay, { bus: { emit: () => {}, gamepadActive } as unknown as InputBus, modeId, visible: true }));

  for (const [name, w, h] of [['phone portrait 390×844', 390, 844], ['phone sideways 844×390', 844, 390], ['tablet 1180×820', 1180, 820]] as const) {
    it(`${name}: 1v1 and 3v3 draw the TURBO pad; other modes do not`, () => {
      screen(w, h, true);
      for (const m of ['onevone', 'threevthree']) expect(render(m), m).toContain('data-turbo-pad');
      for (const m of ['velocitykart', 'tennis', 'default']) expect(render(m), m).not.toContain('data-turbo-pad');
    });
  }
  it('no touch (desktop, TV browser): no pad — no deck at all', () => {
    for (const [w, h] of [[1280, 720], [1920, 1080], [844, 390]] as const) {
      screen(w, h, false);
      expect(render('onevone')).toBe(''); expect(render('threevthree')).toBe('');
    }
  });
  it('a controller held: no pad (the deck hides under a pad)', () => {
    screen(390, 844, true);
    expect(render('onevone', true)).toBe('');
  });
  it('portrait: the pad sits beside the diamond OUT of the column\'s flow (the column keeps its height: fitDeck\'s scale is unchanged)', () => {
    const src = readFileSync(path.resolve(__dirname, 'TouchOverlay.tsx'), 'utf8');
    expect(src).toMatch(/<div className="absolute right-full top-1\/2 mr-2 -translate-y-1\/2"><TurboPad bus=\{props\.bus\} shape="round" \/><\/div>/);
    const pad = readFileSync(path.resolve(__dirname, 'TurboPad.tsx'), 'utf8');
    expect(pad).toMatch(/motion-reduce:transition-none motion-reduce:active:scale-100/);   // reduced motion: no press scale
    expect(pad).toMatch(/onPointerUp=\{up\} onPointerCancel=\{up\} onPointerLeave=\{up\}/);   // every way a thumb leaves lets R2 go
    expect(pad).toMatch(/return \(\) => c\.release\(\)/);                                      // and so does the deck going away
  });
});
