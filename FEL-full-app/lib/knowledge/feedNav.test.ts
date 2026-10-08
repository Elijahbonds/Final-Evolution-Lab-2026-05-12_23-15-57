import { describe, expect, it } from 'vitest';
import {
  freshTracker, keyAction, moveFocus, PAD_IDLE, padActions, padStateFrom, REPEAT_DELAY_MS, REPEAT_EVERY_MS, stepIndex,
  type PadState,
} from './feedNav';
import { optionOrder, shareText } from './quiz';
import { CARDS } from './catalog';
import type { QuizCard } from './types';

describe('keyboard', () => {
  it('maps arrows, vim keys, space and page keys to next/prev', () => {
    for (const k of ['ArrowDown', 'PageDown', 'j', ' ']) expect(keyAction(k)).toBe('next');
    for (const k of ['ArrowUp', 'PageUp', 'k']) expect(keyAction(k)).toBe('prev');
    expect(keyAction(' ', true)).toBe('prev');
  });

  it('maps answers, focus, select, like and save', () => {
    expect(keyAction('1')).toEqual({ pick: 0 });
    expect(keyAction('4')).toEqual({ pick: 3 });
    expect(keyAction('ArrowLeft')).toBe('left');
    expect(keyAction('ArrowRight')).toBe('right');
    expect(keyAction('Enter')).toBe('select');
    expect(keyAction('l')).toBe('like');
    expect(keyAction('S')).toBe('save');
    expect(keyAction('x')).toBeNull();
    expect(keyAction('5')).toBeNull();
  });
});

describe('stepIndex', () => {
  it('moves one card per press and clamps at both ends', () => {
    expect(stepIndex(0, 'next', 5)).toBe(1);
    expect(stepIndex(4, 'next', 5)).toBe(4);
    expect(stepIndex(0, 'prev', 5)).toBe(0);
    expect(stepIndex(3, 'prev', 5)).toBe(2);
    expect(stepIndex(3, 'first', 5)).toBe(0);
    expect(stepIndex(1, 'last', 5)).toBe(4);
    expect(stepIndex(2, 'like', 5)).toBe(2);
    expect(stepIndex(9, 'next', 0)).toBe(0);
  });
});

describe('moveFocus', () => {
  it('starts at an end and wraps', () => {
    expect(moveFocus(null, 'right', 4)).toBe(0);
    expect(moveFocus(null, 'left', 4)).toBe(3);
    expect(moveFocus(3, 'right', 4)).toBe(0);
    expect(moveFocus(0, 'left', 4)).toBe(3);
    expect(moveFocus(1, 'right', 0)).toBeNull();
  });
});

describe('gamepad', () => {
  const press = (p: Partial<PadState>): PadState => ({ ...PAD_IDLE, ...p });

  it('reads the canonical pad: d-pad or stick past half-way', () => {
    const base = { dpad: { up: false, down: false, left: false, right: false }, lx: 0, ly: 0, buttons: { A: false, B: false, X: false, Y: false } };
    expect(padStateFrom({ ...base, ly: 0.8 }).down).toBe(true);
    expect(padStateFrom({ ...base, ly: 0.3 }).down).toBe(false);
    expect(padStateFrom({ ...base, dpad: { ...base.dpad, up: true } }).up).toBe(true);
    expect(padStateFrom({ ...base, lx: -0.9 }).left).toBe(true);
    expect(padStateFrom({ ...base, buttons: { ...base.buttons, A: true } }).a).toBe(true);
  });

  it('fires once per press, on the way down', () => {
    let t = freshTracker();
    let r = padActions(t, press({ down: true }), 0);
    expect(r.actions).toEqual(['next']);
    t = r.tracker;
    r = padActions(t, press({ down: true }), 16);
    expect(r.actions).toEqual([]);
    r = padActions(r.tracker, PAD_IDLE, 32);
    r = padActions(r.tracker, press({ down: true }), 48);
    expect(r.actions).toEqual(['next']);
  });

  it('repeats a held up/down after the delay, then at the repeat rate', () => {
    let t = freshTracker();
    const fired: number[] = [];
    for (let ms = 0; ms <= REPEAT_DELAY_MS + 3 * REPEAT_EVERY_MS + 5; ms += 5) {
      const r = padActions(t, press({ up: true }), ms);
      if (r.actions.includes('prev')) fired.push(ms);
      t = r.tracker;
    }
    expect(fired[0]).toBe(0);
    expect(fired[1]).toBe(REPEAT_DELAY_MS);
    expect(fired[2] - fired[1]).toBe(REPEAT_EVERY_MS);
    expect(fired.length).toBe(5);
  });

  it('maps the faces: A select, B back, X like, Y save; left/right move the focus', () => {
    const r = padActions(freshTracker(), press({ a: true, b: true, x: true, y: true, left: true }), 0);
    expect(r.actions.sort()).toEqual(['back', 'left', 'like', 'save', 'select'].sort());
    const held = padActions(r.tracker, press({ a: true, b: true, x: true, y: true, left: true }), 600);
    expect(held.actions).toEqual([]);   // faces and left/right never auto-repeat
  });
});

describe('quiz presentation', () => {
  const quizzes = CARDS.filter((c): c is QuizCard => c.type === 'quiz');

  it('shows every option exactly once, the same order every time', () => {
    for (const q of quizzes) {
      const o = optionOrder(q);
      expect([...o].sort()).toEqual(q.options.map((_, i) => i));
      expect(optionOrder(q)).toEqual(o);
    }
  });

  it('moves the right answer around the screen across the catalogue', () => {
    const slots = new Set(quizzes.map((q) => optionOrder(q).indexOf(q.answer)));
    expect(slots.size).toBeGreaterThanOrEqual(3);
    // shuffled, not the authored order: most answers leave the slot the author typed them in
    const stayed = quizzes.filter((q) => optionOrder(q).indexOf(q.answer) === q.answer).length;
    expect(stayed / quizzes.length).toBeLessThan(0.6);
  });

  it('shares as plain text with no link or handle', () => {
    for (const c of CARDS.slice(0, 40)) {
      const t = shareText(c);
      expect(t).not.toMatch(/https?:|@\w/);
      expect(t).toMatch(/Final Evolution Lab/);
    }
    const q = quizzes[0];
    expect(shareText(q)).toContain(q.options[q.answer]);
  });
});
