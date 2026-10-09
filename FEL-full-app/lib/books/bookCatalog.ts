/**
 * Final Evolution Press — the only catalog.
 *
 * Prices are EXAMPLE placeholders. Elijah replaces `priceCents` and sets
 * `priceIsExample` to false when a number is real. Nothing in checkout reads
 * a price from the browser.
 *
 * KDP Select: a public Amazon check on 2026-09-26 showed Kindle Unlimited on
 * five of these seven titles. Those ebooks (and the bundles that include them)
 * are not offered for direct sale until `kdpSelect` is turned off. Audiobooks
 * are unaffected. Confirm each title in KDP Bookshelf before flipping the flag.
 *
 * Files are not in the repo. `storagePath` is the private object name Elijah
 * uploads. See docs/BOOK-SHOP.md.
 */

export type BookFormat = 'ebook' | 'audiobook' | 'bundle';
export type BookFileKind = 'epub' | 'pdf' | 'mp3';

export interface BookFile {
  id: string;
  label: string;
  /** Private object name. Always `books/<slug>/...`, never a URL. */
  storagePath: string;
  kind: BookFileKind;
  chapterIndex?: number;
  /** A sample is signed without an entitlement. Only the files marked here. */
  sample?: boolean;
}

export interface BookOffer {
  id: string;
  bookSlug: string;
  format: BookFormat;
  /** EXAMPLE cents until `priceIsExample` is false. */
  priceCents: number;
  priceIsExample: boolean;
  /** Dashboard Price id. Empty until Elijah creates one; checkout then uses price_data. */
  stripePriceId?: string;
  /** False while KDP Select blocks a direct ebook, including a bundle that contains it. */
  directSale: boolean;
  directSaleNote?: string;
}

export interface BookTitle {
  slug: string;
  title: string;
  /** Placeholder copy. Elijah replaces this. */
  description: string;
  track: string | null;
  /** Shown on the featured card. Omitted when there is nothing honest to say. */
  eyebrow: string | null;
  featured: boolean;
  /** Public Amazon Kindle page, when we have an ASIN. */
  asin: string | null;
  /**
   * Public Kindle Unlimited badge as of 2026-09-26. Not KDP Bookshelf.
   * While true, the ebook and the bundle are not sold here.
   */
  kdpSelect: boolean;
  /** True when the chapter titles are a stand-in for masters that are not uploaded yet. */
  chaptersArePlaceholder: boolean;
  files: BookFile[];
  offers: BookOffer[];
}

export interface PartnerLink {
  id: string;
  name: string;
  href: string;
  detail: string;
  sponsored: boolean;
  code?: string;
}

/** EXAMPLE cents. The mockup used these numbers; they are not a price decision. */
export const EXAMPLE_EBOOK_CENTS = 999;
export const EXAMPLE_AUDIO_CENTS = 1499;
export const EXAMPLE_BUNDLE_CENTS = 1999;

export const EXAMPLE_PRICE_NOTE = 'EXAMPLE — placeholder pending Elijah\'s decision. Not a live price.';

export const AMAZON_AUTHOR_URL = 'https://www.amazon.com/Elijah-Bonds/e/B0H63J1Q7B';

const KU_EBOOK = 'This ebook is in Kindle Unlimited, so it is not sold here until that term ends.';
const KU_BUNDLE = 'The bundle includes the ebook, so it stays off while the ebook is in Kindle Unlimited.';

export const PARTNERS: readonly PartnerLink[] = [
  {
    id: 'millions',
    name: 'MILLIONS merch',
    href: 'https://millions.co/elijah-bonds-basketball',
    detail: 'Official Elijah Bonds merch',
    sponsored: false,
  },
  {
    id: 'pjf',
    name: 'PJF Performance Band',
    href: 'https://pjf-performance-shop.myshopify.com/?sca_ref=9885072.t2P8qJogGNMRly',
    detail: 'Affiliate link',
    sponsored: true,
  },
  {
    id: 'tbb',
    name: 'Total Body Board',
    href: 'https://www.totalbodyboard.com/',
    detail: 'Use code at checkout',
    code: 'EBondJmp',
    sponsored: false,
  },
  {
    id: 'fanarch',
    name: 'Fan Arch collection',
    href: 'https://fanarch.com/collections/elijah-bonds',
    detail: 'Apparel',
    sponsored: false,
  },
];

function slugPart(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'file';
}

