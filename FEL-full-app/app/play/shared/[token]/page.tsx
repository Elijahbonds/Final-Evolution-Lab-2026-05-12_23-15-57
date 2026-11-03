import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { isStudioShareEnabled } from '@/lib/flags';
import type { RawDb } from '@/lib/coach/pendingSchema';
import { openShareLink, shareRoute } from '@/lib/nexus-studio/share';
import { targetOf } from '@/lib/nexus-studio/targets';
import { SharedVenueLanding } from '@/components/nexus-studio/shared-venue-landing';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

/**
 * /play/shared/[token] — NEX-06: a Studio venue shared by link (lib/nexus-studio/share.ts). STUDIO_SHARE_ENABLED off: a 404. Signed
 * out: the login round trip (owner Q5: signed-in players open links). A revoked, taken-down, unknown or malformed link, or one
 * whose table is not there yet, is the same 404. HELD in lib/nav/reachability.test.ts: a link is unlisted and opened from outside.
 */
export default async function SharedVenuePage({ params }: { params: { token: string } }) {
  if (!isStudioShareEnabled()) notFound();
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath(`/play/shared/${encodeURIComponent(params.token)}`));
  const r = await openShareLink(prisma as unknown as RawDb, params.token);
  if (!r.ok || !r.value) notFound();
  const link = r.value;
  const route = shareRoute(link.mode, link.id);
  const t = targetOf(link.mode);
  if (!route || !t) notFound();
  return <SharedVenueLanding id={link.id} venueName={link.venueName} creatorName={link.creatorName} modeLabel={t.label} route={route} venue={link.venue} />;
}
