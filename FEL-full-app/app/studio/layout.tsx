import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { isNexusStudioEnabled } from '@/lib/flags';

export const dynamic = 'force-dynamic';

/**
 * /studio — Nexus Studio (docs/NEXUS-STUDIO.md). Held: unlinked (lib/nav/reachability.test.ts) and behind
 * NEXUS_STUDIO_ENABLED (default off → a 404 for everyone, before the login check, so a guest learns nothing either).
 */
export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isNexusStudioEnabled()) notFound();
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/studio'));

  return <>{children}</>;
}
