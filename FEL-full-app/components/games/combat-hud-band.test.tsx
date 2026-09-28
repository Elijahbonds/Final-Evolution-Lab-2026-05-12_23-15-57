// QA P1-09 (2026-09-27): "red banners clip the HUD in Storm Duel, Ring's Edge and Showdown". The banner line and the edge
// warning were placed at fixed fractions of the stage (top-1/3, top-22%) over a HUD whose stacked chips reach past both on a
// short stage, and the JuiceKit overlay (z-index 30) painted over a HUD with no z-index. No DOM here, so the geometry is
// held by structure: the banner line is a flow sibling AFTER the HUD row in one band (it cannot intersect it at any size),
// and the band stacks above the juice overlay and below the splash.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CombatHudBand, COMBAT_HUD_Z } from './combat-hud-band';

const read = (f: string) => readFileSync(path.resolve(__dirname, '../..', f), 'utf8');

describe('the combat HUD band', () => {
  const hudRow = createElement('div', { 'data-row': 'hud' }, createElement('span', null, 'HP 100'), createElement('span', null, 'FOE HP 100'));

  it('the banner and the warning render after the HUD row, inside the same band', () => {
    const m = renderToStaticMarkup(createElement(CombatHudBand, { banner: 'GUARD BREAK!', alert: createElement('span', null, '⚠ EDGE BEHIND YOU ⚠') }, hudRow));
    const band = m.indexOf('data-hud-band'), row = m.indexOf('data-row="hud"'), line = m.indexOf('data-banner-band');
    expect(band).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(band);
    expect(line).toBeGreaterThan(row);
    expect(m.indexOf('EDGE BEHIND YOU')).toBeGreaterThan(line);
    expect(m.indexOf('GUARD BREAK!')).toBeGreaterThan(m.indexOf('EDGE BEHIND YOU'));
    expect(m).not.toMatch(/top-1\/3|top-\[22%\]/);
  });

  it('no banner, no text in the line', () => {
    const m = renderToStaticMarkup(createElement(CombatHudBand, { banner: '' }, hudRow));
    expect(m).toMatch(/data-banner-band[^>]*><\/div>/);
  });

  it('stacks above the juice overlay and below the READY / PAUSED splash', () => {
    const juiceZ = Number(/position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:(\d+)/.exec(read('lib/babylon/premium/JuiceKit.ts'))?.[1]);
    expect(juiceZ).toBe(30);
    expect(COMBAT_HUD_Z).toBeGreaterThan(juiceZ);
    expect(read('components/games/boot-splash.tsx')).toContain('absolute inset-0 z-40');
    expect(COMBAT_HUD_Z).toBeLessThan(40);
  });

  it.each(['karate-vs-babylon.tsx', 'mixedcombat-babylon.tsx', 'showdown-babylon.tsx'])('%s draws its HUD and banner through the band', (f) => {
    const src = read(`components/games/${f}`);
    expect(src).toMatch(/<CombatHudBand banner=\{typeof hud\.banner === 'string' \? hud\.banner : ''\}/);
    expect(src).not.toMatch(/absolute inset-x-0 top-1\/3/);
    expect(src).not.toMatch(/absolute inset-x-0 top-\[22%\]/);
    expect(src).not.toMatch(/pointer-events-none absolute inset-x-0 top-0 flex justify-between/);
  });
});
