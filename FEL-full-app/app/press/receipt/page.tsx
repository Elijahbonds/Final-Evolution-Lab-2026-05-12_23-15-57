import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { formatLabel, getBook, getOffer } from '@/lib/books/bookCatalog';
import { assertStripeTestKey, bookStripeSecret, getBookStripe } from '@/lib/books/bookCheckout';
import { mintReaderGrant, normalizeBookEmail } from '@/lib/books/bookEntitlements';
import { prismaBookStore } from '@/lib/books/bookStore';
import { PressFrame } from '@/components/press/press-frame';
import { AudioPlayer } from '@/components/press/audio-player';
import { DownloadButton } from '@/components/press/download-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Receipt — Final Evolution Press' };

export default async function ReceiptPage({ searchParams }: { searchParams: { session_id?: string } }) {
  let signedIn = false;
  try {
    const session = await getServerSession(authOptions);
    signedIn = Boolean((session?.user as { id?: string } | undefined)?.id);
  } catch {
    signedIn = false;
  }

  const sessionId = searchParams.session_id?.slice(0, 200) || '';
  if (!sessionId) {
    return (
      <PressFrame signedIn={signedIn}>
        <h2 className="fel-heading mt-8 text-3xl">Receipt</h2>
        <p className="mt-3 text-sm text-white/60">This page needs the checkout session from Stripe.</p>
        <Link href="/press" className="mt-4 inline-block text-sm text-[#F5C518]">Back to the catalog</Link>
      </PressFrame>
    );
  }

  let paid = false;
  let email = '';
  let offerId = '';
  let amount: number | null = null;
  let currency = 'usd';
  let lookupError: string | null = null;
  try {
    assertStripeTestKey(bookStripeSecret());
    const checkout = await getBookStripe().checkout.sessions.retrieve(sessionId);
    paid = checkout.payment_status === 'paid' || checkout.payment_status === 'no_payment_required';
    email = normalizeBookEmail(checkout.customer_details?.email || checkout.customer_email || '');
    offerId = checkout.metadata?.offerId || '';
    amount = checkout.amount_total;
    currency = checkout.currency || 'usd';
    if (checkout.metadata?.product !== 'BOOK') lookupError = 'That payment is not a book purchase.';
  } catch (err) {
    console.error('[press/receipt]', err instanceof Error ? err.message : err);
    lookupError = 'Checkout could not be confirmed from here. If you were charged, the receipt email from Stripe is the record.';
  }

  const offer = getOffer(offerId);
  const book = offer ? getBook(offer.bookSlug) : undefined;
  let entitled = false;
  if (email && offer && !lookupError) {
    try {
      const rows = await prismaBookStore().listActive({ email });
      entitled = rows.some((row) => row.bookSlug === offer.bookSlug && (row.format === offer.format || row.format === 'bundle'));
    } catch (err) {
      console.error('[press/receipt] entitlement', err instanceof Error ? err.message : err);
    }
  }

  const secret = process.env.NEXTAUTH_SECRET || '';
  const grant = entitled && email && secret ? mintReaderGrant(secret, email) : null;
  const chapters = book && offer && (offer.format === 'audiobook' || offer.format === 'bundle')
    ? book.files.filter((f) => f.kind === 'mp3').map((file) => ({ id: file.id, label: file.label, canPlay: entitled }))
    : [];
  const downloads = book && entitled && (offer?.format === 'ebook' || offer?.format === 'bundle')
    ? book.files.filter((f) => f.kind !== 'mp3')
    : [];

  return (
    <PressFrame signedIn={signedIn}>
      <h2 className="fel-heading mt-8 text-4xl">Receipt</h2>
      {lookupError ? <p className="mt-4 max-w-lg text-sm text-[#ffb4b4]">{lookupError}</p> : null}
      {!lookupError && paid ? (
        <div className="mt-4 max-w-xl rounded-2xl border border-white/10 bg-[#101010] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#F5C518]">Payment received</p>
          <p className="mt-2 text-xl text-white">{book?.title ?? 'Book'}</p>
          <p className="text-sm text-white/55">{offer ? formatLabel(offer.format) : 'Purchase'}</p>
          {amount != null ? (
            <p className="mt-2 font-mono text-sm text-white/80">
              {(amount / 100).toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase() })}
            </p>
          ) : null}
          {email ? <p className="mt-2 text-sm text-white/55">Receipt email: {email}</p> : null}
          <p className="mt-3 text-sm text-white/60">
            {entitled
              ? 'The book is on this email. Log in with it and it stays in My Library.'
              : 'Stripe has the payment. The library updates when the webhook lands — refresh in a moment.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={signedIn ? '/press/library' : '/login'} className="rounded-md bg-[#F5C518] px-4 py-2 text-sm font-semibold text-black">
              {signedIn ? 'My Library' : 'Log in to My Library'}
            </Link>
            {book ? <Link href={`/press/${book.slug}`} className="self-center text-sm text-white/60 hover:text-white">Back to the book</Link> : null}
          </div>
        </div>
      ) : null}
      {!lookupError && !paid ? (
        <p className="mt-4 text-sm text-white/60">This checkout is not paid yet.</p>
      ) : null}

      {grant && book && chapters.length > 0 ? (
        <div className="mt-6">
          <AudioPlayer bookSlug={book.slug} bookTitle={book.title} chapters={chapters} grant={grant} />
        </div>
      ) : null}
      {grant && book && downloads.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {downloads.map((file) => (
            <DownloadButton key={file.id} bookSlug={book.slug} fileId={file.id} label={`Download ${file.label}`} grant={grant} />
          ))}
        </div>
      ) : null}
    </PressFrame>
  );
}
