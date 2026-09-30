// youth — the Mirror's own single youth-gate stub for pattern cues (MIRROR-COACH P4 PATTERN CONTRACT, 2026-09-29).
//
// WHY THIS FILE EXISTS. lib/mirror/patterns.ts's own `youthSafe` field is documented as: "False hides any max-effort
// or bracing cue for a minor (lib/mirror/youth.ts isMinorForMirror) — owner decision #6." Before this file, that
// doc comment pointed at a function that did not exist anywhere in the repo (a phase-4 review caught this: neither
// `lib/mirror/youth.ts` nor `isMinorForMirror` had ever been written, so even a pattern correctly marked
// `youthSafe: false` would have had nothing to enforce it). This is that stub — the phase-4 brief's own words: "read
// User.dobYear through a single isMinorForMirror() stub in lib/mirror/youth.ts that phase 5 replaces" with whatever
// its real age-and-consent work needs (a stored flag, parental consent, etc.).
//
// NOT A NEW RULE. The coach lane already has this exact gate — lib/mirror/screenCorrectives.ts's `youthGateFor`,
// read today by app/play/mirror/page.tsx (the Movement Screen's own written-corrective blocks) and
// app/api/coach/prescribe/route.ts. This file does not re-derive the age rule: it wraps that same function so
// lib/mirror's pattern-cue side of the Mirror (squat/lunge/push-up/overhead/carry/hinge/setup-line) reads one
// definition of "is this a minor" instead of two. `isMinorForMirror` intentionally collapses `youthGateFor`'s two
// non-adult outcomes ('minor', 'unknownAge') into one boolean — a bracing cue is either shown or it isn't, and there
// is no different treatment for "under 18" versus "we don't know their age" (owner decision #20: a blank birth year
// reads as a minor, the conservative default, same as the coach lane's own screen blocks already do).
import { youthGateFor } from './screenCorrectives';

/**
 * True when this athlete should NOT see a max-effort or bracing cue: a birth year under 18, or none on file at all
 * (owner decision #20 — blank = minor until answered). False only for a birth year on file that reads as an adult.
 */
export function isMinorForMirror(dobYear: number | null | undefined, now: Date = new Date()): boolean {
  return youthGateFor(dobYear, now) !== null;
}
