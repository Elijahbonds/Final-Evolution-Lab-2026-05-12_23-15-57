// padModel.test.ts — the Cypher's phone pad as data (lane/dance-extras, 2026-10-14). What these hold, and why each is here:
//   1. EVERY MATCH VERB IS REACHABLE BY TOUCH. Each move family (the seven in DANCE_LIBRARY) maps to a face button through
//      chartPlay.FAMILY_BUTTON; the pad must carry that button, live, and name the family on it. Plus the pick screen's own
//      verbs (START, MATCH on/off, ◀ ▶ ▲ ▼) and the freeze's hold (a release for every press).
//   2. THE SAME VERBS. Every press the pad makes is, deep-equal, the event a gamepad's face button and the keyboard's J K L I
//      send (InputBus.ts: `{t:'button', btn, pressed}` with no src), and every lift is that event released.
//   3. NOTHING THE ROOM DOES NOT READ. A live button in a song is one the room treats as a tap (danceTap, or matchPress in
//      MATCH); a socket (hollow) is exactly a button the room ignores there — the pad never draws a control that does nothing.
//   4. THE PAD KNOWS NO JUDGE. It imports nothing that scores (a source check), so touch cannot add a window.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FelInput } from '../../core/InputBus';
import { DANCE_LIBRARY } from '../../core/DanceCore';
import { danceTap } from '../../audio/SongClock';
import { MODE_VERBS } from '../../ui/modeVerbs';
import { FAMILY_BUTTON, buttonForStep, matchPress } from '../chartPlay';
import {
  DEFAULT_PAD_STATE, FAMILY_LABEL, HOLD_LABEL, PAD_BUTTON, PAD_GAP_PX, PAD_LEFT, PAD_RIGHT, PAD_SLOTS, PICK_KEYS, PICK_KEY, familiesOf,
  overlapArea, padButtons, padRects, pickEvent, type DancePadMode, type DancePadState, type PadSlot,
} from './padModel';
import { padStore } from './padStore';

const state = (mode: DancePadMode, extra: Partial<DancePadState> = {}): DancePadState => ({ ...DEFAULT_PAD_STATE, mode, ...extra });
const press = (btn: PadSlot): FelInput => ({ t: 'button', btn, pressed: true });   // what InputBus emits for a pad's face button and J K L I

