// The shared HUD pieces, rendered (A9.13, lane/tv-hud): what each draws, that empty reads draw nothing, the frame's
// safe-area and end-card behaviour, and that the system imports nothing from scoring, timing or pay.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CONSOLE_FLUSH_CLASS, END_CARD_HANDOFF_CLASS, HudBanner, HudChip, HudFrame, HudLine, HudMeter, HudPips, HudPlate, HudText,
  ScoreCell, Scorebug, hudColor, hudFontSize,
} from '.';

/** The markup, with the HTML escapes in class attributes undone so a class can be matched as written. */
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/&amp;/g, '&').replace(/&gt;/g, '>');

describe('HudFrame (the safe-area wrapper)', () => {
  const m = html(h(HudFrame, null, h('span', { id: 'kid' }, 'HP 100')));

  it('one pointer-transparent layer over the host, children inside, display face', () => {
    expect(m).toMatch(/^<div data-hud-frame="true"/);
    expect(m).toContain('pointer-events-none absolute');
    expect(m).toContain('font-display');
    expect(m.indexOf('id="kid"')).toBeGreaterThan(m.indexOf('data-hud-frame'));
  });

  it('flush with the host in console view (the host box is the 5 % frame already), env() insets off it', () => {
    expect(m).toContain(CONSOLE_FLUSH_CLASS);
    expect(CONSOLE_FLUSH_CLASS).toBe('[[data-fel-console]_&]:!inset-0');
    expect(m).toContain('top:env(safe-area-inset-top, 0px)');
    expect(m).toContain('left:env(safe-area-inset-left, 0px)');
  });

  it('fades out while the end card is up (the card is the stage\'s direct child)', () => {
    expect(m).toContain(END_CARD_HANDOFF_CLASS);
    expect(END_CARD_HANDOFF_CLASS).toBe('[div:has(>[data-end-screen])_&]:opacity-0');
    expect(m).toContain('transition-opacity');
  });

  it('carries the body step as its base size, and no z-index of its own (stacking stays the host\'s)', () => {
    expect(m).toContain(`font-size:${hudFontSize('body')}`);
    expect(m).not.toMatch(/z-index|z-\d/);
  });
});

describe('banner and line', () => {
  it('a banner draws its call in its tone, on a plate', () => {
    const m = html(h(HudBanner, { text: 'GOAL!', tone: 'good' }));
    expect(m).toContain('GOAL!');
    expect(m).toContain('data-hud-call');
    expect(m).toContain(`color:${hudColor('good')}`);
    expect(m).toContain('top-1/3');   // the slot every host used, by default
  });

  it('no call, nothing drawn (a host passes hud.banner as it is)', () => {
    for (const text of ['', undefined, null, false, 0 as unknown as string]) {
      const m = html(h(HudBanner, { text }));
      if (text === 0) { expect(m).toContain('>0<'); continue; }
      expect(m).not.toContain('data-hud-call');
    }
  });

  it('the host keeps its slot', () => {
    expect(html(h(HudBanner, { text: 'DIVE!', className: 'top-1/4' }))).toContain('top-1/4');
  });

  it('a line clamps to two lines and narrows between a phone\'s thumbs; empty is null', () => {
    const m = html(h(HudLine, { text: 'A pass · B shoot', className: 'bottom-16' }));
    expect(m).toContain('-webkit-line-clamp:2');
    expect(m).toContain('[@media(orientation:landscape)_and_(max-height:520px)]:max-w-[44%]');
    expect(m).toContain('bottom-16');
    expect(html(h(HudLine, { text: '' }))).toBe('');
  });
});

