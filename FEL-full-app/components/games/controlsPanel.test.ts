// The CONTROLS panel as React draws it (controls-screen, console-view lane, 2026-10-06): on the READY card with its
// device chooser, on the pause without one (it sits inside the pause's button), and nowhere while playing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ControlsPanel } from './controls-panel';
import { PausedLayer, PAUSED_HEADLINE } from './paused-layer';
import { SplashCard } from './boot-splash';

const card = (phase: 'ready' | 'loading' | 'playing' | 'paused' | 'countdown', modeId = 'threevthree', controls?: string): string =>
  renderToStaticMarkup(createElement(SplashCard, { modeId, title: 'THREES', phase, onStart: () => {}, onRetry: () => {}, controls }));

describe('ControlsPanel', () => {
  it('READY shows CONTROLS with the chooser, the device\'s rows and the mode\'s lines (no navigator here: the keys)', () => {
    const html = card('ready');
    expect(html).toContain('data-controls-panel="keys"');
    expect(html).toContain('CONTROLS');
    for (const d of ['CONTROLLER', 'KEYBOARD', 'TOUCH']) expect(html).toContain(`>${d}</button>`);
    expect(html).toContain('WASD / ARROWS');
    // test changed (controls-screen-2, owner 2026-10-06: "short and readable"): the 3v3's curated list, not its whole map
    expect(html).toContain('· SHOOT: hold, let go in the green');
    expect(html).not.toContain('UP AND UNDER');
    expect(html.indexOf('TAP TO START')).toBeLessThan(html.indexOf('data-controls-panel'));   // START first, then the controls
    expect(card('loading')).toContain('data-controls-panel');
  });

  it('the old collapsed BUTTONS line is gone from the card', () => {
    expect(card('ready')).not.toMatch(/BUTTONS [▲▼]/);
  });

  it('a host\'s own line shows when the mode writes none (the board / timing hosts)', () => {
    const html = card('ready', 'tennis', 'Aim with stick · A to swing as the ball arrives');
    expect(html).toContain('· Aim with stick');
    expect(html).toContain('· A to swing as the ball arrives');
  });

  it('the pause shows the same panel — spans only (no button inside the pause\'s button), no chooser, no z-index', () => {
    const html = card('paused', 'dunk');
    expect(html.startsWith('<button type="button" class="absolute inset-0 flex items-center justify-center bg-black/60">')).toBe(true);
    expect(html).toContain(PAUSED_HEADLINE);
    expect(html).toContain('data-controls-panel');
    expect(html).toContain('· HOLD to run');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toMatch(/<div/);
    for (const m of html.matchAll(/class="([^"]*)"/g)) expect(m[1]).not.toMatch(/(^|\s)-?z-/);
  });

  it('without a mode the pause is the old screen, and nothing draws while playing', () => {
    const old = renderToStaticMarkup(createElement(PausedLayer, { onResume: () => {} }));
    expect(old).not.toContain('data-controls-panel');
    expect(card('playing')).toBe('');
    expect(card('countdown')).not.toContain('data-controls-panel');
  });

  // controls-screen-2 (2026-10-06): a pad cannot scroll — what the box would cut, the rows and lines step down to fit
  it('the panel fits its box: fitScale sizes the rows and lines, and re-runs when the box changes', () => {
    const src = readFileSync(path.join(__dirname, 'controls-panel.tsx'), 'utf8');
    expect(src).toMatch(/fitScale\(\(s\) => \{ apply\(s\); return cutPx\(panel\) > 1; \}\)/);
    expect(src).toMatch(/new ResizeObserver\(\(\) => fit\(\)\)/);
    for (const hook of ['data-controls-rows', 'data-controls-lines']) {
      expect(src, hook).toMatch(new RegExp(`${hook} className="\\[zoom:var\\(--fel-controls-fit,1\\)\\]`));
    }
    expect(card('ready')).toContain('data-controls-panel');   // and it still renders on the server (no layout effect there)
  });

  it('a mode with nothing to list draws nothing', () => {
    const html = renderToStaticMarkup(createElement(ControlsPanel, { modeId: 'who_scene_it', chooser: false }));
    expect(html).toContain('ANSWER A');
  });
});
