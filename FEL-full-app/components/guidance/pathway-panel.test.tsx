import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PathwayPanelError } from './pathway-panel';

describe('PathwayPanel failure state', () => {
  it('keeps the guidance page inhabited when its API is unavailable', () => {
    const html = renderToStaticMarkup(createElement(PathwayPanelError, { onRetry: () => {} }));

    expect(html).toContain('data-guidance-error="true"');
    expect(html).toContain('Pathways paused');
    expect(html).toContain('Try again');
    expect(html).not.toBe('');
  });
});
