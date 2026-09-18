// Certification — owner decision (2026-09-02): auto-graded assessments, 80%
// pass on every required module, and an owner revoke switch. Pure: the API
// route feeds it Credential rows and a profile, it answers with a status.

import { requiredModules, CURRICULUM_VERSION } from '../curriculum/blueprint';

export type CertificationStatus = 'none' | 'in_progress' | 'certified' | 'revoked';

export interface CredentialRow {
  trackKey: string;
  moduleKey: string;
  curriculumVersion: string;
  passed: boolean;
}

/**
 * Derive the status. A revoke (revokedAt set and later than any pass) wins.
 * Passes only count on the CURRENT curriculum version — a new version means
 * re-certifying, which is the point of versioning it.
 */
export function certificationStatusFor(
  credentials: CredentialRow[],
  revokedAt: Date | null | undefined,
  version = CURRICULUM_VERSION,
): { status: CertificationStatus; passedModules: string[]; missingModules: string[] } {
  const required = requiredModules();
  const passed = new Set(
    credentials.filter((c) => c.passed && c.curriculumVersion === version).map((c) => `${c.trackKey}/${c.moduleKey}`),
  );
  const passedModules = required.filter((m) => passed.has(m));
  const missingModules = required.filter((m) => !passed.has(m));
  if (revokedAt) return { status: 'revoked', passedModules, missingModules };
  if (missingModules.length === 0) return { status: 'certified', passedModules, missingModules };
  if (passedModules.length > 0 || credentials.length > 0) return { status: 'in_progress', passedModules, missingModules };
  return { status: 'none', passedModules, missingModules };
}

/** Under 18 at intake → an accepted guardian consent is required before a plan goes active. */
export function needsGuardianConsent(birthYear: number | null | undefined, now = new Date()): boolean {
  if (!birthYear) return true;                          // unknown age: be safe
  return now.getFullYear() - birthYear < 18;
}
