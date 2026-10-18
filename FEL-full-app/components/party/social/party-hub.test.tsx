import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocalPartyFallback } from './party-hub';

describe('social party hub fallback', () => {
  it('sends players through login to the local party room when online parties are unavailable', () => {
    const html = renderToStaticMarkup(createElement(LocalPartyFallback));
    expect(html).toContain('data-testid="party-local-fallback"');
    expect(html).toContain('Online parties aren');
    expect(html).toContain('href="/login?next=%2Fplay%2Fparty"');
    expect(html).toContain('Open local party room');
  });

  it('offers the same local party escape hatch when the online server is outdated', () => {
    const html = renderToStaticMarkup(createElement(LocalPartyFallback, { outdated: true }));
    expect(html).toContain('data-testid="party-local-fallback"');
    expect(html).toContain('data-testid="party-outdated"');
    expect(html).toContain('Parties need a server update');
    expect(html).toContain('href="/login?next=%2Fplay%2Fparty"');
  });
});
