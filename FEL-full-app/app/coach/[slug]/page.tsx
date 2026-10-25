import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { isMissingTable, logStoreUnavailable, reviewsCanBeSold } from '@/lib/coach-store/gate';
import { parseManifest } from '@/lib/coach-store/manifest';
import { listingPriceLabel } from '@/lib/coach-store/priceLabel';
import { SCREEN_CONTACT_EMAIL } from '@/lib/screen/copy';
import { isTestKey } from '@/lib/coach-store/stripeMode';
import { SITE_ORIGIN } from '@/lib/seo/publicPages';
import { isCoachMarketplaceEnabled } from '@/lib/coach-business/config';
import { profileDescription, profileJsonLd, type PublicProfile } from '@/lib/coach-business/profile';
import { loadBusinessSection } from '@/lib/coach-business/profileServer';
import { rawDb } from '@/lib/coach-business/server';
import { CoachProfileView, type StoreListingCard } from '@/components/coach-business/coach-profile-view';

export const dynamic = 'force-dynamic';

// COACH-BUSINESS (2026-10-25): the coach's public page — bio, specialties, client-approved results (adults only, text
// only), packages with Book or Apply, and the coach store's own listings as before. Open while the coach store OR the
// marketplace switch is on; a 404 while both are off (the store's rule until now). No minor's data is read for it:
// lib/coach-business/profileServer.ts says what is.

function pageOn(): boolean {
  return isCoachStoreEnabled() || isCoachMarketplaceEnabled();
}

async function publishedInstructor(slug: string) {
  const i = await prisma.instructor.findUnique({ where: { slug } });
  return i && i.published ? i : null;
}

function toProfile(i: { slug: string; displayName: string; headline: string | null; bio: string | null; specialties: string[]; certifications: string[] }): PublicProfile {
  return { slug: i.slug, displayName: i.displayName, headline: i.headline, bio: i.bio, specialties: i.specialties ?? [], certifications: i.certifications ?? [] };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const fallback: Metadata = {
    title: 'Coach · Final Evolution',
    description: 'Coaching, programs and video review on Final Evolution.',
    robots: { index: false, follow: true },
  };
  if (!pageOn()) return fallback;
  try {
    const i = await publishedInstructor(params.slug);
    if (!i) return fallback;
    const profile = toProfile(i);
    const url = `${SITE_ORIGIN}/coach/${i.slug}`;
    const description = profileDescription(profile);
    return {
      title: `${i.displayName} · Coach · Final Evolution`,
      description,
      alternates: { canonical: url },
      robots: { index: true, follow: true },
      openGraph: { type: 'profile', url, title: `${i.displayName} · Coach`, description, images: ['/og-image.png'] },
      twitter: { card: 'summary', title: `${i.displayName} · Coach`, description },
    };
  } catch {
    return fallback;
  }
}

export default async function CoachStorePage({ params }: { params: { slug: string } }) {
  if (!pageOn()) notFound();
  const storeOn = isCoachStoreEnabled();
  const marketOn = isCoachMarketplaceEnabled();
  try {
    const instructor = await publishedInstructor(params.slug);
    if (!instructor) notFound();
    let store: { listings: StoreListingCard[]; lines: string[] } | null = null;
    if (storeOn) {
      const listings = await prisma.marketplaceListing.findMany({
        where: { creatorId: instructor.userId, listingType: 'COACH_STORE', active: true },
      });
      const cards = listings.flatMap((listing) => {
        const manifest = parseManifest(listing.manifest);
        if (!manifest) return [];
        const soon = manifest.kind === 'program' && manifest.lane !== 'dunking';
        const reviewClosed = manifest.kind === 'video_review' && !reviewsCanBeSold();
        // NP-1: an unbuilt or closed listing is hidden, never labelled.
        if (soon || reviewClosed) return [];
        const href = manifest.kind === 'program'
          ? `/coach/${instructor.slug}/programs/${manifest.lane}`
          : `/coach/${instructor.slug}/book/${listing.id}`;
        return [{ id: listing.id, title: listing.title, description: listing.description, priceLabel: listingPriceLabel(listing.priceUsd, manifest), href }];
      });
      store = {
        listings: cards,
        lines: [
          `Seller of record: Final Evolution LLC. ${SCREEN_CONTACT_EMAIL}`,
          ...(instructor.businessMailingAddress ? [instructor.businessMailingAddress] : []),
          'FEL keeps 15%. Stripe\'s card fee comes out of the coach\'s share. You pay one price.',
          `Free cancel or reschedule until ${instructor.clientFullRefundHours} hours before the start. Inside that window there is no refund and one free reschedule.`,
        ],
      };
    }
    const business = await loadBusinessSection(rawDb(), instructor.userId);
    const profile = toProfile(instructor);
    const jsonLd = profileJsonLd(profile, (business?.packages ?? []).filter((k) => k.action !== null), `${SITE_ORIGIN}/coach/${instructor.slug}`);
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
        <CoachProfileView
          profile={profile}
          sports={business?.sports ?? []}
          goals={business?.goals ?? []}
          highlights={business?.highlights ?? []}
          packages={business?.packages ?? []}
          store={store}
          paymentsLive={business?.paymentsLive ?? false}
          testMode={isTestKey(process.env.STRIPE_SECRET_KEY)}
          acceptingClients={business?.acceptingClients ?? true}
          marketOn={marketOn && !!business}
        />
      </>
    );
  } catch (err) {
    if (isMissingTable(err)) {
      logStoreUnavailable();
      return <main className="mx-auto max-w-xl px-4 py-16 text-white">Coach store is not set up yet.</main>;
    }
    throw err;
  }
}
