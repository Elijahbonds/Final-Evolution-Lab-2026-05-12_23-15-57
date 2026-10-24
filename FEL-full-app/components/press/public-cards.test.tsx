// #348 (cursor-bundle-2, 2026-10-24): the public Press/creator cards show no raw "placeholder" label.
// Release already replaced the description/bio/rate placeholders (#332/#339/#346 via #359: publicBookDescription,
// publicCreatorCopy); #348's one remaining change was BookCover's "Cover placeholder" caption. This pins all three
// shared cards so the word cannot come back on a public page.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BOOKS } from '@/lib/books/bookCatalog';
import { BookCover } from './book-cover';
import { CatalogCard } from './offer-card';
import { CreatorFrame, ProfilePhoto } from '@/components/creator-platform/creator-frame';

describe('public placeholder copy on shared cards', () => {
  it('BookCover, CatalogCard and the creator frame render no "placeholder" label', () => {
    const cover = renderToStaticMarkup(createElement(BookCover, { title: 'Test Title' }));
    const catalog = BOOKS.map((book) => renderToStaticMarkup(createElement(CatalogCard, { book }))).join('\n');
    const frame = renderToStaticMarkup(
      createElement(CreatorFrame, { signedIn: true, title: 'Team', lede: 'Lede' }, createElement(ProfilePhoto, { name: 'Elijah Bonds', photoUrl: null })),
    );
    // controls: each one rendered its real content
    expect(cover).toContain('Test Title');
    expect(cover).toContain('Final Evolution title card');
    expect(BOOKS.length).toBeGreaterThan(0);
    expect(catalog).toContain(`href="/press/${BOOKS[0].slug}"`);
    expect(frame).toContain('EB');
    for (const html of [cover, catalog, frame]) expect(html).not.toMatch(/placeholder/i);
  });
});
