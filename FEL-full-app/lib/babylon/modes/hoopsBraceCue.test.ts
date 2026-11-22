// CO-7 (HOOPS-CONTROLS-OPT 2026-10-20, K3 K4): the brace / posting cue. While L1 / L2 (Q / F) is held, or the post is on, the one
// hint line says what the right stick does NOW — still the Pro Stick (braced) or the shot stick (posted) — in the words of the
// device in hand: a pad, the keyboard, the touch deck. One test per state, per mode, per device. New file; no existing test changed.
import { describe, it, expect } from 'vitest';
import {
  hintFor as hint1v1, hintSwap, hintUrgent, hintDeviceFor, HINT_POSTED, HINT_BRACED, HINT_PAINT,
  type HintState as Hint1v1, type HintDevice,
} from './onevoneRules';
import { hintFor as hint3v3, type HintState as Hint3v3 } from './threevthreeRules';
import { stickMoveFor, dir8Of, type StickGesture, type StickRead } from '../core/StickHandle';
import { KEY_RSTICK } from '../core/InputBus';
import { MODE_VERBS } from '../ui/modeVerbs';

const DEVICES: HintDevice[] = ['pad', 'keys', 'touch'];
const base1: Hint1v1 = { possession: 'mine', loose: false, shooting: false, dunking: false, showtime: false, posting: false, carrying: true, set: false, nearRim: false, paintWarn: false, defPhase: 'over', gathering: false };
const base3: Hint3v3 = { defence: false, board: false, shotUp: false, theirPass: false, gathering: false, paintWarn: false, dunking: false, showtime: false, shooting: false, carrying: true, mateHasBall: false, posting: false, nearRim: false, set: false };
const OLD_POST = 'POST: SQUARE HOOK · STICK OFF THE RIM + SQUARE FADE · SWING THE STICK = SPIN';
const MODES = [
  { name: '1v1', posted: (d?: HintDevice) => hint1v1({ ...base1, posting: true, brace: true, device: d }), braced: (d?: HintDevice, x: Partial<Hint1v1> = {}) => hint1v1({ ...base1, brace: true, device: d, ...x }) },
  { name: '3v3', posted: (d?: HintDevice) => hint3v3({ ...base3, posting: true, brace: true, device: d }), braced: (d?: HintDevice, x: Partial<Hint3v3> = {}) => hint3v3({ ...base3, brace: true, device: d, ...x }) },
];
/** What names the right stick on each device: the pad's RIGHT STICK, the keyboard's right-stick keys, the touch deck's stick label. */
const STICK_NAME: Record<HintDevice, RegExp> = { pad: /RIGHT STICK/, keys: /\bU\b.*\bO\b/, touch: new RegExp(`\\b${MODE_VERBS.onevone.rStick}\\b STICK`) };
const BAD_COPY = /TODO|TBD|FIXME|XXX|LOREM|PLACEHOLDER|\?\?|NINTENDO|SWITCH|JOY-?CON|WII|\bZL\b|\bZR\b/i;

describe('CO-7: the posted line names the shot stick on every device', () => {
  for (const m of MODES) for (const d of DEVICES) {
    it(`${m.name} · ${d}`, () => {
      const l = m.posted(d);
      expect(l).toBe(HINT_POSTED[d]);
      expect(l).toMatch(/^POSTED: /);
      expect(l).toMatch(/SHOT STICK/);
      expect(l).toMatch(STICK_NAME[d]);
      expect(l).toMatch(/HOOK/);
      expect(l).not.toMatch(/PRO STICK/);
      expect(l.length, l).toBeLessThan(90);
      expect(l).not.toMatch(BAD_COPY);
    });
  }
});

describe('CO-7: the braced line names the Pro Stick on every device', () => {
  for (const m of MODES) for (const d of DEVICES) {
    it(`${m.name} · ${d}`, () => {
      for (const x of [{}, { set: true }, { nearRim: true }]) {   // the brace outranks the calm offence lines
        const l = m.braced(d, x);
        expect(l).toBe(HINT_BRACED[d]);
        expect(l).toMatch(/PRO STICK/);
        expect(l).toMatch(/SAME DRIBBLE MOVES/);
        expect(l).toMatch(STICK_NAME[d]);
        expect(l).not.toMatch(/SHOT STICK/);
        expect(l.length, l).toBeLessThan(90);
        expect(l).not.toMatch(BAD_COPY);
      }
    });
  }
  it('the pad line names the pad doors, the keyboard line the keys (K2: L1 / L2 / Q / F are the brace)', () => {
    expect(HINT_BRACED.pad).toMatch(/L1 \/ L2/);
    expect(HINT_BRACED.keys).toMatch(/Q \/ F/);
    expect(HINT_BRACED.touch).not.toMatch(/L1|L2|\bQ\b|\bF\b/);   // the touch deck has no brace button on this build: name none
  });
});

