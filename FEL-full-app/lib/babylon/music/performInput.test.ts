// MUSIC-SUITE P6 (2026-09-25): PERFORM's four lanes on a keyboard, a pad and a phone (performInput.ts) — and that no lane
// key clashes with the Studio's keys (P4, ui/keys.ts) or the Flip's pad keys (P5, Flip.ts PAD_KEYS).
import { describe, expect, it } from 'vitest';
import {
  PAD_LANE_BUTTONS, PAD_PAUSE_BUTTON, PERFORM_LANE_KEYS, PHONE_LANE_ACTIONS, PHONE_PAUSE_ACTION, isPerformPauseKey,
  padButtonsDown, padLaneEdges, performLaneForKey, performPauseEffect, performPhoneCommand,
} from './performInput';
import { PAD_KEYS } from './Flip';
import { KEY_HELP, studioKeyAction, type KeyContext } from './ui/keys';
import { PERFORM_LANE_COLORS, PERFORM_TAP_KEYS } from './performSet';
import { MODE_CONTROLLERS } from '@/lib/controller-link/schemas/registry';

const allLaneKeys = PERFORM_LANE_KEYS.flat();

describe('the keyboard: H J K L and ← ↓ ↑ →, lane by lane', () => {
  it('each lane has a letter and an arrow, in screen order (KICK · SNARE · HATS · FLIP = ← ↓ ↑ →)', () => {
    expect(PERFORM_LANE_KEYS).toEqual([['h', 'ArrowLeft'], ['j', 'ArrowDown'], ['k', 'ArrowUp'], ['l', 'ArrowRight']]);
    expect(['h', 'J', 'k', 'L', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'].map((key) => performLaneForKey({ key }))).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(performLaneForKey({ key: 'd' })).toBeNull();
    expect(performLaneForKey({ key: ' ' })).toBeNull();
    expect(performLaneForKey({ key: 'j', metaKey: true })).toBeNull();                 // ⌘J is the browser's
    expect(performLaneForKey({ key: 'ArrowLeft', altKey: true })).toBeNull();
  });

  it('Space pauses (it is no longer a tap: a tap with no lane would take any note)', () => {
    expect(isPerformPauseKey({ key: ' ' })).toBe(true);
    expect(isPerformPauseKey({ key: 'Unidentified', code: 'Space' })).toBe(true);
    expect(isPerformPauseKey({ key: ' ', ctrlKey: true })).toBe(false);
    expect(isPerformPauseKey({ key: 'j' })).toBe(false);
  });

  it('NO CLASH: no lane key is a Flip pad key (the plan\'s D F J K would have been — D and F are pads), the booth\'s B or ?', () => {
    for (const k of ['d', 'f']) expect(PAD_KEYS, k).toContain(k);                    // why not D F J K
    for (const k of allLaneKeys) expect(PAD_KEYS, k).not.toContain(k.toLowerCase());
    for (const k of PAD_KEYS) expect(performLaneForKey({ key: k }), k).toBeNull();
    for (const k of allLaneKeys) expect(['b', 'B', '?', ' ', 'Escape', 'Enter']).not.toContain(k);
  });

  it('NO CLASH: in PERFORM the studio key map takes none of the lane keys or Space (they are PERFORM\'s)', () => {
    const perform: KeyContext = { view: 'studio', mode: 'perform', target: 'other' };
    for (const target of ['other', 'grid', 'button'] as const) {
      for (const key of [...allLaneKeys, ' ']) expect(studioKeyAction({ key }, { ...perform, target }), `${key} on ${target}`).toBeNull();
    }
  });

  it('the key map\'s ? panel names the lanes and the pause', () => {
    const perf = KEY_HELP.filter((h) => h.where === 'PERFORM').map((h) => `${h.keys} ${h.does}`).join(' | ');
    expect(perf).toMatch(/H J K L/);
    expect(perf).toMatch(/← ↓ ↑ →/);
    expect(perf).toMatch(/KICK · SNARE · HATS · FLIP/);
    expect(perf).toMatch(/Space/);
    expect(perf).not.toMatch(/Space · J/);                                              // P2's one-lane TAP is gone
    expect(PERFORM_TAP_KEYS).toEqual([' ', 'j']);                                      // (the P2 export stays, unused by the room)
  });
});

describe('the pad: face buttons by where they sit, the D-pad the same way (lefty-safe), START pauses', () => {
  it('X / ← KICK, A / ↓ SNARE, Y / ↑ HATS, B / → FLIP — every lane on both thumbs', () => {
    expect(PAD_LANE_BUTTONS).toEqual([[2, 14], [0, 13], [3, 12], [1, 15]]);
    const face = PAD_LANE_BUTTONS.map((b) => b[0]), dpad = PAD_LANE_BUTTONS.map((b) => b[1]);
    expect(new Set(face)).toEqual(new Set([0, 1, 2, 3]));                              // the four face buttons, once each
    expect(new Set(dpad)).toEqual(new Set([12, 13, 14, 15]));                          // the four D-pad directions, once each
    expect(PAD_PAUSE_BUTTON).toBe(9);
  });

  it('a press is a button going DOWN between polls; a held button is one tap; a face button and its D-pad twin together are one', () => {
    const down = (...i: number[]): boolean[] => Array.from({ length: 17 }, (_, k) => i.includes(k));
    expect(padLaneEdges(down(), down(0))).toEqual({ lanes: [1], pause: false });        // A → SNARE
    expect(padLaneEdges(down(0), down(0))).toEqual({ lanes: [], pause: false });        // held: nothing new
    expect(padLaneEdges(down(), down(14, 2))).toEqual({ lanes: [0], pause: false });    // ← and X together: KICK once
    expect(padLaneEdges(down(), down(12, 1))).toEqual({ lanes: [2, 3], pause: false }); // a chord across hands: HATS + FLIP
    expect(padLaneEdges(down(), down(9))).toEqual({ lanes: [], pause: true });
    expect(padLaneEdges(down(9), down(9))).toEqual({ lanes: [], pause: false });
  });

  it('padButtonsDown reads `pressed`, else a value past half (an analog face button)', () => {
    expect(padButtonsDown([{ pressed: true }, { pressed: false, value: 0.7 }, { value: 0.2 }, {}])).toEqual([true, true, false, false]);
    expect(padButtonsDown(null)).toEqual([]);
  });
});

describe('the phone: music_perform\'s four lanes + PAUSE, and an MPC-paired phone plays by row', () => {
  it('every music_perform action parses — the schema is the room\'s vocabulary', () => {
    const actions = MODE_CONTROLLERS.music_perform.schemas.flatMap((s) => (s.kind === 'button' ? s.buttons.map((b) => b.action) : []));
    expect(actions).toEqual([...PHONE_LANE_ACTIONS, PHONE_PAUSE_ACTION]);
    expect(actions.map((a) => performPhoneCommand({ a }))).toEqual([
      { kind: 'lane', lane: 0 }, { kind: 'lane', lane: 1 }, { kind: 'lane', lane: 2 }, { kind: 'lane', lane: 3 }, { kind: 'pause' },
    ]);
    // the phone's lane colours are the screen's
    const lanes = MODE_CONTROLLERS.music_perform.schemas[0];
    expect(lanes.kind === 'button' ? lanes.buttons.map((b) => b.color) : []).toEqual([...PERFORM_LANE_COLORS]);
  });

  it('a music_flip pad is the lane of its ROW (and the rows are coloured as the lanes are); its transport and banks are not PERFORM\'s', () => {
    expect([0, 3, 4, 7, 8, 11, 12, 15].map((p) => performPhoneCommand({ a: `pad_${p}` }))).toEqual(
      [0, 0, 1, 1, 2, 2, 3, 3].map((lane) => ({ kind: 'lane', lane })));
    const flipPads = MODE_CONTROLLERS.music_flip.schemas.find((s) => s.kind === 'button' && s.buttons.some((b) => b.action === 'pad_0'));
    const rowColors = flipPads && flipPads.kind === 'button' ? [0, 4, 8, 12].map((i) => flipPads.buttons[i].color) : [];
    expect(rowColors).toEqual([...PERFORM_LANE_COLORS]);
    for (const a of ['play', 'stop', 'rec', 'bank_A', 'pad_16', 'lane_4', 'lane_', '', 'PAUSE']) expect(performPhoneCommand({ a }), a).toBeNull();
    expect(performPhoneCommand(null)).toBeNull();
  });
});

describe('PAUSE', () => {
  it('free play: stops a running set and starts a stopped one; an Arena set is never paused (it runs to its end)', () => {
    expect(performPauseEffect({ arena: false, running: true })).toBe('stop');
    expect(performPauseEffect({ arena: false, running: false })).toBe('start');
    expect(performPauseEffect({ arena: true, running: true })).toBe('refused');
    expect(performPauseEffect({ arena: true, running: false })).toBe('refused');
  });
});

// MUSIC-SUITE P6 FIX PASS (2026-09-26): a pad's START / Space begins an Arena attempt that is READY (it said "no pause", and
// START MY ONE ATTEMPT needed a pointer); once it plays there is still no pause.
describe('P6 fix pass: START on a pad begins the Arena attempt', () => {
  it('ready → arena-start; playing → refused; free play unchanged', async () => {
    const { performPauseEffect } = await import('./performInput');
    expect(performPauseEffect({ arena: true, running: false, arenaReady: true })).toBe('arena-start');
    expect(performPauseEffect({ arena: true, running: true, arenaReady: false })).toBe('refused');
    expect(performPauseEffect({ arena: true, running: false })).toBe('refused');
    expect(performPauseEffect({ arena: false, running: true, arenaReady: true })).toBe('stop');
    expect(performPauseEffect({ arena: false, running: false })).toBe('start');
  });
});
