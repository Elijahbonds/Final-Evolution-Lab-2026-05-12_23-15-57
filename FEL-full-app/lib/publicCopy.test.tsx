import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BOOKS } from '@/lib/books/bookCatalog';
import { BookCover } from '@/components/press/book-cover';
import { CatalogCard } from '@/components/press/offer-card';
import { CreatorFrame, ProfilePhoto } from '@/components/creator-platform/creator-frame';
import { publicCopy } from './publicCopy';

describe('public placeholder copy', () => {
  it('replaces internal placeholder strings with public fallback copy', () => {
    expect(publicCopy('Description placeholder.', 'Description pending.')).toBe('Description pending.');
    expect(publicCopy('  Ready copy.  ', 'Fallback.')).toBe('Ready copy.');
  });

  it('does not expose raw placeholder labels on public cards', () => {
    const html = [
      renderToStaticMarkup(createElement(BookCover, { title: 'Test Title' })),
      renderToStaticMarkup(createElement(CatalogCard, { book: BOOKS[0] })),
      renderToStaticMarkup(createElement(CreatorFrame, { signedIn: true, title: 'Team', lede: 'Lede' }, createElement(ProfilePhoto, { name: 'Elijah Bonds', photoUrl: null }))),
    ].join('\n');

    expect(html).not.toMatch(/placeholder/i);
    expect(html).toContain('Book description is being confirmed.');
    expect(html).toContain('Final Evolution title card');
    expect(html).toContain('Elijah Bonds initials');
  });
});
