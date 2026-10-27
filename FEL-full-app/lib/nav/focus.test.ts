// The menus' pad and remote focus (A11-02): the decisions, without a browser. The rig run (scripts/a11y/pad-run.mts)
// drives the real shelf with a pad and nothing else.
import { describe, expect, it } from 'vitest';
import { menuFocusPaused, menuFocusTarget, menuKeyIntent, ownsArrows, OWNS_INPUT } from './focus';
import { spatialNext } from '@/components/games/end-screen/nav';

describe('keys', () => {
  it('arrows move, a remote back key goes back, everything else is the page\'s', () => {
    expect(menuKeyIntent({ key: 'ArrowDown' })).toBe('down');
    expect(menuKeyIntent({ key: 'ArrowLeft' })).toBe('left');
    expect(menuKeyIntent({ key: 'GoBack' })).toBe('back');
    expect(menuKeyIntent({ key: 'Unidentified', keyCode: 461 })).toBe('back');     // LG webOS remote
    expect(menuKeyIntent({ key: 'Unidentified', keyCode: 10009 })).toBe('back');   // Tizen remote
    for (const key of ['Tab', 'Enter', ' ', 'Escape', 'Backspace', 'w', 'a']) expect(menuKeyIntent({ key }), key).toBeNull();
  });

  it('never a synthetic key (GameShell\'s pad bridge), a handled one, or a chord', () => {
    expect(menuKeyIntent({ key: 'ArrowDown', isTrusted: false })).toBeNull();
    expect(menuKeyIntent({ key: 'ArrowDown', defaultPrevented: true })).toBeNull();
    expect(menuKeyIntent({ key: 'ArrowDown', shiftKey: true })).toBeNull();
    expect(menuKeyIntent({ key: 'ArrowLeft', altKey: true })).toBeNull();   // the browser's own back
  });

  it('a text field or an arrow widget keeps its arrows', () => {
    const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, closest: () => null, ...extra });
    expect(ownsArrows(el('INPUT', { type: 'text' }))).toBe(true);
    expect(ownsArrows(el('INPUT', { type: 'email' }))).toBe(true);
    expect(ownsArrows(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(ownsArrows(el('TEXTAREA'))).toBe(true);
    expect(ownsArrows(el('SELECT'))).toBe(true);
    expect(ownsArrows(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(ownsArrows(el('A'))).toBe(false);
    expect(ownsArrows(el('BUTTON', { closest: (s: string) => (s.includes('slider') ? {} : null) }))).toBe(true);
    expect(ownsArrows(null)).toBe(false);
  });
});

describe('it stands aside', () => {
  const base = { pathname: '/play', ownedInput: false, hidden: false, holds: 0 };
  it('runs on the menus', () => {
    for (const pathname of ['/play', '/train', '/profile', '/login', '/account', '/education/playbook']) {
      expect(menuFocusPaused({ ...base, pathname }), pathname).toBe(false);
    }
  });
  it('pauses on a running mode, where the game owns input', () => {
    for (const pathname of ['/play/onevone', '/play/party', '/dev/x', '/story/boss']) expect(menuFocusPaused({ ...base, pathname }), pathname).toBe(true);
  });
  it('pauses for the learn feed, the end card or anything marked data-own-input, when hidden, and while held', () => {
    expect(OWNS_INPUT).toContain('[data-learn-root]');
    expect(OWNS_INPUT).toContain('[data-end-screen]');
    expect(OWNS_INPUT).toContain('[data-own-input]');
    expect(menuFocusPaused({ ...base, ownedInput: true })).toBe(true);
    expect(menuFocusPaused({ ...base, hidden: true })).toBe(true);
    expect(menuFocusPaused({ ...base, holds: 1 })).toBe(true);
  });
});

describe('where focus goes', () => {
  // the Play tab at a phone width: three header buttons, then two shelf rows
  const rects = [
    { left: 20, top: 190, width: 200, height: 50 },   // 0 Prove It
    { left: 20, top: 250, width: 186, height: 46 },   // 1 Couch multiplayer
    { left: 214, top: 250, width: 104, height: 46 },  // 2 Versus
    { left: 20, top: 485, width: 350, height: 58 },   // 3 HOOPS
    { left: 20, top: 1020, width: 350, height: 58 },  // 4 COMBAT
  ];
  it('nothing focused yet: the first control in the page\'s main column, not the status rail', () => {
    expect(menuFocusTarget(rects, -1, 'down', 3)).toBe(3);
    expect(menuFocusTarget(rects, -1, 'down')).toBe(0);
    expect(menuFocusTarget([], -1, 'down')).toBe(-1);
  });
  it('is the end card\'s spatialNext: the same geometry on every console screen', () => {
    for (const [from, dir] of [[0, 'down'], [1, 'right'], [2, 'left'], [2, 'down'], [3, 'up'], [3, 'down']] as const) {
      expect(menuFocusTarget(rects, from, dir)).toBe(spatialNext(rects, from, dir));
    }
    expect(menuFocusTarget(rects, 1, 'right')).toBe(2);
    expect(menuFocusTarget(rects, 2, 'down')).toBe(3);
    expect(menuFocusTarget(rects, 4, 'down')).toBe(4);   // nothing further: stays put
  });
});
