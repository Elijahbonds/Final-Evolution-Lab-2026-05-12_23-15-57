// lib/privacy/verifiedAdult.ts — TEEN-WRITE-BLOCK (2026-09-29): "verified 18+" from a year of birth, and nothing else.
//
// Pure and import-free ON PURPOSE: lib/health/intake.ts (which client components import for its copy and its pure
// answer checks) takes this rule too, so it must not drag next/server or a database type into a browser bundle.
// lib/privacy/scanSaveGate.ts re-exports it beside the gates that read the year from the database.
//
// Only the year is stored, so a year gap of exactly 18 may still be a 17-year-old: that is NOT verified 18+ (Cyber's
// PRIVACY-CORE-SCAN-GAPS.md GAP 1 fix 1).
//
// AGE-HELPERS-CONSOLIDATE (2026-10-04, option (a)): the boundary arithmetic itself now lives in
// lib/age/ageRules.ts's isVerifiedAdultStrict (the STRICT, `> 18`, rule — see that file's header for why this did
// NOT get unified with lib/creator/cardProgression-server.ts's `>= 18` rule). This export is a thin, behaviour-
// preserving re-export so every existing import of `verifiedAdult` keeps working unchanged.
export { isVerifiedAdultStrict as verifiedAdult } from '@/lib/age/ageRules';
