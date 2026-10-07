import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { BookForm } from '@/components/coach-store/book-form';
import { isMissingTable, logStoreUnavailable } from '@/lib/coach-store/gate';
import { parseManifest } from '@/lib/coach-store/manifest';
import { continueLabel, listingPriceLabel } from '@/lib/coach-store/priceLabel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Book' };

export default async function BookPage({ params }: { params: { slug: string; listingId: string } }) {
  if (!isCoachStoreEnabled()) notFound();
  let listing: Awaited<ReturnType<typeof prisma.marketplaceListing.findUnique>> = null;
  try {
    listing = await prisma.marketplaceListing.findUnique({ where: { id: params.listingId } });
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    logStoreUnavailable();
    return <main className="px-4 py-8 text-white">Coach store is not set up yet.</main>;
  }
  const manifest = listing ? parseManifest(listing.manifest) : null;
  if (!listing || !manifest) notFound();
  const kind = manifest.kind;
  const durationMin = manifest.kind === 'live_1on1' ? manifest.durationMin : 30;
  const audience = manifest.kind === 'membership' ? manifest.audience : undefined;
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-black text-white">{listing.title}</h1>
      <p className="mb-4 text-sm font-bold text-white">{listingPriceLabel(listing.priceUsd, manifest)}</p>
      <BookForm slug={params.slug} listingId={listing.id} kind={kind} durationMin={durationMin} audience={audience} continueLabel={continueLabel(listing.priceUsd, manifest)} />
    </main>
  );
}
