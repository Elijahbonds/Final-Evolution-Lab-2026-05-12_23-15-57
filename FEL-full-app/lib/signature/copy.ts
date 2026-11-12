// lib/signature/copy.ts — SIGNATURE-PROGRAMS (2026-10-25): every line the programs say that is not the owner's content.
//
// PRODUCT COPY, OWNER-APPROVED (owner, in chat, 2026-10-27: "You do it. I approve." — Owner Inbox card C20, "Approve
// wording: signature programs", approved as written; the card's one thing to weigh, the name "pain-free prehab", was
// left as it is). The two review lines below (NOT_READY_LINE, NONE_APPROVED_LINE) no longer say the programs are with
// the owner: they are approved (./access.ts OWNER_APPROVED), and the lines now show only when the tables are not applied
// ("coming soon") or the owner has since rejected every program.
//
// NO MEDICAL WORDS. signature.test.ts screens every line here and every program's own text through
// lib/coach/weeklyDraft/copy.ts MEDICAL_WORDS (no diagnosis, treatment, injury or condition words) — the one exception is
// the prehab field's fixed PREHAB_NOTE ("General prehab, not treatment."), which the owner's brief asks for word for word.
// The safety lines are NOT written here: a pain stop reads lib/health/painRule.ts PAIN_DECISION_COPY ("check with a
// clinician"), an eased pain day the weekly draft's easeOffClientLine, the jump gate and the youth hold read the warm-up's NOTE_COPY,
// and a red flag reads lib/health/intake.ts RED_FLAG_COPY: one voice for one rule.
//
// Pure. Client-safe.
import { JUMP_CHECK_HREF } from '@/lib/daily-drill/copy';
import { JUMP_CHECK } from '@/lib/vertical/copy';   // VERTICAL-EASY: one name for the hands-on-hips jump check
import { LANDING_CHECK_ENTRY } from '@/lib/drills/route';
import type { DecisionKind, ReadResult, RetestKind } from './types';

export const PROGRAMS_TITLE = 'Signature programs';
export const PROGRAMS_LEDE = "FEL's own programs, from the owner's books: eight to twelve weeks each, re-tested as you go, and the plan moves with what the re-tests read.";

export const RETEST: Record<RetestKind, { label: string; line: string; href: string; cta: string }> = {
  jump: { label: 'Jump check', line: 'Three jumps on the camera: your best and your trend.', href: JUMP_CHECK_HREF, cta: JUMP_CHECK },
  landing: { label: 'Landing check', line: 'The one-minute landing check that opens the jumping.', href: LANDING_CHECK_ENTRY, cta: 'Do the landing check' },
  form: { label: 'Mirror', line: 'A squat or lunge set on the Mirror: how many reps stay clean.', href: '/play/mirror', cta: 'Open the Mirror' },
  shot: { label: 'Shooting', line: 'A round of body-play shooting: your makes.', href: '/play/threepoint', cta: 'Shoot a round' },
  readiness: { label: 'Readiness', line: 'The 30-second daily jump check: ready, normal or low.', href: '/train/readiness', cta: 'Check in' },
};

export const READ_WORDS: Record<ReadResult, string> = {
  up: 'up', same: 'about the same', down: 'down', pass: 'passed', not_yet: 'not yet', none: 'no number yet',
};

const list = (xs: string[]): string => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');
const labels = (ks: readonly RetestKind[]) => list(ks.map((k) => RETEST[k].label.toLowerCase()));

/** Why a checkpoint decided what it did, in the athlete's words. */
export function decisionLine(o: {
  kind: DecisionKind; why: 'up' | 'down' | 'pain' | 'readiness' | 'schedule' | 'no_numbers' | 'no_room' | 'red_flag';
  reads: readonly RetestKind[]; next: string | null;
}): string {
  const next = o.next ? ` Next: ${o.next}.` : '';
  switch (o.why) {
    case 'up': return `Your ${labels(o.reads)} read up, so you move on early.${next}`;
    case 'down': return `Your ${labels(o.reads)} read lower than when you started, so this week runs again before you move on.`;
    case 'pain': return "A recent pain check-in hasn't settled, so the plan doesn't move up: this week runs again, and nothing gets harder while it settles.";
    case 'readiness': return 'Your readiness check read Low on two or more days this week, so this week runs again before you move on.';
    case 'red_flag': return "One of your health answers asks us to stop training features for now, so the plan doesn't move.";
    case 'no_numbers': return `No saved ${labels(o.reads)} numbers yet, so the plan runs on schedule.${next}`;
    case 'no_room': return `The plan already runs its longest, so it moves on.${next}`;
    default: return `The re-tests held, so the plan runs as written.${next}`;
  }
}

export const DECISION_LABEL: Record<DecisionKind, string> = { advance: 'Moved on early', repeat: 'Week repeated', continue: 'On schedule' };

// ── the day ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** A Low readiness check today: the session eases (the coach readiness lane's ease, never harder). */
export const readinessEaseLine = (what: number): string =>
  what > 0
    ? `Today's readiness check read Low, so today eases off: ${what === 1 ? 'one exercise has' : `${what} exercises have`} a set less and a lighter effort. An easier day is a good call.`
    : "Today's readiness check read Low. Today is already light, so it stays as written. Take it easy.";

/** A pain check-in that asked for an easier variation: the session eases. */
export const PAIN_EASE_LINE = "A recent pain check-in asked for an easier version, so today eases off: a set less and a lighter effort on the main work.";

export const SESSION_DONE_LINE = 'Session done. It counts toward your streak.';
export const PROGRAM_DONE_LINE = 'Program complete. Every session is done: run the re-tests once more and see what moved.';
export const DAILY_DRILL_LINE = "Warm up with today's daily drill: it is picked from your weakest number, and it pays your streak.";

// ── Premium ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const FREE_WEEK_LINE = 'Week 1 is free. The rest of the program is part of FEL Pro.';
export const PRO_INCLUDED_LINE = 'Every week is included with your FEL Pro.';
export const PRO_FEATURE = 'Signature programs';
export const PRO_FREE_LINE = "The first week of every signature program, the daily drill and the exercise library stay free.";
export const PRO_LOCKED_LINE = 'This week is part of FEL Pro. Your first week, and everything you have done, stay yours.';
/** Payments are the owner's call and off (VIRTUAL_PURCHASES_ENABLED): no checkout link is shown. */
export const PRO_NOT_ON_SALE_LINE = "FEL Pro isn't on sale yet, so the weeks after the first open when it is.";
export const YOUTH_PRO_LINE = 'FEL Pro is for 18 and over, so under 18 the first week is the whole program for now.';

// ── review and visibility ─────────────────────────────────────────────────────────────────────────────────────────

export const DRAFT_BADGE = 'Draft: only the owner can see this until it is approved.';
/** The tables are not applied (lib/coach/pendingSchema.ts seam): every athlete reads "coming soon". */
export const NOT_READY_LINE = 'Signature programs are coming soon. The daily drill and the exercise library are open in the meantime.';
/** The tables are there but no program is open to athletes (only if the owner rejects or un-approves all four). */
export const NONE_APPROVED_LINE = 'No signature program is open right now.';
export const YOUTH_DEVICE_LINE = 'Under 18, your progress stays on this phone. Jumps and landings wait: each one has a calm swap.';

/** Train's signature card line (app/train/page.tsx): the same for everyone, so that page reads no age to draw it. */
export const TRAIN_LINE_IDLE = "FEL's own programs from the owner's books: vertical jump, basketball skills, athletic foundation and pain-free prehab. Week 1 is free.";
