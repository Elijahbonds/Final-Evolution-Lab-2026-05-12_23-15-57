// lib/vbt/gate.ts — VBT (2026-10-25): who may use the bar-speed tool, which parts, and whose numbers are kept.
//
// Every gate is one the app already has; this file names which applies where.
//   · UNDER 13: never. A year gap under 14 may still be 13 or younger, and the sign-up lock already turns those away
//     (lib/privacy/u13LockLog.ts locks thisYear−12 and −13): no camera is asked for. An UNKNOWN age is not opened
//     either — fail closed, as the readiness check does — with a line asking for the birth year.
//   · 13–17: TECHNIQUE SPEED ONLY (owner 2026-10-25, assumption flagged: "no loaded max-effort or e1RM testing for
//     minors"): live rep speed, zones and the velocity-loss cue; no e1RM, no load-velocity line, no load suggestions, no
//     readiness read, no med-ball max. And NOTHING IS KEPT — not on the server, not on the phone: a teen's training data
//     needs a guardian consent that is not approved yet (lib/coach/coachConsent.ts; COACH_TRAINING_CONSENT_SINCE is null),
//     and the movement-save gate (lib/privacy/scanSaveGate.ts) is verified-adult-only anyway. TEEN_VBT_SAVE below.
//   · ADULTS (verified 18+, lib/privacy/verifiedAdult.ts): everything. Saving to the server is the movement-save gate
//     (canSaveScanNumbers: verified 18+ AND opted in, row 1m of SCAN_SAVE_ROUTES); an adult who has not opted in keeps
//     their history on their own phone (lib/vbt/deviceStore.ts).
//   · A COACH sees a client's sets only on a live roster link AND a live 'coach_view' grant AND the client an adult (the
//     readiness check's own rule, lib/coach/readiness/gate.ts coachMaySee). A TEAM view shows only members who are
//     adults, can save and turned on "share measured" (lib/groups/server.ts readActivity's `sharing`).
//
// Pure.
import { gapExceedsEighteenYears } from '@/lib/age/ageRules';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

/** OWNER CALL (flagged): keep a teen's sets anywhere. false until a guardian consent covers camera training numbers. */
export const TEEN_VBT_SAVE = false as const;
/** OWNER CALL (flagged, assumption): a teen sees an e1RM / load-velocity line / load suggestions. false. */
export const TEEN_E1RM = false as const;

export type VbtTier = 'adult' | 'teen';
export type VbtAccess = { ok: true; tier: VbtTier } | { ok: false; error: 'sign_in' | 'under_13' | 'age_unknown' };

/** (new) The youngest year gap read as 13–17: a gap of 13 may be a 12-year-old, so it is read as under 13. */
export const TEEN_MIN_GAP = 14;

export function vbtAccess(o: { signedIn: boolean; dobYear: number | null | undefined }, now: Date = new Date()): VbtAccess {
  if (!o.signedIn) return { ok: false, error: 'sign_in' };
  const y = o.dobYear;
  if (y == null || !Number.isInteger(y)) return { ok: false, error: 'age_unknown' };
  if (verifiedAdult(y, now)) return { ok: true, tier: 'adult' };
  if (now.getFullYear() - y >= TEEN_MIN_GAP && !gapExceedsEighteenYears(y, now)) return { ok: true, tier: 'teen' };
  return { ok: false, error: 'under_13' };
}

export interface VbtFeatures {
  /** e1RM, the load-velocity line and load suggestions. */
  profile: boolean;
  /** The warm-up readiness read. */
  readiness: boolean;
  /** Keep the set (server when the save gate allows, else this phone). */
  keep: boolean;
  /** Med-ball throws (a max-effort release). */
  medball: boolean;
}

export function featuresFor(tier: VbtTier): VbtFeatures {
  const adult = tier === 'adult';
  return { profile: adult || TEEN_E1RM, readiness: adult, keep: adult || TEEN_VBT_SAVE, medball: adult };
}
