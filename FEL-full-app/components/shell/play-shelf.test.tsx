import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MODE_INFO } from '@/lib/game-data';
import { FAMILIES } from '@/lib/nav/families';
import { PlayShelf } from './play-shelf';

describe('PlayShelf accessibility', () => {
  it('names every family toggle with its family and mode count', () => {
    const html = renderToStaticMarkup(createElement(PlayShelf));
    expect(html.match(/type="button"/g) ?? []).toHaveLength(FAMILIES.length);
    for (const family of FAMILIES) {
      const count = family.modes.filter((mode) => MODE_INFO[mode]).length;
      const label = family.label.replace(/&/g, '&amp;');
      expect(html, family.id).toContain(`aria-label="${label} family, ${count} modes"`);
    }
  });
});