describe('every MATCH verb is reachable by touch', () => {
  it('the seven families each land on a live button that names them', () => {
    const buttons = padButtons(state('match'));
    for (const clip of DANCE_LIBRARY) {
      const slot = FAMILY_BUTTON[clip.category];
      const b = buttons.find((x) => x.slot === slot)!;
      expect(b.live, `${clip.category} → ${slot}`).toBe(true);
      expect(b.sub, `${slot} names ${clip.category}`).toContain(FAMILY_LABEL[clip.category]);
      expect(b.down).toEqual(press(slot));
    }
    // and every one of the four face buttons is some family's: the pad draws no button MATCH does not use
    expect(new Set(Object.values(FAMILY_BUTTON))).toEqual(new Set(PAD_SLOTS));
  });

  it('the buttons a step asks for are the buttons the pad carries (buttonForStep over every library clip)', () => {
    const buttons = padButtons(state('match'));
    for (const clip of DANCE_LIBRARY) {
      const want = buttonForStep({ clipId: clip.id, beat: 0, holdBeats: clip.beats, mirrored: false });
      expect(buttons.find((b) => b.slot === want && b.live)?.down).toEqual(press(want));
    }
  });

  it('and what each button is called is what MATCH makes it (a re-map of FAMILY_BUTTON must be a decision, not a drift)', () => {
    const sub = Object.fromEntries(padButtons(state('match')).map((b) => [b.slot, b.sub]));
    expect(sub).toEqual({ A: 'TOP ROCK · BOUNCE', B: 'FOOTWORK · POWER', X: 'WAVE · SPIN', Y: 'FREEZE · HOLD' });
  });

  it('Y says HOLD: the freeze is held through its beats, and the pad carries a release for every press', () => {
    const y = padButtons(state('match')).find((b) => b.slot === 'Y')!;
    expect(familiesOf('Y')).toContain('freeze');
    expect(y.sub).toContain(HOLD_LABEL);
    for (const b of padButtons(state('match'))) expect(b.up).toEqual({ ...b.down, pressed: false });
  });

  it('the pick screen: A and B start, Y toggles MATCH (and says which way it is), ◀ ▶ ▲ ▼ are the d-pad the room reads', () => {
    const off = padButtons(state('pick', { matchOn: false }));
    const on = padButtons(state('pick', { matchOn: true }));
    expect(off.find((b) => b.slot === 'A')!.down).toEqual(press('A'));
    expect(off.find((b) => b.slot === 'B')!.down).toEqual(press('B'));
    expect(off.find((b) => b.slot === 'Y')!.down).toEqual(press('Y'));
    expect(off.find((b) => b.slot === 'Y')!.label).toBe('MATCH OFF');
    expect(on.find((b) => b.slot === 'Y')!.label).toBe('MATCH ON');
    expect(off.find((b) => b.slot === 'X')!.live).toBe(false);   // X does nothing on the pick screen: a socket
    expect(PICK_KEYS.map((k) => k.dir).sort()).toEqual(['down', 'left', 'right', 'up']);
    expect(pickEvent('left', true)).toEqual({ t: 'dpad', dir: 'left', pressed: true });
    expect(pickEvent('left', false)).toEqual({ t: 'dpad', dir: 'left', pressed: false });
  });

  it('the pick keys are exactly the d-pad directions DanceMode.onInput reads in its pick phase', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../modes/DanceMode.ts'), 'utf8');
    const pick = src.slice(src.indexOf("if (phase === 'pick') {"), src.indexOf('// IMPROVE (2026-10-06, #13): a held freeze ends'));
    expect(pick).toContain("e.dir === 'left' || e.dir === 'right'");                 // ◀ ▶ browse
    expect(pick).toContain("e.dir === 'up' || e.dir === 'down'");                    // ▲ ▼ level
    expect(pick).toContain("e.btn === 'A' || e.btn === 'B'");                        // START
    expect(pick).toContain("e.btn === 'Y'");                                         // MATCH
  });
});

describe('the same verbs: touch sends what a gamepad and the keyboard send', () => {
  it('each slot\'s press is MODE_VERBS.dance\'s own event, and the literal pad / J K L I event', () => {
    const cfg = MODE_VERBS.dance.buttons;
    PAD_SLOTS.forEach((slot, i) => {
      const b = padButtons(state('match')).find((x) => x.slot === slot)!;
      const ix = ['A', 'B', 'X', 'Y'].indexOf(slot);
      expect(b.down).toEqual(cfg[ix].emit);
      expect(b.down).toEqual({ t: 'button', btn: slot, pressed: true });    // no src: a pad's, not SPACE's made-up key-up A
      expect(b.color).toBe(cfg[ix].color);
      void i;
    });
  });

  it('a lift is the same event released, so a held freeze is a held finger', () => {
    for (const mode of ['pick', 'any', 'match', 'free'] as const) {
      for (const b of padButtons(state(mode, { free: { A: 'TOP ROCK' } }))) {
        if (b.live) expect(b.up).toEqual({ t: 'button', btn: b.slot, pressed: false });
        else { expect(b.down).toBeNull(); expect(b.up).toBeNull(); }
      }
    }
  });
});

