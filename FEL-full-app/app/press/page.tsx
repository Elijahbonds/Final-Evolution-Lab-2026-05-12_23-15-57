import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { BOOKS, featuredBook, PARTNERS } from '@/lib/books/bookCatalog';
import { PressFrame } from '@/components/press/press-frame';
import { BookCover } from '@/components/press/book-cover';
import { CatalogCard, KindleLink, OfferCard } from '@/components/press/offer-card';
import { BuyButton } from '@/components/press/buy-button';
import { JoinForm } from '@/components/press/join-form';

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
  const bundle = featured.offers.find((o) => o.format === 'bundle');

  return (
    <PressFrame signedIn={session}>
      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5C518]">Featured</h2>
        <div className="mt-3 grid gap-6 rounded-2xl border border-white/10 bg-[#101010] p-4 md:grid-cols-[220px_1fr] md:p-6">
          <Link href={`/press/${featured.slug}`} className="block">
            <BookCover title={featured.title} tall />
          </Link>
          <div>
            {featured.eyebrow ? (
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">{featured.eyebrow}</p>
            ) : null}
            <h3 className="fel-heading mt-1 text-3xl text-white">
              <Link href={`/press/${featured.slug}`}>{featured.title}</Link>
            </h3>
            <p className="mt-2 text-sm text-white/55">{featured.description}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {featured.offers.map((offer) => (
                <OfferCard key={offer.id} book={featured} offer={offer} prominent />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {bundle?.directSale ? <BuyButton offerId={bundle.id} label="Buy bundle" prominent /> : null}
              <Link href={`/press/${featured.slug}#sample`} className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 hover:border-white/40">
                Free sample chapter
              </Link>
              <KindleLink book={featured} />
            </div>
            <p className="mt-3 text-[11px] text-white/35">
              Checkout is secure and hosted by the payment provider. Sales tax is calculated at checkout when Stripe Tax is turned on.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5C518]">The catalog</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BOOKS.map((book) => (
            <CatalogCard key={book.slug} book={book} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5C518]">My Library</h2>
        <div className="mt-3 rounded-2xl border border-white/10 bg-[#101010] p-5">
          <p className="text-sm text-white/70">
            {session
              ? 'Your purchases are in My Library: chapter player, EPUB, and PDF.'
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
