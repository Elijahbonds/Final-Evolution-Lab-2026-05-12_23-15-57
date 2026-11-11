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
