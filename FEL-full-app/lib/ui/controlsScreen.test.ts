// The CONTROLS screen's pure half (controls-screen, 2026-10-06): the strip the harness applies, the device lists, the
// line split, and which list opens first.
import { describe, expect, it } from 'vitest';
import { FIT_MIN, controlLines, controlRows, controlsSheet, fitScale, moveLines, pickDevice, splitHint } from './controlsScreen';
import { STATIC_CONTROLS, isStaticControlsHint, staticControlsFor, stripStaticControls } from '../babylon/ui/staticControls';
import { KART_PAD_HINT, KART_PAD_START_HINT } from '../babylon/modes/rideHud';

const row = (rows: { input: string; action: string }[], action: string) => rows.find((r) => r.action === action)?.input;

describe('stripStaticControls — what the harness hands the host', () => {
  it('a static map reaches the host blank (so it also clears a live prompt the host is still showing)', () => {
    const big = STATIC_CONTROLS.find((s) => s.mode === 'threevthree')!.text;
    expect(stripStaticControls({ hint: big, score: 3 })).toEqual({ hint: '', score: 3 });
    expect(stripStaticControls({ hint: KART_PAD_HINT })).toEqual({ hint: '' });
  });

  it('a live prompt, an empty hint and an update without one pass untouched (the same object)', () => {
    for (const u of [{ hint: 'NOW!' }, { hint: 'DEFEND — stay tight · time a jump (A) at the release to BLOCK' }, { hint: KART_PAD_START_HINT }, { hint: '' }, { score: 1 }]) {
      expect(stripStaticControls(u)).toBe(u);
    }
    expect(isStaticControlsHint(undefined)).toBe(false);
    expect(isStaticControlsHint(42)).toBe(false);
  });

  it('a mode\'s lines for the screen: the pad words, the body\'s while the body plays, never a repeat', () => {
    expect(staticControlsFor('velocitykart')).toEqual([KART_PAD_HINT]);
    expect(staticControlsFor('velocitykart', true)[0]).toMatch(/^Grip the wheel/);
    expect(staticControlsFor('dunk', true)).toEqual(['HOLD to run · tap JUMP at the line — then SLAM on NOW!']);   // no body words: the pad's
    expect(staticControlsFor('threevthree')).toHaveLength(1);    // "Work the court" is a repeat of the map
    expect(staticControlsFor('nope')).toEqual([]);
  });
});

describe('splitHint — a hint string as lines', () => {
  it('splits at its dots, trims, collapses runs of spaces and drops empties', () => {
    expect(splitHint('HOLD to run · tap JUMP at the line — then SLAM on NOW!')).toEqual(['HOLD to run', 'tap JUMP at the line — then SLAM on NOW!']);
    expect(splitHint('P1: A · B   ·   P2: ▲ ▶ ·  · ')).toEqual(['P1: A', 'B', 'P2: ▲ ▶']);
    expect(splitHint('Alternate D-PAD ←/→ in rhythm.')).toEqual(['Alternate D-PAD ←/→ in rhythm.']);
    expect(splitHint('')).toEqual([]);
  });

  it('never inside brackets: the 3v3 post-up list is one line', () => {
    const lines = splitHint(STATIC_CONTROLS.find((s) => s.mode === 'threevthree')!.text);
    const post = lines.find((l) => l.startsWith('L2 (F): POST UP'))!;
    expect(post).toMatch(/\(L2\/L1 · shoot = HOOK · .* UP AND UNDER\)$/);
    expect(lines).toHaveLength(7);
    expect(lines.at(-1)).toBe('snap the stick to break ankles');
  });
});