describe('CO-7: what the lines claim is what the code does', () => {
  it('the keyboard keys the lines name ARE the right-stick ring, and U / O are up-left / up-right', () => {
    const keys = HINT_BRACED.keys.split(':')[1].split('ARE')[0].trim().toLowerCase().split(/\s+/);
    expect(new Set(keys)).toEqual(new Set(Object.keys(KEY_RSTICK)));
    expect(dir8Of(...KEY_RSTICK.u)).toBe('upleft');
    expect(dir8Of(...KEY_RSTICK.o)).toBe('upright');
    // the post hook's gate (OneVOneMode / ThreeVThreeMode onInput): y < -0.5 and |x| > 0.3 — both keys clear it
    for (const k of ['u', 'o']) { const [x, y] = KEY_RSTICK[k]; expect(y < -0.5 && Math.abs(x) > 0.3, k).toBe(true); }
  });
  it('the touch deck\'s right stick is the one labelled DRIBBLE in both hoops modes', () => {
    expect(MODE_VERBS.onevone.rStick).toBe('DRIBBLE');
    expect(MODE_VERBS.threevthree.rStick).toBe('DRIBBLE');
  });
  it('braced, the stick throws the SAME moves: stickMoveFor gives the same pick with and without the brace', () => {
    const flicks: StickGesture[] = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const x = Math.cos(a), y = Math.sin(a); flicks.push({ kind: 'flick', x, y, dir8: dir8Of(x, y) } as StickGesture); }
    const gestures: StickGesture[] = [...flicks, { kind: 'sweep', sign: 1 } as StickGesture, { kind: 'sweep', sign: -1 } as StickGesture, { kind: 'hold' } as StickGesture];
    for (const g of gestures) for (const hand of ['Left', 'Right'] as const) for (const escape of [false, true]) for (const speed01 of [0, 0.5, 1]) {
      const r: StickRead = { speed01, pressured: false, sprint: escape, hand, escape, sinceMoveSec: Infinity };
      expect(stickMoveFor(g, { ...r, brace: true })).toEqual(stickMoveFor(g, { ...r, brace: false }));
    }
  });
});

describe('CO-7: where the cue sits among the other lines', () => {
  for (const m of MODES) {
    it(`${m.name}: posting outranks the brace; the ref and the shot outrank both; no device = the lines as they were`, () => {
      for (const d of DEVICES) {
        expect(m.posted(d)).not.toBe(m.braced(d));
        expect(m.braced(d, { paintWarn: true })).toBe(HINT_PAINT);
        expect(m.braced(d, { shooting: true })).toMatch(/LET GO OF SQUARE/);
      }
      expect(m.posted(undefined)).toBe(OLD_POST);   // a caller that names no device sees the line it always saw
      expect(m.braced(undefined)).toBe(m.name === '1v1' ? hint1v1(base1) : hint3v3(base3));
    });
  }
  it('1v1: the brace line is for the ball handler only — off the ball and on defence the old lines stay', () => {
    for (const d of DEVICES) {
      expect(hint1v1({ ...base1, brace: true, device: d, carrying: false })).toBe(hint1v1({ ...base1, carrying: false }));
      expect(hint1v1({ ...base1, brace: true, device: d, possession: 'defense', defPhase: 'drive' })).toBe(hint1v1({ ...base1, possession: 'defense', defPhase: 'drive' }));
    }
  });
  it('3v3: the brace line is for the ball handler only — off the ball and on defence the old lines stay', () => {
    for (const d of DEVICES) {
      expect(hint3v3({ ...base3, brace: true, device: d, carrying: false, mateHasBall: true })).toBe(hint3v3({ ...base3, carrying: false, mateHasBall: true }));
      expect(hint3v3({ ...base3, brace: true, device: d, defence: true, carrying: false })).toBe(hint3v3({ ...base3, defence: true, carrying: false }));
    }
  });
  it('the cue lines are calm (they wait out the dwell like the triple-threat line) and each one is its own line', () => {
    const all = [...Object.values(HINT_POSTED), ...Object.values(HINT_BRACED)];
    for (const l of all) { expect(hintUrgent(l), l).toBe(false); expect(hintSwap(hint1v1(base1), l, 0.01, false)).toBe(false); }
    const others = [hint1v1(base1), hint1v1({ ...base1, set: true }), hint1v1({ ...base1, nearRim: true }), OLD_POST, hint3v3(base3), hint3v3({ ...base3, set: true })];
    expect(new Set([...all, ...others]).size).toBe(all.length + others.length);
  });
});

describe('CO-7: the device read', () => {
  it('a seated pad is the pad; no pad and a coarse pointer is the touch deck; else the keyboard', () => {
    expect(hintDeviceFor(1, false)).toBe('pad');
    expect(hintDeviceFor(2, true)).toBe('pad');   // a phone with a pad plays on the pad
    expect(hintDeviceFor(0, true)).toBe('touch');
    expect(hintDeviceFor(0, false)).toBe('keys');
  });
});
