import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBook } from '@/lib/books/bookCatalog';
import { bookFormatAllowed } from '@/lib/books/bookTerms';
import { claimBookEntitlements, hasBookAccess, normalizeBookEmail, type OwnedOffer } from '@/lib/books/bookEntitlements';
import { bookShopClosedReason } from '@/lib/books/bookShop';
import { prismaBookStore } from '@/lib/books/bookStore';
import { prisma } from '@/lib/db';
import { isVerifiedAdult } from '@/lib/coach-store/adult';
import { PressFrame } from '@/components/press/press-frame';
import { AudioPlayer } from '@/components/press/audio-player';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My Library — Final Evolution Press' };

const UNAVAILABLE = 'The library is unavailable right now.';

export default async function LibraryPage() {
  let session: { user?: { id?: string; email?: string | null } } | null = null;
  try {
    const loaded = await getServerSession(authOptions);
    session = loaded?.user ? { user: loaded.user as { id?: string; email?: string | null } } : null;
  } catch {
    session = null;
  }
  const userId = session?.user?.id ?? null;
  const email = session?.user?.email ? normalizeBookEmail(session.user.email) : null;

  if (!userId) {
    return (
      <PressFrame signedIn={false}>
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5C518]">My Library</h2>
          <div className="mt-3 rounded-2xl border border-white/10 bg-[#101010] p-6">
            <p className="text-lg text-white">Log in to listen to your books.</p>
            <p className="mt-2 max-w-lg text-sm text-white/55">
              Audiobooks are for signed-in, verified adults (18+). Sign in with the account you bought with.
            </p>
            <Link href="/login" className="mt-4 inline-block rounded-md bg-[#F5C518] px-4 py-2 text-sm font-semibold text-black">
              Log in
            </Link>
          </div>
        </section>
      </PressFrame>
    );
  }

  // Listening sits behind the same switches and the same 18+ check as the stream route (app/api/books/stream).
  if (bookShopClosedReason()) {
    return (
      <PressFrame signedIn>
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5C518]">My Library</h2>
          <p className="mt-4 text-sm text-white/60" role="status">{UNAVAILABLE}</p>
        </section>
      </PressFrame>
    );
  }
  let adult = false;
  try {
    adult = await isVerifiedAdult(prisma, userId);
  } catch (err) {
    console.error('[press/library] age check failed', err);
  }
  if (!adult) {
    return (
      <PressFrame signedIn>
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5C518]">My Library</h2>
          <p className="mt-4 max-w-lg text-sm text-white/60" role="status">
            Audiobooks are for verified adults (18+). If you&apos;re 18 or older,{' '}
            <Link className="font-semibold text-[#F5C518] underline" href="/age?next=%2Fpress%2Flibrary">confirm your birth year</Link>, then come back.
          </p>
        </section>
      </PressFrame>
    );
  }

  let rows: OwnedOffer[] = [];
  let failed = false;
  try {
    const store = prismaBookStore();
    if (email) await claimBookEntitlements(store, userId, email);
    rows = await store.listActive({ userId, email });
  } catch (err) {
    console.error('[press/library]', err);
    failed = true;
  }

  // Audiobooks only (lib/books/bookTerms.ts): a row for a format the store terms do not cover shows nothing.
  const audioRows = bookFormatAllowed('audiobook') ? rows : [];
  const slugs = [...new Set(audioRows.filter((row) => hasBookAccess([row], row.bookSlug, 'audiobook')).map((row) => row.bookSlug))];
  const books = slugs.map((slug) => ({ slug, book: getBook(slug), rows: audioRows.filter((row) => row.bookSlug === slug) }));

  return (
    <PressFrame signedIn>
      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5C518]">My Library</h2>
        <p className="mt-2 text-sm text-white/55">{email}</p>
        {failed ? (
          <p className="mt-4 text-sm text-[#ff8b8b]">{UNAVAILABLE}</p>
        ) : null}
        {!failed && books.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-[#101010] p-6">
            <p className="text-white">No audiobooks on this account yet.</p>
            <Link href="/press" className="mt-3 inline-block text-sm font-semibold text-[#F5C518] hover:underline">Browse the catalog</Link>
          </div>
        ) : null}
        <div className="mt-4 space-y-6">
          {books.map(({ slug, book, rows: owned }) => {
            if (!book) {
              return (
                <p key={slug} className="text-sm text-white/50">A purchase for “{slug}” is on the account, but that title is no longer in the catalog.</p>
              );
            }
            const chapters = book.files.filter((f) => f.kind === 'mp3').map((file) => ({
              id: file.id,
              label: file.label,
              canPlay: hasBookAccess(owned, book.slug, 'audiobook'),
            }));
            return (
              <article key={slug} className="rounded-2xl border border-white/10 bg-[#101010] p-4">
                <h3 className="text-lg font-semibold text-white">
                  <Link href={`/press/${book.slug}`} className="hover:underline">{book.title}</Link>
                </h3>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-white/40">Audiobook · stream only</p>
                <div className="mt-4">
                  <AudioPlayer bookSlug={book.slug} bookTitle={book.title} chapters={chapters} />
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </PressFrame>
  );
}
