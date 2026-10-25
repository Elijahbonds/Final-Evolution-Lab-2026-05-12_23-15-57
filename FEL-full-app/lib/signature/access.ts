// lib/signature/access.ts — SIGNATURE-PROGRAMS (2026-10-25): who sees a program, and which weeks open.
//
// REVIEW (owner: "every program is a draft for the owner to review and edit"): a program is a DRAFT until the owner
// approves it on /coach/admin/programs. Only an APPROVED program is listed, opened or started by an athlete; the admin
// role (lib/admin/requireAdmin.ts, the library review's own check) previews drafts, labelled as drafts, and starts none.
// A rejected program is shown to no one but the admin.
//
// PREMIUM (owner: "all signature programs are included in the athlete Premium subscription; one free starter week"):
// the athlete subscription that exists is FEL Pro (lib/pro-guard.ts isProUser — Subscription.product FEL_PRO, ACTIVE),
// so week 1 of every approved program is free and every later week needs an active FEL Pro. Prices and taking payments
// are the owner's call: nothing here charges, and with VIRTUAL_PURCHASES_ENABLED off (lib/flags.ts) the page shows no
// checkout link at all. A lapsed subscription locks the next week, never what was done.
//
// Pure. Client-safe.
import type { SignatureId } from './types';

export type ReviewStatus = 'draft' | 'approved' | 'rejected';

/** Weeks every athlete gets with no subscription: the owner's "one free starter week". */
export const FREE_WEEKS = 1;

export interface Viewer {
  userId: string;
  isAdmin: boolean;
  /** youthRules(dobYear): under 18 or no birth year. */
  youth: boolean;
  /** An active FEL Pro subscription. */
  hasPro: boolean;
}

/** May this viewer see this program at all? */
export const canSee = (status: ReviewStatus, v: Pick<Viewer, 'isAdmin'>): boolean => status === 'approved' || v.isAdmin;

/** May this viewer start (enroll in) it? Approved only: a draft is previewed, never started. */
export const canStart = (status: ReviewStatus): boolean => status === 'approved';

export type WeekAccess = 'free' | 'pro' | 'locked';

/** A plan week's access: the free starter week, a Pro week, or locked. */
export function weekAccess(week: number, v: Pick<Viewer, 'hasPro'>): WeekAccess {
  if (week <= FREE_WEEKS) return 'free';
  return v.hasPro ? 'pro' : 'locked';
}

/** The review state the overlay holds, else draft (every program ships as a draft). */
export function statusOf(id: SignatureId, reviews: ReadonlyMap<string, { status: string }>): ReviewStatus {
  const s = reviews.get(id)?.status;
  return s === 'approved' || s === 'rejected' ? s : 'draft';
}
