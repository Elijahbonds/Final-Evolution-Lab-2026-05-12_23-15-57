import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayShelf } from './play-shelf';

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

// SCREEN-FIXES-2 (2026-11-11): with three-line lists the closed rows grew to 88 px while the open one (its one-line blurb)
// stayed at 68: one row, two looks, and the every-screen scorer counted a fourth button look on /play (measured on the rig).
// Every row's list now holds three of its own lines (3lh), open or closed, so every row lays out alike and is one height.
describe('the family rows are one height, open or closed', () => {
  const lists = (html: string) => [...html.matchAll(/<button aria-expanded="(true|false)"[\s\S]*?<span data-shelf-list="true" class="([^"]*)"/g)].map((m) => ({ open: m[1] === 'true', cls: m[2].split(/\s+/) }));
  it('every row, the open one and the closed ones, reserves three lines of its list, and clamps at three', () => {
    const rows = lists(renderToStaticMarkup(createElement(PlayShelf, { initialFamily: 'hoops' })));
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.filter((r) => r.open)).toHaveLength(1);
    for (const r of rows) {
      expect(r.cls, r.open ? 'the open row' : 'a closed row').toContain('min-h-[3lh]');
      expect(r.cls).toContain('line-clamp-3');
    }
  });
});
