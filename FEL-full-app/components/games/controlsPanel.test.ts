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
import { controlsSheet } from '@/lib/ui/controlsScreen';
import { PANEL_MAX_LINES } from '@/lib/babylon/ui/panelLines';
import { stripComments } from '@/lib/testing/sourceScan';

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
    // test changed (HOOPS PAUSE, owner 2026-10-06: "Hoops pause: Controls panel only"): the hoops panel carries the 3v3's whole
    // OFFENSE / DEFENSE list again (the one list on the pause and READY), so its words, and UP AND UNDER, are back.
    // Was: contains the curated '· SHOOT: hold, let go in the green', not 'UP AND UNDER'.
    expect(html).toContain('· SQUARE (L): hold, release in the green');
    expect(html).toContain('UP AND UNDER');
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

// HOOPS PAUSE (2026-10-06). Owner, multiple choice: "Hoops pause: Controls panel only". The 1v1 and 3v3 pause showed TWO
// control lists — the host's full OFFENSE / DEFENSE paragraph along the bottom, and this panel. Now ONE: the panel, with
// both groups in it; the host keeps only its ONE live state line during play.
describe('hoops pause — one controls list, the panel', () => {
  const HOSTS = { onevone: 'basketball-babylon.tsx', threevthree: 'three-v-three-babylon.tsx' } as const;

  it('the 1v1 and 3v3 hosts draw no control list of their own on pause (nor the rules\' CONTROLS_ lists anywhere)', () => {
    for (const [mode, file] of Object.entries(HOSTS)) {
      const code = stripComments(readFileSync(path.join(__dirname, file), 'utf8'));
      expect(code, mode).not.toMatch(/CONTROLS_(OFFENCE|DEFENCE)/);
      expect(code, mode).not.toMatch(/phase === 'paused'/);          // the splash's PausedLayer is the whole pause
      expect(code, mode).not.toMatch(/>(OFFENSE|DEFENSE)</);
      // the ONE live line for the state you are in stays, during play only
      expect(code, mode).toMatch(/typeof hud\.hint === 'string' && hud\.hint && phase === 'playing'/);
      expect(code, mode).toMatch(new RegExp(`<BootSplash\\s+modeId="${mode}"`));
    }
  });

  it('the pause panel carries both groups, OFFENSE then DEFENSE, every line once — and the old bottom list is gone', () => {
    for (const mode of Object.keys(HOSTS) as (keyof typeof HOSTS)[]) {
      const html = card('paused', mode);
      expect(html, mode).toContain(PAUSED_HEADLINE);
      expect(html.match(/data-controls-panel=/g), mode).toHaveLength(1);
      const off = html.indexOf('data-controls-group="OFFENSE"'), def = html.indexOf('data-controls-group="DEFENSE"');
      expect(off, mode).toBeGreaterThan(html.indexOf('data-controls-lines'));
      expect(def, mode).toBeGreaterThan(off);
      for (const g of controlsSheet(mode, 'keys').groups) for (const l of g.lines) {
        const esc = l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        expect(html.split(`· ${esc}</span>`).length - 1, `${mode}: ${l}`).toBe(1);
      }
      expect(html, mode).toMatch(/data-controls-group="DEFENSE"[^>]*>DEFENSE<\/span><span[^>]*>· STAY IN FRONT/);
      expect(html, mode).not.toContain('max-w-3xl');                 // the hosts' bottom list's box
      expect(html.match(/<button/g), mode).toHaveLength(1);            // spans only inside the pause's button
      expect(html, mode).not.toMatch(/<div/);
    }
  });

  it('a long list scrolls inside the panel\'s bounded box rather than spilling off a phone', () => {
    const html = card('paused', 'onevone');
    expect(html).toMatch(/data-controls-panel="keys" class="[^"]*\bflex\b[^"]*\bmin-h-0\b[^"]*\bflex-col\b[^"]*\bmax-h-\[60vh\]/);
    expect(html).toMatch(/data-controls-lines="[^"]*" class="[^"]*\bmin-h-0\b[^"]*\boverflow-y-auto\b/);
    // the 1v1's list is the longest a panel carries: more lines than any curated list's budget, so the scroll is the plan
    expect(controlsSheet('onevone', 'keys').lines.length).toBeGreaterThan(PANEL_MAX_LINES * 2);
    // READY's panel is bounded too (26vh, 38vh from sm) — the same lines box scrolls there
    expect(card('ready', 'onevone')).toMatch(/data-controls-panel="keys" class="[^"]*max-h-\[26vh\][^"]*sm:max-h-\[38vh\]/);
  });
});
