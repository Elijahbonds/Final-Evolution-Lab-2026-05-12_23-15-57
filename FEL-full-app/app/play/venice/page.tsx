import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { VeniceLoader } from './loader';

export const dynamic = 'force-dynamic';

/**
 * VENICE V1 (owner go 2026-11-17; docs/VENICE-HUB-PLAN.md): the walkable hoops park. Walk up to a court and its game starts
 * in one tap, on its own page, with the same player, look, ratings and party; the end screen brings you back to that court.
 * Reached from the Play screen's Venice door (lib/adventure/venice/door.ts); every game stays one tap on the shelf. Not
 * indexed while the hub grows (V1 is one district). No sign-in wall: a guest walks as the default athlete.
 */
export const metadata: Metadata = {
  title: 'Venice Beach',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function VenicePage() {
  let signedIn = false;
  try { signedIn = !!(await getServerSession(authOptions))?.user; } catch { signedIn = false; }
  return <VeniceLoader signedIn={signedIn} />;
}
