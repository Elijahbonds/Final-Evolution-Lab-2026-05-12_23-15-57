import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AdventureBRLoader } from './loader';

export const dynamic = 'force-dynamic';

/**
 * ADVENTURE C (2026-10-07): The Adventure's Battle Royale, offline with bots (docs/ADVENTURE-PLAN.md Phase C).
 *
 * UNLISTED (owner rule, 2026-10-06: new routes are reachable by URL, noindex, linked from no menu, picker or sitemap
 * until the owner says otherwise) — the /dev/adventure pattern. host/hiddenRoute.test.ts holds both halves for this
 * route too: it is served and noindex, and nothing links to it. No sign-in is needed: the match is offline, reads the
 * device save only for your style and partner, and pays nothing yet (no session route row for the BR).
 *
 * Query: ?duo=1 (duos: a bot teammate) with ?seat=partner (your partner fights as your teammate), ?seed=N.
 */
export const metadata: Metadata = {
  title: 'Adventure Battle Royale',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

// PUBLIC-POLISH (2026-11-02): the session is read here, as /play/adventure does, so the stage can tell the harness a guest
// is a guest (no closet read: it was a 401 on every guest load). A failed read is a guest, which only skips that read.
export default async function AdventureBRPage() {
  let signedIn = false;
  try { signedIn = !!(await getServerSession(authOptions))?.user; } catch { signedIn = false; }
  return <AdventureBRLoader signedIn={signedIn} />;
}
