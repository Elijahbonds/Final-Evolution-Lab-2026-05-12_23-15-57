// lib/privacy/scanSaveOptIn.ts — TEEN-WRITE-BLOCK (2026-09-29): has this account opted in to having its movement
// numbers saved? The second half of lib/privacy/scanSaveGate.ts canSaveScanNumbers (the first half is a verified 18+
// birth year). Cyber's PRIVACY-CORE-SCAN-GAPS.md GAP 1, fix 1 names this module; fix 5 is why it answers no.
//
// No opt-in record exists yet (no schema field at 86b8a255). PRIVACY-CORE/AB-04 adds the adult opt-in and its consent
// record (schema: Elijah's yes). Until then nobody is opted in, so no movement numbers are saved for anyone (GAP 1 fix 5).
//
// Nothing turns this on: no env var, no flag, no header, no request field. It reads nothing today. When PRIVACY-CORE/
// AB-04 wires it to a real opt-in record, that change carries its own prisma/pending/ SQL (applied in production before
// any deploy that contains it) and keeps the gate's never-throw rule: every read wrapped in try/catch, any error →
// false, one log line with no user id, email, birth year or age in it (lib/privacy/scanSaveGate.ts logGateFailure).
//
// A module of its own so a test can vi.mock it to true — the positive control that proves an opted-in adult's writes
// are exactly what they were before this lane.

/** Always false until the opt-in record exists (see the header). The arguments are the shape the real reader will take. */
export async function scanSaveOptIn(_db: unknown, _userId: string): Promise<boolean> {
  return false;
}
