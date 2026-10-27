import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { isCoachMarketplaceEnabled } from '@/lib/coach-business/config';
import { paymentsLive } from '@/lib/coach-business/connect';
import { packagePriceLabel } from '@/lib/coach-business/packages';
import { businessReady, packageById } from '@/lib/coach-business/store';
import { rawDb } from '@/lib/coach-business/server';
import { BookButton } from '@/components/coach-business/package-actions';

export const dynamic = 'force-dynamic';

/**
 * COACH-DELIVERY COA-12 (2026-10-27): a team fee's own page — the link a coach's "Team fee" message carries
 * (lib/coach-business/teamFee.ts). Not listed anywhere else. The payment is the normal package checkout (the buyer's
 * terms tick, 18+, FEL's 5% + the processing fee). A 404 while the coach's page is (both store switches off), for a
 * package that is not this coach's active team fee, and before the coach-business SQL.
 */
export default async function TeamFeePage({ params }: { params: { slug: string; packageId: string } }) {
  if (!isCoachStoreEnabled() && !isCoachMarketplaceEnabled()) notFound();
  const instructor = await prisma.instructor.findUnique({ where: { slug: params.slug }, select: { userId: true, displayName: true, published: true } }).catch(() => null);
  if (!instructor?.published) notFound();
  const db = rawDb();
  if (!(await businessReady(db))) notFound();
  const pkg = await packageById(db, params.packageId).catch(() => null);
  if (!pkg || pkg.coachId !== instructor.userId || pkg.kind !== 'team_fee' || !pkg.active) notFound();
  const live = paymentsLive();
  return (
    <main className="mx-auto max-w-xl px-4 py-10 text-white">
      <p className="text-xs font-bold uppercase tracking-wider text-white/50">Team fee · {instructor.displayName}</p>
      <h1 className="mt-1 text-2xl font-bold">{pkg.title}</h1>
      {pkg.summary ? <p className="mt-2 text-sm text-white/70">{pkg.summary}</p> : null}
      <p className="mt-3 text-lg font-bold">{packagePriceLabel(pkg.priceCents, pkg.kind)} <span className="text-sm font-normal text-white/50">plus a card processing fee</span></p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/70">{pkg.includes.map((i) => <li key={i}>{i}</li>)}</ul>
      <div className="mt-6">
        {live ? <BookButton slug={params.slug} packageId={pkg.id} /> : <p className="text-sm text-amber-200">Payments aren&apos;t live yet. Your coach will tell you another way to pay.</p>}
        <p className="mt-3 text-xs text-white/45">Payments are for adults (18+). Under 18? A parent or guardian pays.</p>
      </div>
    </main>
  );
}
