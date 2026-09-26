import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBook } from '@/lib/books/bookCatalog';
import { claimBookEntitlements, hasBookAccess, normalizeBookEmail, type OwnedOffer } from '@/lib/books/bookEntitlements';
import { prismaBookStore } from '@/lib/books/bookStore';
import { PressFrame } from '@/components/press/press-frame';
import { AudioPlayer } from '@/components/press/audio-player';
import { DownloadButton } from '@/components/press/download-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My Library — Final Evolution Press' };

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
            <p className="text-lg text-white">Log in to see your books.</p>
            <p className="mt-2 max-w-lg text-sm text-white/55">
              Guest checkouts are tied to the email Stripe collected. Sign in with that address and the books move onto this account.
            </p>
            <Link href="/login" className="mt-4 inline-block rounded-md bg-[#F5C518] px-4 py-2 text-sm font-semibold text-black">
              Log in
            </Link>
          </div>
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

  const slugs = [...new Set(rows.map((row) => row.bookSlug))];
  const books = slugs.map((slug) => ({ slug, book: getBook(slug), rows: rows.filter((row) => row.bookSlug === slug) }));

  return (
    <PressFrame signedIn>
      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5C518]">My Library</h2>
        <p className="mt-2 text-sm text-white/55">{email}</p>
        {failed ? (
          <p className="mt-4 text-sm text-[#ff8b8b]">The library could not be loaded. The database may be offline.</p>
        ) : null}
        {!failed && books.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-[#101010] p-6">
            <p className="text-white">No books on this account yet.</p>
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
            const downloads = book.files.filter((f) => f.kind !== 'mp3' && hasBookAccess(owned, book.slug, 'ebook'));
            return (
              <article key={slug} className="rounded-2xl border border-white/10 bg-[#101010] p-4">
                <h3 className="text-lg font-semibold text-white">
                  <Link href={`/press/${book.slug}`} className="hover:underline">{book.title}</Link>
                </h3>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-white/40">
                  {owned.map((row) => row.format).join(' · ')}
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {hasBookAccess(owned, book.slug, 'audiobook') ? (
                    <AudioPlayer bookSlug={book.slug} bookTitle={book.title} chapters={chapters} />
                  ) : (
                    <p className="text-sm text-white/45">No audiobook on this purchase.</p>
                  )}
                  <div>
                    {downloads.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {downloads.map((file) => (
                          <DownloadButton key={file.id} bookSlug={book.slug} fileId={file.id} label={`Download ${file.label}`} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-white/45">No ebook files on this purchase.</p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </PressFrame>
  );
}
