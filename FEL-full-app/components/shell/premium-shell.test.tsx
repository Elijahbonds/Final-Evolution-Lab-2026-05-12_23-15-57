// The shell on the premium system (premium-ui P3): one frame in two forms, one accent on the lit tab, the Motion setting
// carried to CSS from the one component every page mounts, and focus kept clear of a docked primary.
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { TabPage } from './tab-page';

const read = (f: string) => readFileSync(join(__dirname, '..', '..', f), 'utf8');

describe('TabPage', () => {
  it('compact: one h1 on the type scale, the eyebrow in the one accent, the page fades in', () => {
    const s = renderToStaticMarkup(h(TabPage, { eyebrow: 'Train', title: 'Train', lede: 'Get better.', accent: '#00FF9D' }, h('p', null, 'body')));
    expect(s.match(/<h1/g)).toHaveLength(1);
    expect(s).toContain('text-fel-cyan');
    expect(s).not.toContain('#00FF9D');
    expect(s).toContain('fel-fade');
    expect(s).not.toContain('data-fel-hero');
  });
  it('hero: the full-bleed header carries the h1 and the primary; still one h1', () => {
    const s = renderToStaticMarkup(h(TabPage, {
      eyebrow: 'Play', title: 'Pick your game', hero: { image: '/backdrops/dunk.jpg', primary: h('a', { href: '/x', 'data-fel-primary': '' }, 'Go') },
    }, h('p', null, 'body')));
    expect(s).toContain('data-fel-hero');
    expect(s.match(/<h1/g)).toHaveLength(1);
    expect(s.match(/data-fel-primary/g)).toHaveLength(1);
  });
});

describe('the bar and the rail', () => {
  it('the lit tab is the one accent on every tab, not the tab\'s own colour', () => {
    const bar = read('components/shell/tab-bar.tsx');
    expect(bar).toMatch(/color: on \? COLOR\.cyan : COLOR\.textDim/);
    expect(bar).not.toMatch(/on \? t\.accent/);
  });
  it('the rail mounts the Motion setting\'s carrier (it renders on every page, signed in or not)', () => {
    const rail = read('components/shell/status-rail.tsx');
    const hook = rail.indexOf('useMotionAttr();');
    expect(hook).toBeGreaterThan(0);
    expect(hook).toBeLessThan(rail.indexOf('if (chromeHiddenFor(pathname)'));
  });
  it('focus clears a docked primary on a phone (2.4.11)', () => {
    expect(read('app/globals.css')).toMatch(/html:has\(\[data-fel-dock\]\) \{ scroll-padding-bottom: calc\(10rem/);
  });
});
