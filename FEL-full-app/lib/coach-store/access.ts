/**
 * lib/coach-store/access.ts — STORE-READY B4 (F20): the one predicate for whether a ProgramAccess row may show
 * its program content. A row opens the program ONLY while it is ACTIVE or PAST_DUE and its accessUntil has not
 * passed (null = no end). Unpaid (PENDING), EXPIRED, REFUNDED, CANCELED and PAUSED rows — and any row whose
 * access window has closed — show nothing.
 */

export interface AccessRowLike {
  status: string;
  accessUntil?: Date | null;
}

export function programAccessOpen(row: AccessRowLike, now: Date): boolean {
  if (row.status !== 'ACTIVE' && row.status !== 'PAST_DUE') return false;
  if (row.accessUntil && row.accessUntil.getTime() <= now.getTime()) return false;
  return true;
}
