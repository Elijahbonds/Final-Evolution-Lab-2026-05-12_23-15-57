// lib/safety/reportPresets.ts — SAFETY lane (SAF-05, 2026-10-25): the fixed lists a report, a moderation and an appeal
// are made of, and their plain labels. Pure constants (no node:, no Prisma), so the client components can import them;
// the rules are in lib/safety/reports.ts.

export const REPORT_TARGETS = ['profile', 'squad_post', 'group', 'challenge', 'coach_message'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = ['harassment', 'hate', 'sexual', 'threat', 'self_harm', 'spam', 'cheating', 'impersonation', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Plain product labels for the presets (owner review: docs/DRAFT-community-guidelines.md uses the same list). */
export const REASON_LABEL: Record<ReportReason, string> = {
  harassment: 'Bullying or harassment', hate: 'Hate or slurs', sexual: 'Sexual content or approach', threat: 'Threats or violence',
  self_harm: 'Self-harm or suicide', spam: 'Spam or scams', cheating: 'Cheating', impersonation: 'Pretending to be someone', other: 'Something else',
};

export const MODERATION_KINDS = ['warn', 'mute', 'ban'] as const;
export type ModerationKind = (typeof MODERATION_KINDS)[number];
export const ADMIN_ACTIONS = ['dismiss', ...MODERATION_KINDS] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/** How long a mute or a ban lasts by default (new, owner can tune). null = until lifted. A warn has no length. */
export const DEFAULT_DAYS: Record<ModerationKind, number | null> = { warn: null, mute: 7, ban: null };

export const APPEAL_REASONS = ['not_me', 'misunderstood', 'already_fixed', 'account_shared', 'other'] as const;
export type AppealReason = (typeof APPEAL_REASONS)[number];
export const APPEAL_LABEL: Record<AppealReason, string> = {
  not_me: 'I didn’t do this', misunderstood: 'It was a misunderstanding', already_fixed: 'I’ve already fixed it',
  account_shared: 'Someone else used my account', other: 'Something else',
};
/** An appeal can be filed within this many days of the decision (new). */
export const APPEAL_WINDOW_DAYS = 30;

export const NOTE_MAX = 280;

/** One of the person's own moderations, as the support page shows it: preset fields only. */
export interface Standing {
  id: string; kind: ModerationKind; reason: ReportReason; createdAt: string; endsAt: string | null; active: boolean;
  appealStatus: 'none' | 'open' | 'upheld' | 'lifted'; canAppeal: boolean;
}
