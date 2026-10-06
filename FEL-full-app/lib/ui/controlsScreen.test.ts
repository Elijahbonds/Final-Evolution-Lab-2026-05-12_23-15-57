// The CONTROLS screen's pure half (controls-screen, 2026-10-06): the strip the harness applies, the device lists, the
// line split, and which list opens first.
import { describe, expect, it } from 'vitest';
import { controlLines, controlRows, controlsSheet, pickDevice, splitHint } from './controlsScreen';
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
    const snowPad = controlRows('snowboard', 'pad'), snowKeys = controlRows('snowboard', 'keys');
    const trick = snowPad.find((r) => /^. \+ B$/.test(r.input))!;
    expect(snowKeys.find((r) => r.action === trick.action)!.input).toBe(trick.input.replace('B', 'K'));
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
    expect(controlLines('who_scene_it').filter((l) => l === 'B')).toHaveLength(1);
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
