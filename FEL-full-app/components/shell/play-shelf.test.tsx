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