/** The storage contract: books/<slug>/<kind>/<file>. Segments are filenames, never paths. */
export function bookObjectPath(slug: string, folder: 'ebook' | 'audio', fileName: string): string {
  for (const segment of [slug, folder, fileName]) {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(segment)) {
      throw new Error(`bad storage segment: ${segment}`);
    }
  }
  return `books/${slug}/${folder}/${fileName}`;
}

function audioFiles(slug: string, labels: readonly string[], sampleLabel: string | null): BookFile[] {
  return labels.map((label, index) => ({
    id: `audio-${String(index).padStart(2, '0')}`,
    label,
    storagePath: bookObjectPath(slug, 'audio', `${String(index).padStart(2, '0')}-${slugPart(label)}.mp3`),
    kind: 'mp3' as const,
    chapterIndex: index,
    sample: sampleLabel != null && label === sampleLabel,
  }));
}

function ebookFiles(slug: string): BookFile[] {
  return [
    { id: 'epub', label: 'EPUB', storagePath: bookObjectPath(slug, 'ebook', 'book.epub'), kind: 'epub' },
    { id: 'pdf', label: 'PDF', storagePath: bookObjectPath(slug, 'ebook', 'book.pdf'), kind: 'pdf' },
  ];
}

function numberedChapters(count: number): string[] {
  return ['Opening', ...Array.from({ length: count }, (_, i) => `Chapter ${i + 1}`), 'Close'];
}

function offersFor(slug: string, kdpSelect: boolean): BookOffer[] {
  return [
    {
      id: `${slug}:ebook`,
      bookSlug: slug,
      format: 'ebook',
      priceCents: EXAMPLE_EBOOK_CENTS,
      priceIsExample: true,
      directSale: !kdpSelect,
      directSaleNote: kdpSelect ? KU_EBOOK : undefined,
    },
    {
      id: `${slug}:audiobook`,
      bookSlug: slug,
      format: 'audiobook',
      priceCents: EXAMPLE_AUDIO_CENTS,
      priceIsExample: true,
      directSale: true,
    },
    {
      id: `${slug}:bundle`,
      bookSlug: slug,
      format: 'bundle',
      priceCents: EXAMPLE_BUNDLE_CENTS,
      priceIsExample: true,
      directSale: !kdpSelect,
      directSaleNote: kdpSelect ? KU_BUNDLE : undefined,
    },
  ];
}

function title(input: {
  slug: string;
  title: string;
  track: string | null;
  eyebrow?: string | null;
  featured?: boolean;
  asin: string | null;
  kdpSelect: boolean;
  chapterLabels: readonly string[];
  chaptersArePlaceholder: boolean;
  sampleLabel?: string | null;
}): BookTitle {
  return {
    slug: input.slug,
    title: input.title,
    description: 'Description placeholder.',
    track: input.track,
    eyebrow: input.eyebrow ?? null,
    featured: input.featured ?? false,
    asin: input.asin,
    kdpSelect: input.kdpSelect,
    chaptersArePlaceholder: input.chaptersArePlaceholder,
    files: [...ebookFiles(input.slug), ...audioFiles(input.slug, input.chapterLabels, input.sampleLabel ?? null)],
    offers: offersFor(input.slug, input.kdpSelect),
  };
}

/**
 * Chapter counts for Blueprint (opening + 20 + close) and Art of Dunking
 * (opening + 12 + close) come from the audio-master inventory, not from
 * invented titles. The other five lists are short placeholders.
 */
