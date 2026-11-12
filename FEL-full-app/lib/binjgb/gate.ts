// lib/binjgb/gate.ts — BINJGB-SHELF-1: who sees what, decided on the SERVER (Cyber G6 + L1, reviews 067e0dce / 9caccc46).
//
//   flag off            → 404 (before anything is read)
//   under 13            → 404 (direct URL too, and the [slug] stub runs this before its own notFound())
//   unknown age         → the age prompt, never the player or the picker
//   teen (13–17)        → the shelf only; the picker is OMITTED by the server (T-TEEN-NO-LOCAL), not hidden with CSS
//   verified adult      → the shelf, plus the picker only when BINJGB_LOCAL_FILE_ENABLED is also on
//
// Pure: the pages read the flags and User.dobYear (from the database, lib/privacy/scanSaveGate readDobYear) and pass them in.
import { ageScreenOutcome } from '@/lib/privacy/ageScreen';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

export type ShelfAccess =
  | { kind: 'not-found' }
  | { kind: 'age-prompt' }
  | { kind: 'shelf'; picker: boolean };

export interface ShelfAccessInput {
  shelfOn: boolean;
  localOn: boolean;
  /** User.dobYear from the database; null when never answered. */
  dobYear: number | null | undefined;
  now?: Date;
}

export function shelfAccess(input: ShelfAccessInput): ShelfAccess {
  if (!input.shelfOn) return { kind: 'not-found' };
  const now = input.now ?? new Date();
  const outcome = ageScreenOutcome(input.dobYear, now);
  if (outcome === 'blocked') return { kind: 'not-found' };
  if (outcome === 'invalid') return { kind: 'age-prompt' };
  // Adults only, by the server's own verifiedAdult (unknown = no). OQ-6: the shelf flag is always required too.
  const adult = outcome === 'adult' && typeof input.dobYear === 'number' && verifiedAdult(input.dobYear, now);
  return { kind: 'shelf', picker: input.localOn && adult };
}

/** The sandboxed local-frame document is served only where the picker would be. */
export function localFrameAllowed(input: ShelfAccessInput): boolean {
  const a = shelfAccess(input);
  return a.kind === 'shelf' && a.picker;
}

/**
 * The quiet play-hub row (OQ-8): flag on AND at least one shipped title AND 13+. v1 has zero titles, so it never renders
 * (T-SHELF-EMPTY-ROW). The title count is checked first, so in v1 no age is read for it.
 */
export function homebrewRowVisible(shelfOn: boolean, titleCount: number, dobYear: number | null | undefined, now: Date = new Date()): boolean {
  if (!shelfOn || titleCount <= 0) return false;
  const outcome = ageScreenOutcome(dobYear, now);
  return outcome === 'teen' || outcome === 'adult';
}
