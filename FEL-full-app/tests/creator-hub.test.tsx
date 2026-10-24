import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CreatorHub } from '@/app/creator/_components/hub';

describe('CreatorHub', () => {
  it('routes every shipped creator discipline to a real play or guided create flow', () => {
    const html = renderToStaticMarkup(createElement(CreatorHub));
    const disciplineMarkers = html.match(/data-creator-discipline=/g) ?? [];
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

    expect(disciplineMarkers).toHaveLength(9);
    expect(html).toContain('Nine creator disciplines, one arena');
    expect(html).toContain('Build your athlete');
    expect(html).toContain('data-creator-discipline="art"');
    expect(hrefs[0]).toBe('/creator/athlete');
    expect(hrefs.slice(1)).toEqual([
      '/play/dance',
      '/play/acting',
      '/play/music',
      '/play/dunk',
      '/create/art',
      '/create/scene',
      '/create/cooking',
      '/create/fashion',
      '/create/writing',
    ]);
    expect(html).not.toContain('href=""');
    expect(html).not.toContain('coming in a future drop');
  });
});
