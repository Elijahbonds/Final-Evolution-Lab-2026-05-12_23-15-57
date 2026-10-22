import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBook } from '@/lib/books/bookCatalog';
import { bookFormatAllowed } from '@/lib/books/bookTerms';
import { hasBookAccess, normalizeBookEmail } from '@/lib/books/bookEntitlements';
import { prismaBookStore } from '@/lib/books/bookStore';
import { PressFrame } from '@/components/press/press-frame';
import { BookCover } from '@/components/press/book-cover';
import { KindleLink, OfferCard } from '@/components/press/offer-card';
import { AudioPlayer } from '@/components/press/audio-player';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { slug: string } }) {
  const book = getBook(params.slug);
  return { title: book ? `${book.title} — Final Evolution Press` : 'Press' };
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { checkout?: string };
}) {
  const book = getBook(params.slug);
  if (!book) notFound();

  let signedIn = false;
  let userId: string | null = null;
  let email: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    signedIn = Boolean(session?.user);
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    email = session?.user?.email ? normalizeBookEmail(session.user.email) : null;
  } catch {
    signedIn = false;
  }

  let owned: { bookSlug: string; format: string; status: string }[] = [];
  if (userId || email) {
    try {
      owned = await prismaBookStore().listActive({ userId, email });
    } catch (err) {
      console.error('[press] library lookup skipped', err);
    }
  }

  const chapters = book.files.filter((f) => f.kind === 'mp3').map((file) => ({
    id: file.id,
    label: file.label,
    canPlay: Boolean(file.sample) || hasBookAccess(owned, book.slug, 'audiobook'),
  }));
  const offers = book.offers.filter((o) => bookFormatAllowed(o.format));

  return (
    <PressFrame signedIn={signedIn}>
      <p className="mt-6 text-xs text-white/40">
        <Link href="/press" className="hover:text-white">Press</Link>
        <span> / {book.title}</span>
      </p>
      {searchParams.checkout === 'cancel' ? (
        <p className="mt-4 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
          Checkout cancelled. Nothing was charged.
        </p>
      ) : null}
      <div className="mt-4 grid gap-6 md:grid-cols-[220px_1fr]">
        <BookCover title={book.title} tall />
        <div>
          {book.eyebrow ? <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">{book.eyebrow}</p> : null}
          {book.track ? <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">{book.track}</p> : null}
          <h2 className="fel-heading text-4xl text-white">{book.title}</h2>
          <p className="mt-2 text-sm text-white/60">{book.description}</p>
          {book.chaptersArePlaceholder ? (
            <p className="mt-2 text-[11px] text-white/35">Audio masters are pending inventory, so audiobook checkout is disabled for this title.</p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid max-w-xs gap-3">
        {offers.map((offer) => (
          <OfferCard key={offer.id} book={book} offer={offer} prominent />
        ))}
      </div>
      <div className="mt-3">
        <KindleLink book={book} />
      </div>

      <div className="mt-8">
        <AudioPlayer bookSlug={book.slug} bookTitle={book.title} chapters={chapters} />
      </div>
    </PressFrame>
  );
}