describe('a live button is one the room reads; a socket is one it ignores', () => {
  it('MATCH off: A and B tap (danceTap), X and Y do not — and the pad draws exactly those two as sockets', () => {
    for (const b of padButtons(state('any'))) {
      const tapped = danceTap('up', press(b.slot)).tap;
      expect(b.live, `${b.slot} live = tapped`).toBe(tapped);
    }
  });
  it('MATCH on: every button is a tap and reads as its own letter (matchPress)', () => {
    for (const b of padButtons(state('match'))) {
      expect(b.live).toBe(true);
      expect(matchPress(b.down!, danceTap('up', b.down!).tap)).toBe(b.slot);
    }
  });
  it('the thumb pairs are A B on the left, X Y on the right', () => {
    expect([...PAD_LEFT]).toEqual(['A', 'B']);
    expect([...PAD_RIGHT]).toEqual(['X', 'Y']);
  });
});

describe('the store the room hands the pad its state through', () => {
  it('starts at the state that asks the least (MATCH off), merges changes, and tells subscribers only about a real one', () => {
    padStore.reset();
    expect(padStore.get()).toEqual(DEFAULT_PAD_STATE);
    expect(padStore.getServer()).toEqual(DEFAULT_PAD_STATE);
    let heard = 0;
    const off = padStore.subscribe(() => { heard++; });
    padStore.set({ mode: 'pick', matchOn: true });
    expect(padStore.get()).toMatchObject({ mode: 'pick', matchOn: true });
    expect(heard).toBe(1);
    padStore.set({ mode: 'pick', matchOn: true });            // the same again: nobody hears it
    expect(heard).toBe(1);
    const same = padStore.get();
    padStore.set({});
    expect(padStore.get()).toBe(same);                          // a stable object until it changes (useSyncExternalStore)
    padStore.set({ mode: 'free', free: { A: 'TOP ROCK' } });
    expect(padStore.get().free).toEqual({ A: 'TOP ROCK' });
    expect(heard).toBe(2);
    padStore.reset();
    expect(padStore.get()).toEqual(DEFAULT_PAD_STATE);
    expect(heard).toBe(3);
    off();
    padStore.set({ mode: 'match' });
    expect(heard).toBe(3);                                      // unsubscribed
    padStore.reset();
  });
  it('in a freestyle section a button that has no name yet prints its letter, never a blank', () => {
    const b = padButtons(state('free', { free: { A: 'TOP ROCK' } }));
    expect(b.find((x) => x.slot === 'A')!.label).toBe('TOP ROCK');
    expect(b.find((x) => x.slot === 'X')!.label).toBe('X');
  });
});

