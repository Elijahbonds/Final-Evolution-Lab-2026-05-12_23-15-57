import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STORE_TERMS_FINGERPRINTS, STORE_TERMS_VERSION } from '@/lib/store-terms';
import { BOOKS } from './bookCatalog';
import {
  BOOK_TERMS_POLICIES,
  bookDownloadsAllowed,
  bookFileKindAllowed,
  bookFormatAllowed,
  bookOfferAllowed,
  bookPolicyFor,
  currentBookPolicy,
} from './bookTerms';
import { CLOSED_POLICY, EBOOK_ENABLED_POLICY } from '@/tests/helpers/bookTermsPolicies';

describe('the book terms allow-list (one rule, one place)', () => {
  it('the live store terms version has a row, so the shop cannot silently close or open on a terms bump', () => {
    // If this fails, STORE_TERMS_VERSION moved. Read the new text, then add its row to BOOK_TERMS_POLICIES.
    expect(Object.keys(BOOK_TERMS_POLICIES)).toContain(STORE_TERMS_VERSION);
    for (const version of Object.keys(BOOK_TERMS_POLICIES)) {
      expect(Object.keys(STORE_TERMS_FINGERPRINTS)).toContain(version);
    }
  });

  it('store-terms-2026-10-12 covers audiobooks only, stream only: no ebook, no bundle, no download', () => {
    expect(STORE_TERMS_VERSION).toBe('store-terms-2026-10-12');
    const p = currentBookPolicy();
    expect(p.formats).toEqual(['audiobook']);
    expect(p.downloads).toBe(false);
    expect(bookFormatAllowed('audiobook')).toBe(true);
    expect(bookFormatAllowed('ebook')).toBe(false);
    expect(bookFormatAllowed('bundle')).toBe(false);
    expect(bookDownloadsAllowed()).toBe(false);
  });

  it('fail closed: a terms version that is not listed offers nothing and downloads nothing', () => {
    const p = bookPolicyFor('store-terms-2099-01-01');
    expect(p.formats).toEqual([]);
    expect(p.downloads).toBe(false);
    for (const format of ['audiobook', 'ebook', 'bundle', '', 'constructor']) expect(bookFormatAllowed(format, p)).toBe(false);
    expect(bookPolicyFor('__proto__').formats).toEqual([]);
    expect(bookPolicyFor('constructor').formats).toEqual([]);
  });

  it('across the whole catalog only inventoried audiobook offers are sellable today', () => {
    const sellable = BOOKS.flatMap((b) => b.offers.filter((o) => bookOfferAllowed(o)));
    expect(sellable.map((o) => o.id)).toEqual(['blueprint:audiobook', 'art-of-dunking:audiobook']);
  });

  it('file kinds: the mp3 streams; EPUB and PDF are refused until a terms version covers ebooks AND downloads', () => {
    expect(bookFileKindAllowed('mp3')).toBe(true);
    expect(bookFileKindAllowed('epub')).toBe(false);
    expect(bookFileKindAllowed('pdf')).toBe(false);
    // an ebook format with downloads off is still refused (a download is a download)
    expect(bookFileKindAllowed('epub', { ...EBOOK_ENABLED_POLICY, downloads: false })).toBe(false);
    expect(bookFileKindAllowed('epub', EBOOK_ENABLED_POLICY)).toBe(true);
    expect(bookFileKindAllowed('mp3', CLOSED_POLICY)).toBe(false);
  });

  it('switching ebooks on later is a row in the allow-list and nothing else (the KDP flag still applies)', () => {
    const kdp = BOOKS.find((b) => b.kdpSelect)!;
    const free = BOOKS.find((b) => !b.kdpSelect)!;
    expect(bookOfferAllowed(free.offers.find((o) => o.format === 'ebook')!, EBOOK_ENABLED_POLICY)).toBe(true);
    expect(bookOfferAllowed(kdp.offers.find((o) => o.format === 'ebook')!, EBOOK_ENABLED_POLICY)).toBe(false);
  });

  it('no UI file draws an ebook download: the download button is not used by any page', () => {
    for (const file of [
      'app/press/page.tsx',
      'app/press/[slug]/page.tsx',
      'app/press/library/page.tsx',
      'app/press/receipt/page.tsx',
    ]) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toContain('DownloadButton');
      expect(src, file).not.toContain('download-button');
    }
  });
});
