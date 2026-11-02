import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { isNexusStudioEnabled } from '@/lib/flags';
import { prisma } from '@/lib/db';
import { studioAudienceOk } from '@/lib/nexus-studio/audience';

export const dynamic = 'force-dynamic';

/**
 * /studio — Nexus Studio (docs/NEXUS-STUDIO.md). Held: unlinked (lib/nav/reachability.test.ts) and behind
 * NEXUS_STUDIO_ENABLED (default off → a 404 for everyone, before the login check, so a guest learns nothing either).
 * NEX-01 (owner 2026-10-20, "owner first (admin)"): signed in is not enough — the account's role, read from the DATABASE on
 * every request, must be in the Studio's audience (lib/nexus-studio/audience.ts: founder, admin). Anyone else gets the same 404.
 */
export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isNexusStudioEnabled()) notFound();
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/studio'));
  const userId = (session.user as { id?: string } | undefined)?.id ?? null;
  if (!(await studioAudienceOk(prisma, userId))) notFound();

  return <>{children}</>;
}
