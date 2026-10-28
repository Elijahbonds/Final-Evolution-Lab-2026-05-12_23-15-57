import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { SITE_ORIGIN } from '@/lib/seo/publicPages';
import { isCoachMarketplaceEnabled } from '@/lib/coach-business/config';
import { filterCoaches, goalLabel, parseMarketQuery, sportLabel } from '@/lib/coach-business/market';
import { loadMarketCards } from '@/lib/coach-business/marketServer';
import { reviewSummaries } from '@/lib/coach-business/reviews';
import type { RawDb } from '@/lib/coach-business/store';
import { MarketplaceView } from '@/components/coach-business/marketplace-view';

export const dynamic = 'force-dynamic';

// COACH-BUSINESS (2026-10-25): find a coach. A 404 while COACH_MARKETPLACE_ENABLED is off (the default).
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const q = parseMarketQuery(searchParams ?? {});
  const what = [q.sport ? sportLabel(q.sport) : null, q.goal ? goalLabel(q.goal) : null].filter(Boolean).join(', ');
  const title = what ? `${what} coaches · Final Evolution` : 'Find a coach · Final Evolution';
  const description = 'Find a coach for your sport and goal: online coaching, session packs, video review and programs on Final Evolution.';
  return {
    title,
    description,
    alternates: { canonical: `${SITE_ORIGIN}/coaches` },
    robots: { index: true, follow: true },
    openGraph: { type: 'website', url: `${SITE_ORIGIN}/coaches`, title, description, images: ['/og-image.png'] },
  };
}

export default async function CoachesPage({ searchParams }: { searchParams: Search }) {
  if (!isCoachMarketplaceEnabled()) notFound();
  const q = parseMarketQuery(searchParams ?? {});
  let cards = null;
  try {
    cards = await loadMarketCards(prisma as unknown as RawDb);
    // COACH-DELIVERY COA-10: each coach's shown client reviews (count and average); nothing before the pending SQL
    if (cards?.length) {
      const ids = await prisma.instructor.findMany({ where: { slug: { in: cards.map((c) => c.slug) } }, select: { slug: true, userId: true } });
      const sums = await reviewSummaries(prisma as unknown as RawDb, ids.map((i) => i.userId));
      cards = cards.map((c) => ({ ...c, rating: sums.get(ids.find((i) => i.slug === c.slug)?.userId ?? '') ?? null }));
    }
  } catch (e) {
    console.warn('[coach-business] marketplace read failed', e instanceof Error ? e.name : typeof e);
  }
  return (
    <div className="min-h-screen bg-[#050505]">
      <MarketplaceView q={q} cards={cards ? filterCoaches(cards, q) : []} ready={cards !== null} />
    </div>
  );
}
