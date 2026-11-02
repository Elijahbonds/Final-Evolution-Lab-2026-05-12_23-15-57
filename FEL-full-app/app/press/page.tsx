import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { BOOKS, featuredBook, PARTNERS, publicBookDescription } from '@/lib/books/bookCatalog';
import { isPurchaseOpen } from '@/lib/payments/allowlist';
import { bookItem } from '@/lib/shop/model';
import { ProductCard } from '@/components/shop/product-card';
import { BookBuy } from '@/components/shop/book-buy';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { bookFormatAllowed, bookOfferAllowed } from '@/lib/books/bookTerms';
import { PressFrame } from '@/components/press/press-frame';
import { KindleLink } from '@/components/press/offer-card';
import { JoinForm } from '@/components/press/join-form';
import { OwnerCopy } from '@/components/public-copy/owner-copy';
import { PUBLIC_PAGE_COPY } from '@/lib/creator/creatorCatalog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Press — Final Evolution Lab' };

async function signedIn(): Promise<boolean> {
  try {
    const session = await getServerSession(authOptions);
    return Boolean(session?.user);
  } catch {
    return false;
  }
}

export default async function PressPage() {
  const session = await signedIn();
  const featured = featuredBook();
  const featuredOffers = featured.offers.filter((o) => bookFormatAllowed(o.format));

  // PLAT-P07 (2026-11-02): the shop front's shape. The audiobooks first, as the one product card (title, one line, the
  // one price formatter) with the one buy sheet behind Buy (components/shop/book-buy.tsx); Opens soon while books are not
  // on sale (isPurchaseOpen('books') and the offer's own direct sale and format, lib/books/bookTerms.ts). Ebooks, bundles
  // and downloads stay hidden (EBOOK fail-closed). The About text moved under the books.
  const booksOpen = isPurchaseOpen('books');
  const audio = BOOKS.flatMap((book) => {
    const offer = book.offers.find((o) => o.format === 'audiobook');
    if (!offer || !bookFormatAllowed(offer.format)) return [];
    return [{ book, offer, item: bookItem({ slug: book.slug, title: book.title, description: publicBookDescription(book) }, offer, { formatAllowed: bookOfferAllowed(offer), purchasesOpen: booksOpen }) }];
  });
  const lead = audio.find((a) => a.book.slug === featured.slug) ?? audio[0] ?? null;
  return (
    <PressFrame signedIn={session}>
      <section className="mt-6" data-press-audiobooks>
        <h2 className={L.sectionTitle}>Audiobooks</h2>
        <ul className={L.grid}>
          {(lead ? [lead, ...audio.filter((a) => a !== lead)] : audio).map(({ book, offer, item }) => (
            <li key={book.slug} data-book={book.slug}>
              <ProductCard item={item} side={offer.priceIsExample ? <span className="text-[#ff6b6b]">Example</span> : null}>
                <BookBuy item={item} back={`/press/${book.slug}`} />
              </ProductCard>
              <Link href={`/press/${book.slug}`} className={`${L.cardSide} mt-2 inline-flex min-h-11 items-center`}>Free sample</Link>
            </li>
          ))}
        </ul>
        {featuredOffers.length === 0 ? <KindleLink book={featured} /> : null}
      </section>

      {/* ONB-05: Appendix B as approved (2026-10-20); [OWNER: …] marks a blank the owner still fills. */}
      <section className="mt-10" data-press-about>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5C518]">About Final Evolution Lab</h2>
        <OwnerCopy parts={PUBLIC_PAGE_COPY.press.body} className="mt-2 max-w-2xl text-sm leading-relaxed text-white/75" />
      </section>

      <section className="mt-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5C518]">My Library</h2>
        <div className="mt-3 rounded-2xl border border-white/10 bg-[#101010] p-5">
          <p className="text-sm text-white/70">
            {session
              ? 'Your audiobooks are in My Library: stream them here. Audiobooks are stream only, with no download.'
              : 'Log in with the email you check out with. Purchases made as a guest are waiting on that address.'}
          </p>
          <Link href="/press/library" className="mt-3 inline-block rounded-md bg-[#F5C518] px-4 py-2 text-sm font-semibold text-black">
            {session ? 'Open My Library' : 'Log in to My Library'}
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5C518]">More from Elijah</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PARTNERS.map((partner) => (
            <a
              key={partner.id}
              href={partner.href}
              target="_blank"
              rel={partner.sponsored ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}
              className="rounded-xl border border-white/10 bg-[#141414] p-4 hover:border-white/30"
            >
              <p className="text-sm font-semibold text-white">{partner.name}</p>
              <p className="mt-1 text-[11px] text-white/45">{partner.detail}</p>
              {partner.code ? (
                <p className="mt-2 font-mono text-sm text-[#F5C518]">Code {partner.code}</p>
              ) : null}
            </a>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-white/35">
          PJF Performance Band is an affiliate link. Final Evolution may earn a commission.
        </p>
      </section>

      <section className="mt-10 rounded-2xl border border-white/10 bg-[#101010] p-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5C518]">Join the Lab</h2>
        <p className="mt-2 text-sm text-white">Get a free Blueprint chapter and drop alerts.</p>
        <JoinForm />
        <p className="mt-2 text-[11px] text-white/35">The free chapter is the Blueprint sample. Unsubscribe any time.</p>
      </section>
    </PressFrame>
  );
}
