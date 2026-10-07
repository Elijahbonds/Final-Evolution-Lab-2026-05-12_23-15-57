import type { Metadata } from 'next';
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

export default function AdventureBRPage() {
  return <AdventureBRLoader />;
}
