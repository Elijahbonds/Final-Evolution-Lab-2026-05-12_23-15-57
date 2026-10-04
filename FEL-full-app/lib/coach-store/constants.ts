/**
 * Coach-store numbers Elijah can change without hunting through routes.
 * Tuned feel / money figures are named here and flagged in the lane report.
 * The referral share default (0.20 of FEL's fee when the env is unset) is one of those.
 */

export const HOLD_MINUTES = 32;
export const CHECKOUT_EXPIRE_MINUTES = 31;
export const PENDING_SLOT_MS = 2 * 60 * 1000;

export const REVIEW_SLA_HOURS_DEFAULT = 48;
export const REVIEW_WARN_HOURS = 12;
export const CLIP_DELETE_DAYS = 30;

export const MAX_CLIPS = 3;
export const MAX_CLIP_SECONDS = 60;
/** ~200MB. The device and the signed PUT both refuse anything bigger. */
export const MAX_CLIP_BYTES = 209_715_200;
export const PUT_TTL_SEC = 15 * 60;
export const GET_TTL_SEC = 60 * 60;

export const CREDIT_CAP = 2;
export const MAX_REFERRAL_RENEWALS = 12;
export const REFERRAL_MONTH_CAP_CENTS = 50_000;
export const REFERRAL_MIN_PAYOUT_CENTS = 2_500;
export const REFERRAL_MIN_WEEKLY_CENTS = 1_000;
export const REFERRAL_SHARE_DEFAULT = 0.2;
export const REFERRAL_SHARE_MAX = 0.5;
export const SESSION_HOLD_DAYS = 7;
export const PAYMENT_HOLD_DAYS = 14;

export const JOIN_EARLY_MIN = 10;
export const JOIN_LATE_MIN = 15;
export const SIGNAL_TTL_MS = 10 * 60 * 1000;
export const SIGNAL_MAX_BYTES = 16 * 1024;
export const SIGNAL_MAX_ROWS = 400;
export const CONNECT_FAIL_MS = 20_000;
export const TEEN_OFFLINE_GRACE_DAYS = 7;

export const SESSION_LENGTHS = [30, 60] as const;
export type SessionLength = (typeof SESSION_LENGTHS)[number];

export const ORIGINALS_PREFIX = 'coach-reviews/originals/';
export const REPLIES_PREFIX = 'coach-reviews/replies/';

export const RESERVED_SLUGS = ['admin', 'join', 'dashboard', 'receipt'] as const;

export const CLIP_MIME = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

export const PAIN_LINE =
  'This is coaching, not medical advice. If pain continues or gets worse, see a doctor or physical therapist.';

export const SELLER_OF_RECORD = 'Final Evolution LLC';

export const GOALS = ['Dunk', 'Vertical', 'Posture', 'Coming back from injury'] as const;

export const PAYMENTS_NOT_SET_UP = 'payments not set up';
