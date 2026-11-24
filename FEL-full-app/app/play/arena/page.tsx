import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ArenaLoader } from './loader';

export const dynamic = 'force-dynamic';

/**
 * PHYSICS ARENA (owner 2026-11-23: "Make there be a live physics play arena for the sport modes.- all the modes can be played
 * physics based. And POV-"; docs/PHYSICS-ARENA-PLAN.md). The sports on real physics: a real ball, rim, glass and bodies, and the
 * player's own eyes on the camera button. Slice 1 is basketball 1v1. Each finished game counts for XP and progress when signed in (arena.xpOn; lib/sessions/arenaScore.ts).
 * Reached from the Play screen's Physics Arena chip (arena.on). Not indexed while it grows. No sign-in wall: a guest plays as the
 * default athlete, as in Venice.
 */
export const metadata: Metadata = {
  title: 'Physics Arena',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function ArenaPage() {
  let signedIn = false;
  try { signedIn = !!(await getServerSession(authOptions))?.user; } catch { signedIn = false; }
  return <ArenaLoader signedIn={signedIn} />;
}
