// lib/combine/copy.ts — COMBINE-DAY (2026-10-25): the lines the combine says about who is held, and what is kept where.
//
// DRAFT COPY, FOR THE OWNER TO APPROVE. These are privacy / consent lines, and the owner's rule is that a new one ships
// only once approved. So each has two forms: the DRAFT (the full sentence, behind NEXT_PUBLIC_COMBINE_DRAFT_COPY, off
// by default) and the PLACEHOLDER shown until then (a bare status, no explanation, nothing promised). Turning the flag
// on is the owner's approval of every DRAFT below at once. Reused lines that are already approved (body play's
// CAMERA_NOTE, the jump tools' SIDE_STEPS) are imported where they are drawn, not copied here.
//
// Pure, client-safe.
import type { HeldReason } from './types';

/** NEXT_PUBLIC_COMBINE_DRAFT_COPY: "true" shows the draft lines. Anything else (unset) shows the placeholders. */
export function draftCopyOn(env: string | undefined = process.env.NEXT_PUBLIC_COMBINE_DRAFT_COPY): boolean {
  return env === 'true';
}

export interface DraftLine { draft: string; placeholder: string }

export const HELD_LINES: Record<HeldReason, DraftLine> = {
  age_required: {
    draft: 'Held: their account has no birth year yet. Once they add it, they can be tested.',
    placeholder: 'Held: not eligible yet.',
  },
  guardian_consent_required: {
    draft: 'Held: athletes under 18 need a guardian’s approval for coached training, and that approval is not open yet.',
    placeholder: 'Held: not eligible yet.',
  },
  under_13: {
    draft: 'Not eligible: coaching on FEL is for players 13 and up.',
    placeholder: 'Not eligible.',
  },
  age_unknown: {
    draft: 'Held: age unknown. Add them to your roster with their own FEL account (18 and over for now) to test them.',
    placeholder: 'Held: needs their own account on your roster.',
  },
};

export const CAMERA_ADULTS_LINE: DraftLine = {
  draft: 'Camera stations are for verified adults only; this athlete can do the hand-timed stations.',
  placeholder: 'Hand-timed stations only.',
};

export const KEPT_ON_DEVICE_LINE: DraftLine = {
  draft: 'Kept on this phone only: this athlete has not turned on saving their movement numbers, so their camera numbers are not sent.',
  placeholder: 'On this phone only.',
};

export const NUMBERS_ONLY_LINE: DraftLine = {
  draft: 'Only numbers are kept: no picture, video or body tracking leaves this phone.',
  placeholder: '',
};

export const WHO_SEES_LINE: DraftLine = {
  draft: 'Results are seen by you, and by each athlete for their own numbers only. There is no public ranking.',
  placeholder: '',
};

export const ATHLETE_PAGE_LINE: DraftLine = {
  draft: 'Your own combine numbers, as your coach recorded them. Only you and your coach see them.',
  placeholder: '',
};

/** Every draft line, for the copy test and the owner's list. */
export const DRAFT_LINES: readonly DraftLine[] = [
  ...Object.values(HELD_LINES), CAMERA_ADULTS_LINE, KEPT_ON_DEVICE_LINE, NUMBERS_ONLY_LINE, WHO_SEES_LINE, ATHLETE_PAGE_LINE,
];

/** The line to show: the draft once the owner approved them, the placeholder until then. */
export function say(line: DraftLine, on: boolean = draftCopyOn()): string {
  return on ? line.draft : line.placeholder;
}

/** Product lines (not privacy or consent): the run and report screens' own words. */
export const NO_ACCURACY_LINE = 'Camera numbers are estimates from this phone’s camera, for comparing this group on this day.';
export const HAND_TIMED_LINE = 'Hand-timed by the coach.';
export const COMING_SOON_LINE = 'Saving combines to your account is coming soon. This combine is kept on this phone until then.';
