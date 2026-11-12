// #337 ATHLETE STATUS (cursor-bundle-2, 2026-10-24): the shared Profile → one AthleteStatus, for the Profile tab's card.
//
// READ-ONLY on the shared Profile (docs/AGENT-OPERATING-RULES.md: the shared Profile object needs sign-off to CHANGE;
// this only reads it, through the one loader every coaching surface already uses, lib/profile/profileServer.ts).
// Kept apart from app/profile/page.tsx so lane/profile-v2, which is rebuilding that page, can fold this into its own
// server batch (lib/profile-v2/load.ts) or place components/profile/athlete-status-card.tsx wherever it fits.
//
// Never throws: a failed read is no card, not a 500.
import 'server-only';
import type { PrismaClient } from '@/lib/generated/prisma';
import { buildStatus, type AthleteStatus } from './dashboard';
import { loadSharedProfile } from './profileServer';
import { PLATFORM_PROTOCOLS } from './protocol';

export async function loadAthleteStatus(db: PrismaClient, userId: string | null | undefined, now: number = Date.now()): Promise<AthleteStatus | null> {
  if (typeof userId !== 'string' || !userId) return null;
  try {
    const profile = await loadSharedProfile(db, userId, now);
    return buildStatus(profile, PLATFORM_PROTOCOLS, now);
  } catch {
    return null;
  }
}
