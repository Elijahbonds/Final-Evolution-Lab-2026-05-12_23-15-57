// lib/signature/access.ts — SIGNATURE-PROGRAMS (2026-10-25): who sees a program, and which weeks open.
//
// REVIEW (owner: "every program is a draft for the owner to review and edit"): a program is a DRAFT until the owner
// approves it on /coach/admin/programs. Only an APPROVED program is listed, opened or started by an athlete; the admin
// role (lib/admin/requireAdmin.ts, the library review's own check) previews drafts, labelled as drafts, and starts none.
// A rejected program is shown to no one but the admin.
//
// OWNER-APPROVED DEFAULT (owner, in chat, 2026-10-27: "You do it. I approve." — the answer to the Owner Inbox cards
// C20 "Approve wording: signature programs" and C21 "signature program stand-ins", which recommended approving all four
// programs as drafted, stand-ins included). The four programs in OWNER_APPROVED are 'approved' when the review table
// holds NO row for them. A row still wins: the owner can reject a program, send it back to draft, or save edits on the
// review page, and the row's status is what the program reads from then on. What does NOT change:
//   · the tables. While the pending SQL (prisma/pending/2026-10-25-signature-programs.sql) is not applied, readReviews
//     answers null and statusOf(id, null) is 'draft' — the default never reaches past the lib/coach/pendingSchema.ts
//     seam, so every athlete path stays "coming soon" (NOT_READY_LINE) and starting answers 503, exactly as before;
//   · the checks. signature.test.ts holds the four programs at zero programProblems, the same bar the review page's
//     Approve button enforces, so the default approves nothing the button would refuse.
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

/** The programs the owner approved as drafted (owner, in chat, 2026-10-27; header above). */
export const OWNER_APPROVED: ReadonlySet<SignatureId> = new Set<SignatureId>(['vertical-jump', 'basketball-skills', 'athletic-foundation', 'pain-free']);

/**
 * The review state: the overlay's row when there is one; with no row, the owner's approval (OWNER_APPROVED) or draft;
 * and draft whenever the review table cannot be read (`reviews` null: the pending SQL is not applied, or the read failed)
 * — fail closed, so the owner's approval never opens a program the tables cannot serve.
 */
export function statusOf(id: SignatureId, reviews: ReadonlyMap<string, { status: string }> | null): ReviewStatus {
  if (!reviews) return 'draft';
  const row = reviews.get(id);
  if (!row) return OWNER_APPROVED.has(id) ? 'approved' : 'draft';
  return row.status === 'approved' || row.status === 'rejected' ? row.status : 'draft';
}