describe('controlRows — the list for the device in use', () => {
  it('a held right trigger is R2 on a pad and SPACE on the keys (not the touch slot\'s letter)', () => {
    expect(row(controlRows('dunk', 'pad'), 'RUN')).toBe('HOLD R2');
    expect(row(controlRows('dunk', 'keys'), 'RUN')).toBe('HOLD SPACE');
    expect(row(controlRows('dunk', 'touch'), 'RUN')).toBe('HOLD');
    expect(row(controlRows('dunk', 'pad'), 'SLAM')).toBe('A');
    expect(row(controlRows('dunk', 'keys'), 'SLAM')).toBe('J');
    expect(row(controlRows('dunk', 'keys'), 'STYLE')).toBe('K');
    expect(row(controlRows('dunk', 'touch'), 'SLAM')).toBe('TAP');
  });

  it('the stick, the look, the pause: in each device\'s words, and only where the device has them', () => {
    expect(controlRows('dunk', 'pad')[0]).toEqual({ input: 'L-STICK', action: 'MOVE' });
    expect(controlRows('dunk', 'keys')[0]).toEqual({ input: 'WASD / ARROWS', action: 'MOVE' });
    expect(controlRows('velocitykart', 'touch')[0]).toEqual({ input: 'LEFT PAD', action: 'STEER' });
    expect(row(controlRows('dunk', 'pad'), 'LOOK')).toBe('R-STICK');
    expect(row(controlRows('dunk', 'touch'), 'LOOK')).toBe('RIGHT PAD');
    expect(row(controlRows('dunk', 'keys'), 'LOOK')).toBeUndefined();   // no right stick on a keyboard
    expect(row(controlRows('dunk', 'pad'), 'PAUSE')).toBe('START');
    expect(row(controlRows('dunk', 'keys'), 'PAUSE')).toBe('ESC');
    expect(row(controlRows('dunk', 'touch'), 'PAUSE')).toBeUndefined();
    expect(controlRows('who_scene_it', 'pad').some((r) => r.action === 'MOVE')).toBe(false);   // a quiz has no stick
  });

  it('boost, the board tricks and the strides, translated per device', () => {
    expect(row(controlRows('velocitykart', 'pad'), 'BOOST')).toBe('HOLD RB');
    expect(row(controlRows('velocitykart', 'keys'), 'BOOST')).toBe('HOLD SHIFT');
    expect(row(controlRows('velocitykart', 'touch'), 'BOOST')).toBe('HOLD BOOST');
    // test changed (controls-screen-2, owner 2026-10-06: the lists must fit without scrolling): the board's trick table
    // is one line per button below the rows (moveLines), not a row per trick — still in each device's words
    expect(controlRows('snowboard', 'pad').some((r) => /^. \+ [ABXY]$/.test(r.input))).toBe(false);
    expect(row(controlRows('snowboard', 'pad'), 'BOARDSLIDE')).toBeUndefined();
    expect(moveLines('snowboard', 'pad')).toEqual(['B: ↑INDY ←METHOD →STALEFISH ↓TAIL GRAB', 'Y: →720 ←CORK 720 ↓RODEO 540 · X: BOARDSLIDE']);
    for (const d of ['pad', 'keys', 'touch'] as const) for (const l of moveLines('snowboard', d)) expect(l.length, l).toBeLessThanOrEqual(52);
    expect(moveLines('surf', 'pad')[0]).toBe('B: BOTTOM TURN · ←CUTBACK ↑SNAP →FLOATER ↓TUBE RIDE');
    expect(moveLines('snowboard', 'keys')[0]).toBe(moveLines('snowboard', 'pad')[0].replace(/^B:/, 'K:'));
    expect(moveLines('snowboard', 'touch')[0]).toMatch(/^SPIN: ↑INDY/);
    expect(moveLines('surf', 'pad')).toHaveLength(2);
    expect(moveLines('dunk', 'pad')).toEqual([]);
    expect(row(controlRows('sprint', 'keys'), 'ALTERNATE STRIDES')).toBe('ARROWS ← →');
    expect(row(controlRows('skateboard', 'keys'), 'FLIP TRICK')).toBeUndefined();     // the R-stick flick has no key
    expect(row(controlRows('skateboard', 'touch'), 'FLIP TRICK')).toBe('RIGHT PAD FLICK');
  });

  it('a quiz\'s letter buttons read as answers', () => {
    expect(row(controlRows('who-scene-it', 'pad'), 'ANSWER C')).toBe('X');
    expect(row(controlRows('brainbrawl', 'keys'), 'ANSWER D')).toBe('I');
  });

  it('every enabled mode has a list on every device', async () => {
    const { ENABLED_BABYLON_MODES } = await import('../babylon/modes/registry');
    for (const m of ENABLED_BABYLON_MODES) for (const d of ['pad', 'keys', 'touch'] as const) {
      expect(controlRows(m, d).length, `${m} ${d}`).toBeGreaterThan(0);
    }
  });
});

