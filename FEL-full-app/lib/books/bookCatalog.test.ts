import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOOKS,
  EXAMPLE_AUDIO_CENTS,
  EXAMPLE_BUNDLE_CENTS,
  EXAMPLE_EBOOK_CENTS,
  PARTNERS,
  getBook,
  getOffer,
} from './bookCatalog';

const TITLES = [
  "The Neuro-Mechanic's Blueprint",
  'Unfair Advantages',
  'Building In The Loop',
  'Architecture Of Raising Humans',
  'Vibe Coders Handbook',
  'Neuro Mechanic Playbook',
  'Art of Dunking',
];

describe('the press catalog', () => {
  it('lists the seven books, each with ebook, audiobook, and bundle', () => {
    expect(BOOKS.map((b) => b.title)).toEqual(TITLES);
    for (const book of BOOKS) {
      expect(book.offers.map((o) => o.format)).toEqual(['ebook', 'audiobook', 'bundle']);
      expect(book.description).toBe('Description placeholder.');
      expect(book.files.some((f) => f.kind === 'epub')).toBe(true);
      expect(book.files.some((f) => f.kind === 'pdf')).toBe(true);
      expect(book.files.some((f) => f.kind === 'mp3')).toBe(true);
    }
  });

  it('marks every price as an example at the placeholder amounts', () => {
    for (const book of BOOKS) {
      const ebook = book.offers.find((o) => o.format === 'ebook')!;
      const audio = book.offers.find((o) => o.format === 'audiobook')!;
      const bundle = book.offers.find((o) => o.format === 'bundle')!;
      expect(ebook.priceCents).toBe(EXAMPLE_EBOOK_CENTS);
      expect(audio.priceCents).toBe(EXAMPLE_AUDIO_CENTS);
      expect(bundle.priceCents).toBe(EXAMPLE_BUNDLE_CENTS);
      expect(ebook.priceIsExample && audio.priceIsExample && bundle.priceIsExample).toBe(true);
    }
  });

  it('keeps direct ebook sales off while a title is flagged in KDP Select, and leaves the audiobook on', () => {
    const blocked = ['building-in-the-loop', 'architecture-of-raising-humans', 'vibe-coders-handbook', 'neuro-mechanic-playbook', 'art-of-dunking'];
    for (const slug of blocked) {
      const book = getBook(slug)!;
      expect(book.kdpSelect).toBe(true);
      expect(getOffer(`${slug}:ebook`)!.directSale).toBe(false);
      expect(getOffer(`${slug}:bundle`)!.directSale).toBe(false);
      expect(getOffer(`${slug}:audiobook`)!.directSale).toBe(true);
    }
    for (const slug of ['blueprint', 'unfair-advantages']) {
      expect(getBook(slug)!.kdpSelect).toBe(false);
      expect(getOffer(`${slug}:ebook`)!.directSale).toBe(true);
      expect(getOffer(`${slug}:bundle`)!.directSale).toBe(true);
    }
  });

  it('offers one free sample, Blueprint chapter 1, and keeps every object under books/<slug>/', () => {
    const samples = BOOKS.flatMap((b) => b.files.filter((f) => f.sample).map((f) => `${b.slug}:${f.label}`));
    expect(samples).toEqual(['blueprint:Chapter 1']);
    for (const book of BOOKS) {
      for (const file of book.files) {
        expect(file.storagePath.startsWith(`books/${book.slug}/`)).toBe(true);
        expect(file.storagePath.includes('..')).toBe(false);
      }
    }
  });

  it('keeps the outbound partner links exact, including the affiliate ref and the board code', () => {
    expect(PARTNERS.map((p) => p.href)).toEqual([
      'https://millions.co/elijah-bonds-basketball',
      'https://pjf-performance-shop.myshopify.com/?sca_ref=9885072.t2P8qJogGNMRly',
      'https://www.totalbodyboard.com/',
      'https://fanarch.com/collections/elijah-bonds',
    ]);
    expect(PARTNERS.find((p) => p.id === 'pjf')!.sponsored).toBe(true);
    expect(PARTNERS.find((p) => p.id === 'tbb')!.code).toBe('EBondJmp');
    const src = readFileSync(new URL('./bookCatalog.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/sk_live_|whsec_|private_key/);
  });
});
