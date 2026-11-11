import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayShelf, SHELF_ROW_MIN_HEIGHT } from './play-shelf';

describe('PlayShelf', () => {
  it('renders the maintained mode descriptions inside an opened family', () => {
    const html = renderToStaticMarkup(createElement(PlayShelf, { initialFamily: 'racing' }));

    expect(html).toContain('Kart racing on the Sovereign Circuit');
    expect(html).toContain('Low-altitude air racing');
  });
});

describe('the closed families\' mode lists (owner, 2026-11-10: they may wrap to 3 lines)', () => {
  it('clamp at three lines, not two', () => {
    const html = renderToStaticMarkup(createElement(PlayShelf, {}));
    const lists = [...html.matchAll(/<span data-shelf-list="true" class="([^"]*)"/g)].map((m) => m[1]);
    expect(lists.length).toBeGreaterThan(3);
    for (const cls of lists) {
      expect(cls).toContain('line-clamp-3');
      expect(cls).not.toContain('line-clamp-2');
    }
  });
});

// SCREEN-FIXES-2 (2026-11-11): with three-line lists the closed rows grew taller than the open one (its one-line blurb kept it
// at 64 px): one row, two looks, and the every-screen scorer counted a fourth button look on /play. Every row now holds a
// three-line row's height, open or closed, so they are one button again; the three-line clamp is unchanged.
describe('the family rows are one height, open or closed', () => {
  const rowStyles = (html: string) => [...html.matchAll(/<button aria-expanded="(true|false)"[^>]*style="([^"]*)"/g)].map((m) => ({ open: m[1] === 'true', style: m[2] }));
  it('every row, the open one and the closed ones, reserves the same height', () => {
    const rows = rowStyles(renderToStaticMarkup(createElement(PlayShelf, { initialFamily: 'hoops' })));
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.filter((r) => r.open)).toHaveLength(1);
    const mins = new Set(rows.map((r) => r.style.match(/min-height:([^;]+)/)?.[1]?.trim() ?? 'none'));
    expect([...mins]).toEqual([SHELF_ROW_MIN_HEIGHT]);
  });
  it('that height holds three lines of the list at its own size and line height, plus the row\'s padding and borders', () => {
    const html = renderToStaticMarkup(createElement(PlayShelf, {}));
    const list = html.match(/<span data-shelf-list="true" class="([^"]*)"/)![1];
    const px = Number(list.match(/\btext-\[(\d+)px\]/)![1]);
    const NAMED: Record<string, number> = { 'leading-none': 1, 'leading-tight': 1.25, 'leading-snug': 1.375, 'leading-normal': 1.5 };
    const leads = list.split(/\s+/).map((c) => NAMED[c] ?? Number(c.match(/^leading-\[([\d.]+)\]$/)?.[1] ?? NaN)).filter((x) => !Number.isNaN(x));
    const need = 3 * px * Math.max(...leads) + 24 + 2;   // py-3 and the 1 px borders
    // the calc, at the default 16 px root
    const have = Function(`return ${SHELF_ROW_MIN_HEIGHT.replace(/^calc/, '').replace(/([\d.]+)rem/g, '($1*16)').replace(/px/g, '')}`)() as number;
    expect(have).toBeGreaterThanOrEqual(need - 0.01);
    expect(have).toBeLessThan(need + 2);   // and no taller than it needs to be
  });
});
