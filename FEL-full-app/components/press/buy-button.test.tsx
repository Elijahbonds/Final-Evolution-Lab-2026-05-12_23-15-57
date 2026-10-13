// PR #17 (owner, 2026-10-13): the book buy button carries the store-terms tick, like the coach store's book form.
// renderToStaticMarkup (no jsdom), the pattern of components/coach-store/book-form-terms.test.tsx.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BuyButton } from './buy-button';

const SRC = readFileSync(join(process.cwd(), 'components/press/buy-button.tsx'), 'utf8');
const html = renderToStaticMarkup(createElement(BuyButton, { offerId: 'blueprint:ebook', label: 'Buy ebook' }));

describe('book BuyButton terms tick', () => {
  it('shows an unticked checkbox, the /store-terms link, and a disabled buy button', () => {
    const checkbox = html.match(/<input[^>]*type="checkbox"[^>]*>/);
    expect(checkbox).not.toBeNull();
    expect(checkbox![0]).not.toContain('checked');
    expect(html).toMatch(/<a [^>]*href="\/store-terms"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Buy ebook<\/button>/);
  });

  it('puts the checkbox before the buy button and shows no notice on first paint', () => {
    expect(html.indexOf('type="checkbox"')).toBeLessThan(html.indexOf('<button'));
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });

  it('sends termsAccepted and the current termsVersion, and explains 401, adults_only and terms_required', () => {
    expect(SRC).toContain('termsAccepted: true');
    expect(SRC).toContain('termsVersion: STORE_TERMS_VERSION');
    expect(SRC).toContain("body?.error === 'terms_required'");
    expect(SRC).toContain("res.status === 403 && body?.error === 'adults_only'");
    expect(SRC).toContain('res.status === 401');
    expect(SRC).not.toContain('localStorage');
  });
});
