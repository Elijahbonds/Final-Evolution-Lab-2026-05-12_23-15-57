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
// SCREEN-FIXES-2: `[;"]` — while loading the slot also carries its max-height (the learn card scrolls inside it), after the min
const slotOf = (html: string) => html.match(/<div data-splash-slot="(loading|ready)"[^>]*style="min-height:(\d+)px[;"]/);

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
  // SCREEN-FIXES-2 (2026-11-11): a learn card taller than the room under the bar (a quiz, 225 px) grew the slot while loading
  // and pushed the CONTROLS panel and the pickers down, then let them back at READY: 0.081 on skateboard's card alone
  // (splash-cls.mts). While loading the slot is now at most its height, and the card scrolls inside it.
  it('while loading the slot is no taller than its reserved height, and the learn card scrolls inside it', () => {
    expect(card('loading')).toMatch(new RegExp(`data-splash-slot="loading"[^>]*style="min-height:${SPLASH_SLOT_MIN_PX}px;max-height:${SPLASH_SLOT_MIN_PX}px"`));
    expect(card('ready')).not.toMatch(/data-splash-slot="ready"[^>]*max-height/);   // START and its lines are never cut
    const src = readFileSync(join(__dirname, 'boot-splash.tsx'), 'utf8');
    const learn = src.match(/<LearnWhileYouWait compact className="([^"]*)"/)?.[1] ?? '';
    for (const c of ['min-h-0', 'shrink', 'overflow-y-auto']) expect(learn.split(/\s+/), c).toContain(c);
  });
  it('the slot holds a whole lesson or fact card: the bar and its gaps (52 px) + the tallest (185 px), measured', () => {
    expect(SPLASH_SLOT_MIN_PX).toBeGreaterThanOrEqual(52 + 185);
  });
  it('sideways the learn card is as it was (the CONTROLS panel gives up height, not the card)', () => {
    const css = readFileSync(join(__dirname, '../../app/game-surface.css'), 'utf8');
    expect(css).toMatch(/\[data-fel-console\] \[data-splash-slot\] > \[data-learn-idle\] \{ min-height: auto !important; overflow: visible !important; \}/);
  });
});
