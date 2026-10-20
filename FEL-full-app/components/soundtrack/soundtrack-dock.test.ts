// PHONE-FIRST-SCREEN (owner's picks, 2026-10-17): where the Now Playing chip sits. Floated above the bottom of a phone it
// sat on the page (measured at 393x852: on /play's Prove It card, 5,496 px²; a control on 11 of 27 signed-in pages;
// /signup's "Sign in" and /login's footer links signed out; and on /try's LOOK stick, mid-game). On a phone it is now a
// strip of chrome the page scrolls under: in the tab bar's own glass above the tabs, or alone with the same glass when
// there is no bar (signed out). md+ floats bottom right as before. Game screens, /try included, show no chip at all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';
import { chipHiddenOn, dockMode } from './soundtrack-dock';

const read = (rel: string): string => stripComments(fs.readFileSync(path.resolve(__dirname, rel), 'utf8'));

describe('dockMode', () => {
  it('on a phone: in the tab bar while it is up, else a strip of its own; md+: floating', () => {
    expect(dockMode(true, false)).toBe('strip');
    expect(dockMode(false, false)).toBe('alone');   // no tab bar: signed out
    expect(dockMode(true, true)).toBe('float');     // md+: the tabs are in the rail, the bar is hidden
    expect(dockMode(false, true)).toBe('float');
  });
});

describe('chipHiddenOn: the screens a game owns', () => {
  it('hides on every mode, the shell\'s running-mode screens and the flyer\'s guest dunk', () => {
    for (const p of ['/play/dunk', '/play/onevone', '/story/boss', '/story/rail', '/dev/mode/dunk', '/try']) expect(chipHiddenOn(p), p).toBe(true);
  });

  it('shows everywhere else, signed in or out', () => {
    for (const p of ['/', '/play', '/train', '/profile', '/signup', '/login', '/terms', '/privacy', '/join', '/story', '/tryouts']) expect(chipHiddenOn(p), p).toBe(false);
  });
});

describe('the strip', () => {
  const bar = read('../shell/tab-bar.tsx');
  const dock = read('soundtrack-dock.tsx');

  it('has a slot in the tab bar\'s fixed glass, above the tabs\' nav', () => {
    expect(bar).toMatch(/<div className="fixed inset-x-0 bottom-0 z-50 border-t border-white\/10 bg-\[#050505\]\/90 backdrop-blur-xl md:hidden">\s*<div data-tabbar-strip \/>\s*<nav aria-label="Main">/);
  });

  it('fills that slot through a portal, right-aligned, with the panel opening upward', () => {
    expect(dock).toContain("document.querySelector<HTMLElement>('[data-tabbar-strip]')");
    expect(dock).toContain("if (mode === 'strip' && strip) return createPortal(stripRow('pb-0.5 pt-1.5'), strip);");
    expect(dock).toContain('<div className={`relative flex justify-end px-3 ${pad}`}>');
    expect(dock).toContain('<div className="absolute bottom-full right-3 mb-2 w-[300px] max-w-[calc(100vw-24px)]">{panel}</div>');
    expect(dock).toContain("const WIDE = '(min-width: 768px)';");   // md, the bar's own breakpoint (md:hidden)
  });

  it('alone, wears the bar\'s glass and gives the page the same room at its end', () => {
    expect(dock).toContain('<div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#050505]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">');
    expect(dock).toContain("{stripRow('py-1.5')}");
    // strip height: 1 px border + 6 + the 30 px chip + 6 = 43 px; the room is 44 px, plus the same safe area
    expect(dock).toContain('createPortal(<div aria-hidden data-soundtrack-room className="h-[calc(2.75rem+env(safe-area-inset-bottom))]" />, document.body)');
  });

  it('md+: floats bottom right, where it always sat there (md:bottom-4)', () => {
    expect(dock).toContain('<div className="fixed bottom-4 right-3 z-40 flex max-w-[min(320px,calc(100vw-24px))] flex-col items-end gap-2">');
  });

  it('the dock renders no chip on a game screen', () => {
    expect(dock).toContain('if (quick || chipHiddenOn(pathname)) return null;');
  });
});
