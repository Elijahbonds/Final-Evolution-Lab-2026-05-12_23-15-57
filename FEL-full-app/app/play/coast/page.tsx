import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CoastLoader } from './loader';

export const dynamic = 'force-dynamic';

/**
 * THE COAST & ISLANDS, phase A (owner 2026-11-17: "The first zone is the Coast & Islands"; docs/COAST-ISLANDS-PLAN.md): the first
 * open zone's walkable shell — a beach, the sea, two islands, the dock where the boat from Venice lands. Reached from Venice's pier
 * (lib/adventure/coast/door.ts); the boat on the dock goes back. Not indexed and linked from no menu while the zone grows. No
 * sign-in wall: a guest walks as the default athlete. Party-only, like Venice: nobody else walks your zone.
 */
export const metadata: Metadata = {
  title: 'The Coast',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function CoastPage() {
  let signedIn = false;
  try { signedIn = !!(await getServerSession(authOptions))?.user; } catch { signedIn = false; }
  return <CoastLoader signedIn={signedIn} />;
}