export const BOOKS: readonly BookTitle[] = [
  title({
    slug: 'blueprint',
    title: "The Neuro-Mechanic's Blueprint",
    track: 'Performance',
    eyebrow: 'Book 1 · Performance track',
    featured: true,
    asin: 'B0H5J1M18H',
    kdpSelect: false,
    chapterLabels: numberedChapters(20),
    chaptersArePlaceholder: false,
    sampleLabel: 'Chapter 1',
  }),
  title({
    slug: 'unfair-advantages',
    title: 'Unfair Advantages',
    track: null,
    asin: 'B0HDC1F3KV',
    kdpSelect: false,
    chapterLabels: ['Opening', 'Chapter 1', 'Chapter 2', 'Close'],
    chaptersArePlaceholder: true,
  }),
  title({
    slug: 'building-in-the-loop',
    title: 'Building In The Loop',
    track: null,
    asin: 'B0HDC12N81',
    kdpSelect: true,
    chapterLabels: ['Opening', 'Chapter 1', 'Chapter 2', 'Close'],
    chaptersArePlaceholder: true,
  }),
  title({
    slug: 'architecture-of-raising-humans',
    title: 'Architecture Of Raising Humans',
    track: null,
    asin: 'B0HDBZZ68Y',
    kdpSelect: true,
    chapterLabels: ['Opening', 'Chapter 1', 'Chapter 2', 'Close'],
    chaptersArePlaceholder: true,
  }),
  title({
    slug: 'vibe-coders-handbook',
    title: 'Vibe Coders Handbook',
    track: 'Build',
    asin: 'B0HDC1F3KR',
    kdpSelect: true,
    chapterLabels: ['Opening', 'Chapter 1', 'Chapter 2', 'Close'],
    chaptersArePlaceholder: true,
  }),
  title({
    slug: 'neuro-mechanic-playbook',
    title: 'Neuro Mechanic Playbook',
    track: 'Performance',
    asin: 'B0HDCJ12MZ',
    kdpSelect: true,
    chapterLabels: ['Opening', 'Chapter 1', 'Chapter 2', 'Close'],
    chaptersArePlaceholder: true,
  }),
  title({
    slug: 'art-of-dunking',
    title: 'Art of Dunking',
    track: 'Performance',
    asin: 'B0HDC7PKFY',
    kdpSelect: true,
    chapterLabels: numberedChapters(12),
    chaptersArePlaceholder: false,
  }),
];

function assertCatalog(books: readonly BookTitle[]): void {
  const slugs = new Set<string>();
  const paths = new Set<string>();
  const offerIds = new Set<string>();
  let featured = 0;
  for (const book of books) {
    if (slugs.has(book.slug)) throw new Error(`duplicate book slug ${book.slug}`);
    slugs.add(book.slug);
    if (book.featured) featured += 1;
    if (book.description.trim() === '') throw new Error(`${book.slug} needs a description placeholder`);
    const fileIds = new Set<string>();
    for (const file of book.files) {
      if (fileIds.has(file.id)) throw new Error(`duplicate file ${book.slug}/${file.id}`);
      fileIds.add(file.id);
      if (!file.storagePath.startsWith(`books/${book.slug}/`) || file.storagePath.includes('..')) {
        throw new Error(`storage path escaped the book prefix: ${file.storagePath}`);
      }
      if (paths.has(file.storagePath)) throw new Error(`duplicate storage path ${file.storagePath}`);
      paths.add(file.storagePath);
    }
    for (const offer of book.offers) {
      if (offer.bookSlug !== book.slug) throw new Error(`offer ${offer.id} is on the wrong book`);
      if (offerIds.has(offer.id)) throw new Error(`duplicate offer ${offer.id}`);
      offerIds.add(offer.id);
      if (!Number.isInteger(offer.priceCents) || offer.priceCents <= 0) throw new Error(`bad price on ${offer.id}`);
      if (book.kdpSelect && (offer.format === 'ebook' || offer.format === 'bundle') && offer.directSale) {
        throw new Error(`${offer.id} is marked for direct sale while the ebook is in KDP Select`);
      }
    }
  }
  if (featured !== 1) throw new Error('the press catalog needs exactly one featured book');
}

assertCatalog(BOOKS);

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function kindleUrl(book: BookTitle): string | null {
  return book.asin ? `https://www.amazon.com/dp/${book.asin}` : null;
}

export function getBook(slug: string): BookTitle | undefined {
  return BOOKS.find((b) => b.slug === slug);
}

export function featuredBook(): BookTitle {
  const book = BOOKS.find((b) => b.featured);
  if (!book) throw new Error('catalog has no featured book');
  return book;
}

export function getOffer(offerId: string): BookOffer | undefined {
  for (const book of BOOKS) {
    const offer = book.offers.find((o) => o.id === offerId);
    if (offer) return offer;
  }
  return undefined;
}

export function getBookFile(slug: string, fileId: string): BookFile | undefined {
  return getBook(slug)?.files.find((f) => f.id === fileId);
}

export function formatLabel(format: BookFormat): string {
  if (format === 'ebook') return 'Ebook (EPUB + PDF)';
  if (format === 'audiobook') return 'Audiobook (MP3)';
  return 'Ebook + Audiobook';
}

export function fileNeedsFormat(kind: BookFileKind): 'ebook' | 'audiobook' {
  return kind === 'mp3' ? 'audiobook' : 'ebook';
}