describe('controlLines / controlsSheet — the mode\'s own words', () => {
  it('its static hint, split; else the host\'s line; repeats across lines drop', () => {
    expect(controlLines('dunk')).toEqual(['HOLD to run', 'tap JUMP at the line — then SLAM on NOW!']);
    expect(controlLines('tennis', { fallback: 'Aim with stick · A to swing as the ball arrives' })).toEqual(['Aim with stick', 'A to swing as the ball arrives']);
    expect(controlLines('golf', { fallback: 'ignored' })[0]).toMatch(/^L-STICK turns the ARROW/);   // the mode's own words win
    // test changed (controls-screen-2): who-scene-it's lines are now its curated list (its split hint came apart into
    // 'A', 'B', 'X', 'Y pick the answer …'); the repeat-drop is held on a host line instead
    expect(controlLines('tennis', { fallback: 'A · B · A' })).toEqual(['A', 'B']);
    expect(controlLines('tennis')).toEqual([]);
  });

  it('the sheet is the device\'s rows and the lines', () => {
    const s = controlsSheet('karate-vs', 'keys');
    expect(s.device).toBe('keys');
    expect(s.rows.length).toBeGreaterThan(3);
    expect(s.lines).toContain('tap BLOCK at the last instant to parry');
  });
});

describe('pickDevice — which list opens first', () => {
  it('a connected pad, else touch, else the keys', () => {
    expect(pickDevice({ pads: 1, touch: true })).toBe('pad');
    expect(pickDevice({ pads: 0, touch: true })).toBe('touch');
    expect(pickDevice({ pads: 0, touch: false })).toBe('keys');
  });
});

// controls-screen-2 (console-view lane, 2026-10-06). Owner: "Yes to both proposed fixes for texts and impeding gameplay
// view" — the lists short, and whole on the screen for a pad that cannot scroll.
describe('the panel fits its box', () => {
  it('fitScale: the full size when nothing is cut; else the largest step that shows it all; never under FIT_MIN', () => {
    const tried: number[] = [];
    expect(fitScale((s) => { tried.push(s); return false; })).toBe(1);
    expect(tried).toEqual([1]);                                   // a list that fits is measured once, at full size
    expect(fitScale((s) => s > 0.9)).toBe(0.9);                   // cut at 1 and 0.95, whole at 0.9
    expect(fitScale(() => true)).toBe(FIT_MIN);                   // never smaller than the floor, even when still cut
    expect(FIT_MIN).toBeGreaterThanOrEqual(0.85);                 // 10 px lines stay 8.5 px or more
    const steps: number[] = [];
    fitScale((s) => { steps.push(s); return true; });
    expect(steps).toEqual([1, 0.95, 0.9]);                        // in 0.05 steps, no float drift
  });

  it('the sheet: the device\'s rows, then the trick lines, then the mode\'s own lines', () => {
    const s = controlsSheet('surf', 'pad');
    expect(s.lines.slice(0, 2)).toEqual(moveLines('surf', 'pad'));
    expect(s.lines.slice(2)).toEqual(controlLines('surf'));
    expect(controlsSheet('dunk', 'keys').lines).toEqual(controlLines('dunk'));
  });

  it('a body player\'s list keeps its own words; the curated pad list never replaces them', () => {
    expect(controlLines('velocitykart', { body: true })[0]).toMatch(/^Grip the wheel/);
    expect(controlLines('velocitykart', { body: true })).toContain('BOOST: DRIFTS FILL IT · RB ON PAD / TOUCH');
    expect(controlLines('velocitykart')[0]).toMatch(/^X drift to fill BOOST/);
    expect(controlLines('threevthree', { body: true })).toEqual(controlLines('threevthree'));   // no body words: the pad's
  });
});
