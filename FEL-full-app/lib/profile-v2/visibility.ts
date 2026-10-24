// PROFILE V2 — who may see a profile (owner 2026-10-24: "friends only, and teens private").
//
//   · Under-18s are ALWAYS friends-only, with no public page. An unknown age is treated as under 18 (the
//     verifiedAdult rule: a year gap of more than 18; lib/privacy/verifiedAdult).
//   · Adults choose public or friends-only. The choice is stored in the one field that already exists for it:
//     CreatorCard.published (POST /api/v1/card/publish), the switch for the adult's public page. No card, or an
//     unpublished one, is friends-only — the default. (No schema change: owner rule for this lane.)
//   · Coaches see their athletes' profiles: a LIVE CoachClient (endedAt null) with the viewer as coach.
//   · The owner always sees their own.
//
// FRIENDS: FEL has no friends list yet (no model for it; Squads are a value-round lane). Until one exists, `isFriend`
// is always false at the call sites, so "friends-only" is, in practice, the owner and their coaches. The rule is
// written now so the friends lane only has to supply the boolean. Pure: no Prisma.

import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

export type ProfileAudience = 'self' | 'coach' | 'friend' | 'public';

export interface VisibilityInput {
  /** The signed-in viewer's id, or null when signed out. */
  viewerId: string | null;
  ownerId: string;
  ownerDobYear: number | null | undefined;
  /** CreatorCard.published — the adult's "public" choice. Ignored for a minor or an unknown age. */
  ownerChosePublic: boolean;
  /** The viewer coaches the owner (a live CoachClient). */
  viewerCoachesOwner: boolean;
  /** The viewer is on the owner's friends list (none exists yet: false). */
  viewerIsFriend: boolean;
  now?: Date;
}

export type VisibilityAnswer = { allowed: true; as: ProfileAudience } | { allowed: false };

/** The owner's effective setting: a minor or unknown age is friends-only whatever the stored flag says. */
export function effectiveVisibility(ownerDobYear: number | null | undefined, ownerChosePublic: boolean, now: Date = new Date()): 'public' | 'friends' {
  return verifiedAdult(ownerDobYear ?? null, now) && ownerChosePublic ? 'public' : 'friends';
}

export function canViewProfile(i: VisibilityInput): VisibilityAnswer {
  if (i.viewerId && i.viewerId === i.ownerId) return { allowed: true, as: 'self' };
  if (i.viewerId && i.viewerCoachesOwner) return { allowed: true, as: 'coach' };
  if (i.viewerId && i.viewerIsFriend) return { allowed: true, as: 'friend' };
  if (effectiveVisibility(i.ownerDobYear, i.ownerChosePublic, i.now) === 'public') return { allowed: true, as: 'public' };
  return { allowed: false };
}

/** What each audience is shown. Mirror numbers stay with the owner: a coach gets them through the per-booking share. */
export interface AudienceView {
  progress: boolean;     // the owner's measured week (jump, form) — scan numbers
  bests: boolean;        // per-mode bests and history
  badges: boolean;
  squad: boolean;        // opponents' names: never on another person's view
  privacy: boolean;      // the owner's own controls
}

export function viewFor(as: ProfileAudience): AudienceView {
  if (as === 'self') return { progress: true, bests: true, badges: true, squad: true, privacy: true };
  return { progress: false, bests: true, badges: true, squad: false, privacy: false };
}
