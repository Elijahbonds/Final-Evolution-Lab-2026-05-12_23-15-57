import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { isBinjgbShelfEnabled } from '@/lib/flags';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { shelfAccess } from '@/lib/binjgb/gate';
import { shelfTitle } from '@/lib/binjgb/manifest';
import { HomebrewShelf } from '@/components/binjgb/homebrew-shelf';

export const dynamic = 'force-dynamic';

/**
 * BINJGB-SHELF-1 — a shelf title's player. v1 ships ZERO titles (OQ-10), so every slug is a 404 — but only AFTER the same
 * flag, session and server age gate as the shelf (T-SHELF-U13-ROUTE, Cyber F-A nit): under 13 → 404, unknown age → the
 * age prompt. A future title needs a new Elijah card plus a Cyber review before this ever renders a player.
 */
export default async function HomebrewTitlePage({ params }: { params: { slug: string } }) {
  if (!isBinjgbShelfEnabled()) notFound();
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) redirect(loginPath('/play/gb-shelf'));
  const access = shelfAccess({ shelfOn: true, localOn: false, dobYear: await readDobYear(prisma, me, 'gb_shelf_title') });
  if (access.kind === 'not-found') notFound();
  if (access.kind === 'age-prompt') return <HomebrewShelf titles={[]} agePrompt picker={false} />;
  if (!shelfTitle(params.slug)) notFound();
  // Unreachable in v1 (no titles). No shelf-title player ships until a new Elijah card + Cyber review.
  notFound();
}
