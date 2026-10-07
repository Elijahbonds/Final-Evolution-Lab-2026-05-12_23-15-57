import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { isMissingTable, logStoreUnavailable, reviewsCanBeSold } from '@/lib/coach-store/gate';
import { parseManifest } from '@/lib/coach-store/manifest';
import { listingPriceLabel } from '@/lib/coach-store/priceLabel';
import { SCREEN_CONTACT_EMAIL } from '@/lib/screen/copy';
import { isTestKey } from '@/lib/coach-store/stripeMode';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  return {
    title: `Coach ${params.slug} · Final Evolution`,
    description: 'Live 1:1 coaching, the dunking program, and video review with Final Evolution.',
    robots: { index: true, follow: true },
    openGraph: { images: ['/og-image.png'], title: `Coach ${params.slug}` },
  };
}

export default async function CoachStorePage({ params }: { params: { slug: string } }) {
  if (!isCoachStoreEnabled()) notFound();
  try {
    const instructor = await prisma.instructor.findUnique({ where: { slug: params.slug } });
    if (!instructor || !instructor.published) notFound();
    const listings = await prisma.marketplaceListing.findMany({
      where: { creatorId: instructor.userId, listingType: 'COACH_STORE', active: true },
    });
    const cards = listings.flatMap((listing) => {
      const manifest = parseManifest(listing.manifest);
      if (!manifest) return [];
      return [{ listing, manifest }];
    });
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-white">
        {isTestKey(process.env.STRIPE_SECRET_KEY) ? (
          <p className="mb-4 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm">TEST MODE. Card 4242 4242 4242 4242.</p>
        ) : null}
        <p className="text-xs uppercase tracking-widest text-white/50">Final Evolution</p>
        <h1 className="mt-1 text-3xl font-black">{instructor.displayName}</h1>
        {instructor.headline ? <p className="mt-2 text-white/80">{instructor.headline}</p> : null}
        {instructor.affiliationLine ? <p className="mt-1 text-sm text-white/60">{instructor.affiliationLine}</p> : null}
        {instructor.bio ? <p className="mt-4 text-sm leading-relaxed text-white/75">{instructor.bio}</p> : null}
        <p className="mt-3 text-sm text-white/60">Seller of record: Final Evolution LLC. {SCREEN_CONTACT_EMAIL}</p>
        {instructor.businessMailingAddress ? <p className="text-sm text-white/60">{instructor.businessMailingAddress}</p> : null}
        <p className="mt-2 text-sm text-white/70">FEL keeps 15%. Stripe&apos;s card fee comes out of the coach&apos;s share. You pay one price.</p>
        <p className="mt-1 text-sm text-white/60">Free cancel or reschedule until {instructor.clientFullRefundHours} hours before the start. Inside that window there is no refund and one free reschedule.</p>
        <ul className="mt-6 space-y-3">
          {cards.map(({ listing, manifest }) => {
            const soon = manifest.kind === 'program' && manifest.lane !== 'dunking';
            const reviewClosed = manifest.kind === 'video_review' && !reviewsCanBeSold();
            const href = manifest.kind === 'program'
              ? `/coach/${instructor.slug}/programs/${manifest.lane}`
              : `/coach/${instructor.slug}/book/${listing.id}`;
            return (
              <li key={listing.id} className="rounded-2xl border border-white/10 p-4">
                <h2 className="font-bold">{listing.title}</h2>
                <p className="text-sm text-white/60">{listing.description}</p>
                <p className="mt-2 text-sm font-bold">{listingPriceLabel(listing.priceUsd, manifest)}</p>
                {soon || reviewClosed ? <p className="mt-2 text-sm">Coming soon</p> : (
                  <Link href={href} className="mt-3 inline-block rounded-xl bg-cyan-300 px-3 py-2 text-sm font-bold text-black">View</Link>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    );
  } catch (err) {
    if (isMissingTable(err)) {
      logStoreUnavailable();
      return <main className="mx-auto max-w-xl px-4 py-16 text-white">Coach store is not set up yet.</main>;
    }
    throw err;
  }
}
