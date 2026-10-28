// PLAT-P03: the result card — one big number, one arrow chip, one line, one primary; the rest behind Details.
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { paragraphs, ResultCard, MAX_PARAGRAPH_WORDS, PROGRESS_HREF } from './result-card';
import { LOOK } from './look';
import type { ResultView } from '@/lib/results/view';

const view = (o: Partial<ResultView> = {}): ResultView => ({
  measure: '40 yd sprint', value: '5.12', unit: 's', estimate: true, pm: '0.06', vsLast: 'down', better: 'down',
  vsLine: '0.19 s faster than last time', line: 'Your own number to beat. It is a camera estimate, so a small change may just be noise.',
  next: { label: 'Run it again', href: '/train/speed' }, ...o,
});

describe('the result card', () => {
  const html = renderToStaticMarkup(h(ResultCard, { view: view(), details: h('p', null, 'the splits') }));
  it('the number is the biggest thing on it (64 px), with its unit, its ± and "estimate"', () => {
    expect(LOOK.number).toContain('text-[64px]');
    expect(html).toMatch(/data-result-value[^>]*>5\.12</);
    expect(html).toContain('s ±0.06');
    expect(html).toContain('data-result-estimate');
    expect(html).toContain('aria-label="about 5.12 plus or minus 0.06 s"');
  });
  it('one arrow chip, in words (never colour alone), toned by better or worse', () => {
    expect(html.match(/data-result-vs=/g)).toHaveLength(1);
    expect(html).toContain('0.19 s faster than last time');
    expect(html).toContain('text-fel-emerald');
  });
  it('exactly one primary, then "See all" (the door to My progress), and the detail collapsed', () => {
    expect(html.match(/data-fel-primary/g)).toHaveLength(1);
    expect(html).toContain(`href="${PROGRESS_HREF}"`);
    expect(html).toContain('data-result-details="closed"');
    expect(html).toMatch(/aria-expanded="false"/);
    expect(html).toMatch(/<div id="[^"]+" hidden=""/);
  });
  it('no arrow without a comparison; no primary where the screen has its own', () => {
    const quiet = renderToStaticMarkup(h(ResultCard, { view: view({ vsLast: null, vsLine: null }), primary: false }));
    expect(quiet).not.toContain('data-result-vs');
    expect(quiet).not.toContain('data-fel-primary');
    const same = renderToStaticMarkup(h(ResultCard, { view: view({ vsLast: 'same', vsLine: 'About the same as last time' }) }));
    expect(same).toContain('About the same as last time');
    expect(same).toContain('text-fel-soft');
  });
  it('a line over 24 words is split at its full stops, every sentence kept', () => {
    const long = 'Today\'s session is eased: a set fewer and a little lighter on the main work. Same exercises, same slots. Coach Dee has been told.';
    const p = paragraphs(long);
    expect(p.join(' ')).toBe(long);
    for (const x of p) expect(x.split(/\s+/).length).toBeLessThanOrEqual(MAX_PARAGRAPH_WORDS);
    expect(paragraphs('Short line.')).toEqual(['Short line.']);
  });
  it('the count-up and the reveal are motion: off under reduced motion (the source reads it)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./result-card.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/reduce = reducedMotion\(\)/);
    expect(src).toMatch(/if \(reduce \|\| typeof requestAnimationFrame/);
  });
});
