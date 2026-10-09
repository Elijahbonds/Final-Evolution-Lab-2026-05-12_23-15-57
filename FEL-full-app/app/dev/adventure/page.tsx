import type { Metadata } from 'next';
import { DevAdventureLoader } from './loader';

export const dynamic = 'force-dynamic';

/**
 * ADVENTURE A4 (2026-10-06): the Adventure's integration sandbox.
 *
 * A HIDDEN LINK ON THE LIVE SITE (owner decision, 2026-10-06): reachable in production by its URL, linked from no
 * menu, nav, picker or sitemap, and never indexed. So unlike the other app/dev pages (a 404 outside `next dev`) this
 * one has no NODE_ENV gate of its own; the shared gate stays as it is for every other dev page.
 * host/hiddenRoute.test.ts holds both halves: the page is served and noindex, and nothing links to it.
 *
 * Query: ?partner=character (a built character instead of the creature), ?fuse=ready (the fusion meter starts full),
 * ?at=camp (start beside the monster camp), ?demo=1 (the integration script plays every verb), ?seed=N.
 */
export const metadata: Metadata = {
  title: 'Adventure test yard',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function DevAdventurePage() {
  return <DevAdventureLoader />;
}
