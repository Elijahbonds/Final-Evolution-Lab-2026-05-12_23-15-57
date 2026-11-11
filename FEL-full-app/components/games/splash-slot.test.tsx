// SCREEN-FIXES (2026-11-10): the shared start card's layout shift (DUNK-FLAGSHIP §15: 0.21-0.24 on the dunk host; 0.06-0.29
// on the card alone, scripts/probes/screen-fixes/splash-cls.mts). The part of the card that changes while the arena loads
// (the bar and the late learn card, then START and its lines) sits in one slot that holds the same height in both phases, so
// the CONTROLS panel and the pickers under it do not move. Layout only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SPLASH_SLOT_MIN_PX, SplashCard } from './boot-splash';

const card = (phase: 'loading' | 'ready') =>
  renderToStaticMarkup(createElement(SplashCard, { modeId: 'karate', title: 'KARATE', phase, onStart: () => {}, onRetry: () => {} }));
const slotOf = (html: string) => html.match(/<div data-splash-slot="(loading|ready)"[^>]*style="min-height:(\d+)px"/);

describe('the start card holds its middle slot at one height', () => {
  it('loading and READY reserve the same height, from the first frame', () => {
    const load = slotOf(card('loading')), ready = slotOf(card('ready'));
    expect(load?.[1]).toBe('loading');
    expect(ready?.[1]).toBe('ready');
    expect(Number(load?.[2])).toBe(SPLASH_SLOT_MIN_PX);
    expect(Number(ready?.[2])).toBe(SPLASH_SLOT_MIN_PX);
  });
  it('the bar is in the slot while loading, START while ready, and the CONTROLS panel comes after the slot', () => {
    const load = card('loading'), ready = card('ready');
    expect(load.indexOf('data-splash-slot')).toBeLessThan(load.indexOf('LOADING ARENA'));
    expect(ready.indexOf('data-splash-slot')).toBeLessThan(ready.indexOf('TAP TO START'));
    for (const h of [load, ready]) {
      const controls = h.indexOf('data-controls-panel');
      if (controls >= 0) expect(h.indexOf('data-splash-slot')).toBeLessThan(controls);
    }
  });
  it('sideways (console view) the slot steps aside, so the left column is unchanged', () => {
    const css = readFileSync(join(__dirname, '../../app/game-surface.css'), 'utf8');
    expect(css).toMatch(/\[data-fel-console\] \[data-splash-slot\] \{ display: contents !important; \}/);
  });
});