describe('scorebug, chip, text', () => {
  it('a scorebug is one plate of cells; numbers in the display scale, tabular', () => {
    const m = html(h(Scorebug, null,
      h(ScoreCell, { label: 'YOU', value: 3, tone: 'you', labelTone: 'you' }),
      h(ScoreCell, { label: 'THEM', value: 1, tone: 'them', labelTone: 'them' })));
    expect(m).toContain('data-hud="scorebug"');
    expect((m.match(/data-hud-cell/g) ?? []).length).toBe(2);
    expect(m).toContain('YOU');
    expect(m).toContain('>3<');
    expect(m).toContain('tabular-nums');
    expect(m).toContain(`font-size:${hudFontSize('score')}`);
  });

  it('a chip: label then value, both in the scale; plate by default, none when asked', () => {
    const m = html(h(HudChip, { label: 'HR', tone: 'score' }, 4));
    expect(m.indexOf('HR')).toBeLessThan(m.indexOf('>4<'));
    expect(m).toContain('data-hud-plate');
    expect(html(h(HudChip, { plate: false }, 'x'))).not.toContain('data-hud-plate');
  });

  it('no readable HUD text below the caption step: every font-size the pieces draw is a scale step', () => {
    const all = [
      html(h(HudChip, { label: 'A', size: 'value' }, 1)),
      html(h(HudText, { size: 'caption' }, 'c')),
      html(h(HudMeter, { label: 'FLOW', value: 40, ticks: [{ at: 0.5, label: '10m' }], segments: [{ from: 0, to: 0.5, label: 'SOFT' }], markers: [{ at: 0.2, label: '3 m' }] })),
      html(h(HudBanner, { text: 'X' })),
      html(h(HudLine, { text: 'y' })),
    ].join('');
    const sizes = [...all.matchAll(/font-size:([^;"]+)/g)].map((x) => x[1]);
    expect(sizes.length).toBeGreaterThan(5);
    for (const s of sizes) expect(s).toMatch(/^calc\([\d.]+px \+ \(var\(--fel-hud-zoom, 1\) - 1\) \* [\d.]+px\)$/);
  });

  it('a plate can carry a side\'s colour on its edge', () => {
    expect(html(h(HudPlate, { accent: 'danger' }, 'x'))).toContain(`inset 3px 0 0 ${hudColor('danger')}`);
  });
});

describe('meter', () => {
  it('fills from the left on 0..max, clamped', () => {
    expect(html(h(HudMeter, { value: 50, max: 200 }))).toMatch(/data-hud-meter-fill[^>]*width:25%/);
    expect(html(h(HudMeter, { value: 500, max: 100 }))).toMatch(/data-hud-meter-fill[^>]*width:100%/);
    expect(html(h(HudMeter, { value: null }))).not.toContain('data-hud-meter-fill');
  });

  it('zones, ticks and markers land at their fractions; a marker can carry a caption', () => {
    const m = html(h(HudMeter, {
      segments: [{ from: 0.55, to: 0.85, label: 'DRIVEN', tone: 'you' }],
      ticks: [{ at: 0.3 }, { at: 0.5, major: false }],
      markers: [{ at: 0.42, glow: true, label: '43 m' }],
    }));
    expect(m).toContain('left:55%;width:30%');
    expect(m).toContain('DRIVEN');
    expect(m).toContain('left:30%');
    expect(m).toContain('height:50%');
    expect(m).toMatch(/data-hud-meter-marker[^>]*left:42%/);
    expect(m).toContain('43 m');
  });

  it('inline layout: label, bar, status in one row', () => {
    const m = html(h(HudMeter, { layout: 'inline', label: 'KINETIC', value: 100, status: 'SLAM READY', statusTone: 'score' }));
    expect(m.indexOf('KINETIC')).toBeLessThan(m.indexOf('data-hud-meter-bar'));
    expect(m.indexOf('data-hud-meter-bar')).toBeLessThan(m.indexOf('SLAM READY'));
  });

  it('pips light up to the count', () => {
    const m = html(h(HudPips, { count: 2, of: 3, tone: 'you' }));
    expect((m.match(new RegExp(hudColor('you').replace(/[()]/g, '\\$&'), 'g')) ?? []).length).toBe(2);
    expect((m.match(/rgba\(255,255,255,0.15\)/g) ?? []).length).toBe(1);
  });
});

describe('wiring: presentation only', () => {
  const dir = __dirname;
  const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));

  it('the system imports only React, framer-motion, its own files, the console view and the motion preference', () => {
    const allowed = /^(react|framer-motion|\.\/[\w-]+|@\/lib\/ui\/consoleView|@\/lib\/a11y\/reducedMotion)$/;
    for (const f of sources) {
      const src = readFileSync(path.join(dir, f), 'utf8');
      for (const [, spec] of src.matchAll(/from '([^']+)'/g)) expect(spec, `${f} imports ${spec}`).toMatch(allowed);
    }
  });

  it('and nothing about scores, timing windows, sessions, wallets or judging', () => {
    for (const f of sources) {
      const src = readFileSync(path.join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/@\/lib\/(sessions|wallet|economy|babylon|scoring|judge)/);
    }
  });
});
