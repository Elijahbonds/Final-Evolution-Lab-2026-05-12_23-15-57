import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { DUNK_PROGRAM_STATUS, DUNK_WEEKS } from '@/lib/coach-store/dunkProgram';
import { parseManifest } from '@/lib/coach-store/manifest';
import { continueLabel, listingPriceLabel } from '@/lib/coach-store/priceLabel';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { slug: string; lane: string } }): Metadata {
  const title = params.lane === 'dunking' ? 'Dunking & Plyometrics' : params.lane === 'posture' ? 'Static & Dynamic Posture' : 'Correctives';
  return {
    title: `${title} · Final Evolution`,
    description: 'A coaching program from Final Evolution.',
    robots: { index: params.lane === 'dunking', follow: true },
    openGraph: { images: ['/og-image.png'], title },
  };
}

export default async function ProgramProductPage({ params }: { params: { slug: string; lane: string } }) {
  if (!isCoachStoreEnabled()) notFound();
  if (!['dunking', 'correctives', 'posture'].includes(params.lane)) notFound();
  const coming = params.lane !== 'dunking';
  let listing: { id: string; priceUsd: number; manifest: string } | null = null;
  if (!coming) {
    const instructor = await prisma.instructor.findUnique({ where: { slug: params.slug } });
    if (instructor?.published) {
      const listings = await prisma.marketplaceListing.findMany({ where: { creatorId: instructor.userId, listingType: 'COACH_STORE', active: true } });
      listing = listings.find((row) => {
        const manifest = parseManifest(row.manifest);
        return manifest?.kind === 'program' && manifest.lane === 'dunking';
      }) ?? null;
    }
  }
  const manifest = listing ? parseManifest(listing.manifest) : null;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-white">
      <h1 className="text-3xl font-black">{params.lane === 'dunking' ? 'Dunking & Plyometrics' : params.lane === 'posture' ? 'Static & Dynamic Posture' : 'Correctives'}</h1>
      {coming ? <p className="mt-4">Coming soon. No checkout on this program yet.</p> : (
        <>
          <p className="mt-3 text-sm text-white/70">Eight weeks. Lifetime access once bought. Re-screens on days 14, 28, 42 and 56. {DUNK_PROGRAM_STATUS}.</p>
          <p className="mt-2 text-sm text-white/60">Your original clip is deleted 30 days after your review, on the video-review product. This program does not upload video.</p>
          <ol className="mt-4 space-y-2 text-sm">
            {DUNK_WEEKS.map((w) => <li key={w.week}>Week {w.week}: {w.title}</li>)}
          </ol>
          {listing && manifest ? <p className="mt-4 text-sm font-bold">{listingPriceLabel(listing.priceUsd, manifest)}</p> : null}
          {listing && manifest ? <Link className="mt-2 inline-block rounded-xl bg-cyan-300 px-3 py-2 text-sm font-bold text-black" href={`/coach/${params.slug}/book/${listing.id}`}>{continueLabel(listing.priceUsd, manifest)}</Link> : <p className="mt-6 text-sm">Price not published yet.</p>}
        </>
      )}
    </main>
  );
}