describe('the pad knows no judge', () => {
  it('its sources import nothing that scores, so touch cannot add a window or a value', () => {
    for (const f of ['padModel.ts', 'DancePad.tsx']) {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
      const imports = src.split('\n').filter((l) => /^import /.test(l)).join('\n');
      expect(imports, f).not.toMatch(/DancePerformance|judgeDelta|JUDGE_WINDOWS|MISS_AFTER|stepAccepts|hitBody/);
      expect(imports, f).not.toMatch(/\/DanceMode'|SongClock/);
      // the only thing taken from DanceCore is a TYPE (the family names)
      expect(imports.match(/from '[^']*DanceCore'/g) ?? [], f).toSatisfy((m: string[]) => m.length === 0 || /import type \{ DanceClip \}/.test(src));
      expect(src, f).not.toMatch(/\bperf\.|\.score\b|\.combo\b/);
    }
  });
});

// MEASURED, not drawn: the real DanceMode in headless Chromium (swiftshader), a 390 × 844 phone (the portrait stage is game-surface.css's
// tall one: 374 × 709) and an 844 × 390 phone held sideways (the console view's 794 × 366 host), at the first frame of a song with the
// cue lane up. Rects are host-relative CSS px: the lane's plate (data-lane-plate), the dancer's projected bounding box, and every visible
// control of the OLD deck (TouchOverlay's whole rig: sticks, d-pad, diamond, hollow socket) and of the new pad. Screenshots and the raw
// rects are in the lane's scratch evidence; rerun the rig to refresh them.
const MEASURED = {
  portrait: {
    stage: { w: 374, h: 709 }, deck: 'portrait' as const,
    lane: { x: 13, y: 395.6, w: 348, h: 80 }, hero: { x: 67.3, y: 263.5, w: 239.1, h: 321.8 },
    legacy: [
      { x: 49, y: 520, w: 24, h: 24 }, { x: 49, y: 568, w: 24, h: 24 }, { x: 25, y: 544, w: 24, h: 24 }, { x: 73, y: 544, w: 24, h: 24 }, { x: 13, y: 600, w: 96, h: 96 },
      { x: 255, y: 444, w: 64, h: 64 }, { x: 213, y: 486, w: 64, h: 64 }, { x: 297, y: 486, w: 64, h: 64 }, { x: 255, y: 528, w: 64, h: 64 }, { x: 239, y: 600, w: 96, h: 96 },
    ],
    pad: [{ x: 13, y: 640, w: 76, h: 56 }, { x: 97, y: 640, w: 76, h: 56 }, { x: 201, y: 640, w: 76, h: 56 }, { x: 285, y: 640, w: 76, h: 56 }],
  },
  landscape: {
    stage: { w: 794, h: 366 }, deck: 'compact' as const,
    lane: { x: 12, y: 169.6, w: 770, h: 80 }, hero: { x: 295.7, y: 106.1, w: 202.4, h: 272 },
    legacy: [
      { x: 120.8, y: 292.8, w: 20.4, h: 20.4 }, { x: 120.8, y: 333.6, w: 20.4, h: 20.4 }, { x: 100.4, y: 313.2, w: 20.4, h: 20.4 }, { x: 141.2, y: 313.2, w: 20.4, h: 20.4 },
      { x: 12, y: 272.4, w: 81.6, h: 81.6 }, { x: 567.8, y: 272.4, w: 81.6, h: 81.6 }, { x: 691.9, y: 228.2, w: 54.4, h: 54.4 }, { x: 656.2, y: 263.9, w: 54.4, h: 54.4 },
      { x: 727.6, y: 263.9, w: 54.4, h: 54.4 }, { x: 691.9, y: 299.6, w: 54.4, h: 54.4 },
    ],
    pad: [{ x: 12, y: 294, w: 88, h: 60 }, { x: 108, y: 294, w: 88, h: 60 }, { x: 598, y: 294, w: 88, h: 60 }, { x: 694, y: 294, w: 88, h: 60 }],
  },
};
const coverage = (rects: readonly { x: number; y: number; w: number; h: number }[], target: { x: number; y: number; w: number; h: number }): number => {
  // the area of the union of the rects inside `target` (a sweep over the grid their edges make)
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b), ys = [...new Set(rects.flatMap((r) => [r.y, r.y + r.h]))].sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
    const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 };
    if (rects.some((r) => c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h)) total += overlapArea({ x: xs[i], y: ys[j], w: xs[i + 1] - xs[i], h: ys[j + 1] - ys[j] }, target);
  }
  return total;
};

