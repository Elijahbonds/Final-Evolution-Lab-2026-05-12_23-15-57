// dock-sideways (2026-11-19): on a phone held sideways the shell's bottom dock drew two controls under the 44 px tap rule — the capture
// menu's ⋯ (scaled to 0.77: 33.9 px square) and the icon-only BODY (38 px wide). Measured in play by
// scripts/probes/hoops-followups/inplay.mts (it hit-tests the tap area). Each is drawn as before and gets an invisible box that takes taps
// across at least 44 px; and the ⋯ bar's padding, which covered the left 6 px of Pause beside it, passes taps through. These fail on
// the old dock.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BodyControl, COMPACT_TAP } from './body-control';

const unesc = (m: string) => m.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const css = readFileSync(path.resolve(__dirname, '../../app/game-surface.css'), 'utf8');

describe('the sideways dock: every control takes taps across 44 px', () => {
  it('the compact BODY (38 px drawn) carries a box 4 px past each side of its padding box, into the dock 6 px gaps: 44 px', () => {
    const compact = unesc(renderToStaticMarkup(h(BodyControl, { compact: true })));
    const cls = /<button[^>]*class="([^"]*)"/.exec(compact)?.[1] ?? '';
    for (const c of COMPACT_TAP.split(' ')) expect(cls).toContain(c);
    // a ::before sits in the padding box: 38 - 2 (border) + 2 x 4 = 44; 3 px past the border each side, half the 6 px gap (gap-1.5),
    // so neighbours never share a pixel
    expect(COMPACT_TAP).toContain('before:-inset-x-[4px]');
    expect(cls).toMatch(/px-2\.5/);                            // drawn as before
    // the header's full BODY button (it has its label, and is wide) is untouched
    const full = /<button[^>]*class="([^"]*)"/.exec(renderToStaticMarkup(h(BodyControl, {})))?.[1] ?? '';
    expect(full).not.toContain('before:');
    expect(full).toContain('sm:px-3');
  });

  it('the sideways ⋯ (scaled 0.77, 44 px before the scale) carries a box 16 px up and left: 45.4 px as drawn', () => {
    const land = css.slice(css.indexOf('@media (orientation: landscape) and (max-height: 520px)'));
    const rule = /\[data-capture-ui\] \[data-testid="capture-overflow"\]::before \{([^}]*)\}/.exec(land);
    expect(rule, 'the ::before tap box on the sideways ⋯').not.toBeNull();
    const px = (k: string) => Number(new RegExp(`${k}:\\s*(-?\\d+)(px)?;`).exec(rule![1])?.[1]);
    expect(rule![1]).toMatch(/content:\s*''/);
    const scale = Number(/transform:\s*scale\(([\d.]+)\)/.exec(land)?.[1]);
    expect(scale).toBe(0.77);
    // the button is 44 px border-box with a 1 px border; the box reaches from its inner edge, so the union is 44 + 16 - 1 = 59
    expect((44 - px('top') - 1) * scale).toBeGreaterThanOrEqual(44);
    expect((44 - px('left') - 1) * scale).toBeGreaterThanOrEqual(44);
    expect(px('right')).toBe(0); expect(px('bottom')).toBe(0);   // never towards the shell's buttons on its right, or below
  });

  it('the ⋯ bar padding passes taps to the Pause button beside it (it took the left 6 px of Pause, measured by hit test)', () => {
    const land = css.slice(css.indexOf('@media (orientation: landscape) and (max-height: 520px)'));
    expect(land).toMatch(/> \[data-capture-ui\],\s*\n\s*\[data-fel-console\][^{]*> \[data-capture-ui\] > div \{\s*pointer-events: none !important;/);
    expect(land).toMatch(/> \[data-capture-ui\] > div > \* \{\s*pointer-events: auto;/);   // the ⋯, the light, the menu, Show controls
  });
});
