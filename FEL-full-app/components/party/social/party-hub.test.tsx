import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocalPartyFallback } from './party-hub';

describe('social party hub fallback', () => {
  it('sends players to the local party room when online parties are unavailable', () => {
    const html = renderToStaticMarkup(createElement(LocalPartyFallback));
    expect(html).toContain('data-testid="party-local-fallback"');
    expect(html).toContain('Online parties aren');
    expect(html).toContain('href="/play/party"');
    expect(html).toContain('Open local party room');
  });
});