describe('the pad covers the dancer and the cue lane no more than the old deck did — measured on the real room', () => {
  for (const [name, m] of Object.entries(MEASURED)) {
    it(`${name}: the model's rects are the real layout (within a pixel and the stage's own border)`, () => {
      const r = padRects(m.stage.w, m.stage.h, m.deck);
      const b = PAD_BUTTON[m.deck];
      const model = [r.left, r.right].flatMap((pair) => [{ ...pair, w: b.w }, { ...pair, x: pair.x + b.w + PAD_GAP_PX, w: b.w }]);
      model.forEach((q, i) => {
        expect(Math.abs(q.x - m.pad[i].x), `${name} button ${i} x`).toBeLessThanOrEqual(2);
        expect(Math.abs(q.y - m.pad[i].y), `${name} button ${i} y`).toBeLessThanOrEqual(2);
        expect(q.w).toBe(m.pad[i].w);
        expect(q.h).toBe(m.pad[i].h);
      });
    });
    it(`${name}: the pad touches neither the lane nor the dancer, where the old deck covered ${name === 'portrait' ? 'both' : 'the lane'}`, () => {
      expect(coverage(m.pad, m.lane)).toBe(0);
      expect(coverage(m.pad, m.hero)).toBe(0);
      const oldLane = coverage(m.legacy, m.lane), oldHero = coverage(m.legacy, m.hero);
      expect(oldLane, 'the old deck covered the lane').toBeGreaterThan(0);                  // the measurement this pad answers
      if (name === 'portrait') expect(oldHero, 'and, in portrait, the dancer\'s legs').toBeGreaterThan(0);
      expect(coverage(m.pad, m.lane)).toBeLessThanOrEqual(oldLane);
      expect(coverage(m.pad, m.hero)).toBeLessThanOrEqual(oldHero);
    });
    it(`${name}: in a song the pad is four buttons (${name === 'portrait' ? '17,024' : '21,120'} px²) and the old deck ten controls, a smaller footprint in portrait`, () => {
      const area = (rs: readonly { w: number; h: number }[]) => rs.reduce((n, r) => n + r.w * r.h, 0);
      expect(m.pad).toHaveLength(4);
      if (name === 'portrait') expect(area(m.pad)).toBeLessThan(area(m.legacy));
    });
  }
});

describe('footprint: the pad sits in the corners and leaves the middle of the stage alone', () => {
  const STAGES = [
    { name: '374×709 portrait stage (game-surface.css: 84svh of an 844 phone)', w: 374, h: 709, deck: 'portrait' as const },
    { name: '844×390 sideways phone', w: 844, h: 390, deck: 'compact' as const },
    { name: '1024×600 tablet', w: 1024, h: 600, deck: 'landscape' as const },
  ];
  for (const s of STAGES) {
    it(`${s.name}: two pairs, each inside the stage, apart, with the centre clear`, () => {
      const r = padRects(s.w, s.h, s.deck);
      for (const k of ['left', 'right', 'pickLeft', 'pickRight'] as const) {
        expect(r[k].x).toBeGreaterThanOrEqual(0);
        expect(r[k].x + r[k].w).toBeLessThanOrEqual(s.w);
        expect(r[k].y).toBeGreaterThanOrEqual(0);
        expect(r[k].y + r[k].h).toBeLessThanOrEqual(s.h);
      }
      expect(r.left.x + r.left.w).toBeLessThan(r.right.x);                       // the pairs do not touch
      expect(overlapArea(r.left, r.right)).toBe(0);
      // a button is at least 44 CSS px each way (the touch minimum) at full size
      expect(PAD_BUTTON[s.deck].w).toBeGreaterThanOrEqual(44);
      expect(PAD_BUTTON[s.deck].h).toBeGreaterThanOrEqual(44);
      expect(PICK_KEY.w).toBeGreaterThanOrEqual(44);
      expect(PICK_KEY.h).toBeGreaterThanOrEqual(40);
      // the pair is exactly two buttons and a gap wide
      expect(r.left.w).toBe(2 * PAD_BUTTON[s.deck].w + PAD_GAP_PX);
    });
    it(`${s.name}: the pick keys clear the host's control-hint line (64 px up the stage, 24 px tall, measured)`, () => {
      const r = padRects(s.w, s.h, s.deck);
      const hint = { x: 0, y: s.h - 64 - 24, w: s.w, h: 24 };
      // the hint is centred and ~265 px wide: it spans the middle of the stage, which the key pairs reach only on a narrow one
      const hintText = { ...hint, x: (s.w - 265) / 2, w: 265 };
      for (const k of ['pickLeft', 'pickRight'] as const) expect(overlapArea(r[k], hintText), `${s.name} ${k}`).toBe(0);
    });
  }
});
