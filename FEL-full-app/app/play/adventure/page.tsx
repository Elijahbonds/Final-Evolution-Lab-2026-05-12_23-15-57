import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AdventureLoader } from './loader';

export const dynamic = 'force-dynamic';

/**
 * ADVENTURE PHASE B (2026-10-07): the story — the hub and Chapter 1 (placeholder story until the owner's chapters).
 *
 * UNLISTED (owner decision, 2026-10-06: new routes are reachable by URL, noindex, linked from no menu, picker or sitemap
 * until the owner says otherwise): /dev/adventure's pattern. No sign-in wall: a guest plays on the device save; a
 * signed-in player's save policy comes from the closet (a teen's save never leaves the device).
 * host/hiddenRoute.test.ts holds it: served, noindex, and nothing links to it.
 *
 * Query: ?demo=1 (the headless Chapter 1 script plays it live), ?seed=N.
 */
export const metadata: Metadata = {
  title: 'The Adventure [PLACEHOLDER]',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function PlayAdventurePage() {
  let signedIn = false;
  try { signedIn = !!(await getServerSession(authOptions))?.user; } catch { signedIn = false; }
  return <AdventureLoader signedIn={signedIn} />;
}
