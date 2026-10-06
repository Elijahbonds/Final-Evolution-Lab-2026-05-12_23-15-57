// The CONTROLS panel as React draws it (controls-screen, console-view lane, 2026-10-06): on the READY card with its
// device chooser, on the pause without one (it sits inside the pause's button), and nowhere while playing.
import { describe, it, expect } from 'vitest';
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
    expect(html).toContain('· snap the stick to break ankles');
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

  it('a mode with nothing to list draws nothing', () => {
    const html = renderToStaticMarkup(createElement(ControlsPanel, { modeId: 'who_scene_it', chooser: false }));
    expect(html).toContain('ANSWER A');
  });
});
