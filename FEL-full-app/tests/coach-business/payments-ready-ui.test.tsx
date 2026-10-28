// PAYMENTS-READY: the tick boxes are on the page before anything can reach Stripe. Server-rendered (the first paint).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BookButton } from '@/components/coach-business/package-actions';

describe('Book: the buyer ticks the store terms first', () => {
  it('a required box linking the store terms; the Book button starts disabled', () => {
    const html = renderToStaticMarkup(createElement(BookButton, { slug: 'jordan-lee', packageId: 'pkg-1' }));
    expect(html).toContain('data-buyer-terms');
    expect(html).toMatch(/<input type="checkbox"[^>]*\/?>/);
    // test changed (owner-approvals, 2026-10-27, card C28): buyers tick the Purchase Terms now, not the coach store's terms
    expect(html).toContain('href="/purchase-terms"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-action="book"|<button[^>]*data-action="book"[^>]*disabled=""/);
  });
});
