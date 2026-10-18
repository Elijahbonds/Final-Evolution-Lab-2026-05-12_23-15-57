import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CreatorHub } from '@/app/creator/_components/hub';

describe('CreatorHub', () => {
  it('promises only live disciplines and keeps unfinished ones off the hub', () => {
    const html = renderToStaticMarkup(createElement(CreatorHub));
    const disciplineMarkers = html.match(/data-creator-discipline=/g) ?? [];

    expect(disciplineMarkers).toHaveLength(8);
    expect(html).toContain('Eight live disciplines, one arena');
    expect(html).not.toContain('data-creator-discipline="art"');
    expect(html).not.toContain('href=""');
  });
});
