// The premium kit, server-rendered (lane/premium-ui P1): each piece says what it is to a screen reader, carries the
// markers the pages and the rig read, and the docked pill is the one primary.
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Timer } from 'lucide-react';
import { BigNumber, Chip, EmptyState, HeroHeader, ListRow, MediaCard, PrimaryCta, Skeleton, SkeletonGroup, StatCard, StatRing, nextSegment, ringGeometry } from './index';
import { SegmentedTabs } from './segmented-tabs';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('StatRing', () => {
  it('one image with its label and value; a dash and no arc when nothing is measured', () => {
    const on = html(h(StatRing, { value: 72, label: 'PRQ' }));
    expect(on).toContain('role="img"');
    expect(on).toContain('aria-label="PRQ: 72 of 100"');
    expect(on).toContain('fel-ring-arc');
    const off = html(h(StatRing, { value: null, label: 'Form' }));
    expect(off).toContain('aria-label="Form: not measured yet"');
    expect(off).not.toContain('fel-ring-arc');
    expect(off).toContain('—');
  });
  it('geometry: clamped to the track', () => {
    expect(ringGeometry(100, 10, 50, 100).pct).toBe(0.5);
    expect(ringGeometry(100, 10, 500, 100).pct).toBe(1);
    expect(ringGeometry(100, 10, -3, 100).pct).toBe(0);
    expect(ringGeometry(100, 10, null, 100).offset).toBeCloseTo(2 * Math.PI * 45);
  });
});

describe('BigNumber', () => {
  it('the change is an arrow and a word, never colour alone', () => {
    const s = html(h(BigNumber, { label: 'Jump', value: '61.2', unit: 'cm', delta: '+2.1 cm', trend: 'up' }));
    expect(s).toContain('Up +2.1 cm');
    expect(s).toContain('text-fel-emerald');
    const slower = html(h(BigNumber, { label: 'Sprint', value: '4.9', delta: '+0.1 s', trend: 'up', good: 'down' }));
    expect(slower).toContain('text-fel-crimson');
    expect(html(h(BigNumber, { label: 'Reaction', value: null }))).toContain('—');
  });
});

describe('PrimaryCta', () => {
  it('a link or a button, marked as the primary; docked wraps it once in the dock', () => {
    const a = html(h(PrimaryCta, { href: '/try', children: 'Play now' }));
    expect(a).toMatch(/^<a [^>]*href="\/try"/);
    expect(a).toContain('data-fel-primary');
    expect(a).not.toContain('data-fel-dock');
    const d = html(h(PrimaryCta, { href: '/try', docked: true, children: 'Play now' }));
    expect(d.match(/data-fel-dock/g)).toHaveLength(1);
    expect(d).toContain('md:static');
    expect(html(h(PrimaryCta, { onClick: () => {}, children: 'Go' }))).toMatch(/^<button type="button"/);
  });
});

describe('cards, chips, empty and loading states', () => {
  it('the three card kinds mark themselves; images are decoration', () => {
    expect(html(h(MediaCard, { href: '/venues', image: '/venues/venicebeach.jpg', title: 'Venice' }))).toMatch(/data-fel-card="media"[\s\S]*alt=""/);
    expect(html(h(StatCard, { label: 'Week', value: 5, max: 7 }))).toContain('data-fel-card="stat"');
    expect(html(h(ListRow, { href: '/screen', icon: Timer, title: 'Quick Screen' }))).toContain('data-fel-card="row"');
  });
  it('the hero: decorative image, one h1, the scrim', () => {
    const s = html(h(HeroHeader, { image: '/backdrops/dunk.jpg', title: 'Pick your game', eyebrow: 'Play' }));
    expect(s.match(/<h1/g)).toHaveLength(1);
    expect(s).toContain('alt=""');
    expect(s).toContain('var(--fel-scrim)');
  });
  it('a chip with href is a secondary door; without, a label', () => {
    expect(html(h(Chip, { href: '/party', children: 'Couch' }))).toMatch(/^<a /);
    expect(html(h(Chip, { children: 'Live', tone: 'accent' }))).toMatch(/^<span /);
  });
  it('empty state and skeleton: a figure and a line; "Loading" said once', () => {
    expect(html(h(EmptyState, { title: 'Nothing yet' }))).toContain('data-fel-empty');
    const sk = html(h(SkeletonGroup, null, h(Skeleton, { shape: 'card' }), h(Skeleton, null)));
    expect(sk).toContain('role="status"');
    expect(sk).toContain('aria-busy="true"');
    expect(sk.match(/Loading/g)).toHaveLength(1);
    expect(sk.match(/aria-hidden="true"/g)).toHaveLength(2);
  });
});

describe('SegmentedTabs', () => {
  it('a real tablist: one tab stop, the selected one', () => {
    const s = html(h(SegmentedTabs, { label: 'Range', value: 'b', onChange: () => {}, items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }));
    expect(s).toContain('role="tablist"');
    expect(s.match(/role="tab"/g)).toHaveLength(2);
    expect(s.match(/tabindex="0"/g)).toHaveLength(1);
    expect(s).toMatch(/aria-selected="true"[^>]*tabindex="0"/);
  });
  it('arrows wrap, Home and End jump', () => {
    const ids = ['a', 'b', 'c'];
    expect(nextSegment(ids, 'c', 'ArrowRight')).toBe('a');
    expect(nextSegment(ids, 'a', 'ArrowLeft')).toBe('c');
    expect(nextSegment(ids, 'b', 'Home')).toBe('a');
    expect(nextSegment(ids, 'b', 'End')).toBe('c');
    expect(nextSegment(ids, 'b', 'Enter')).toBeNull();
  });
});
