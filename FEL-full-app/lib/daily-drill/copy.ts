// DAILY-DRILL — the card's and the page's words, in one place so a test reads what the page says. Product copy for the
// owner's review (docs/DAILY-DRILL.md, owner calls); none of it is legal or policy text. Pure and client-safe.
import { SCREEN_HOME } from '@/lib/screen/routes';
import { JUMP_CHECK } from '@/lib/vertical/copy';   // VERTICAL-EASY: one name for the hands-on-hips jump check
import type { Focus } from './plan';
import type { SkillReading } from './skills';

// profile v2's empty-state links (lib/profile-v2/tiles.ts JUMP_CHECK_HREF, ACCOUNT_HREF), spelled here so the drill page's
// client bundle does not carry tiles.ts's game catalogue; copy.test.ts holds them equal.
export const JUMP_CHECK_HREF = '/play/mirror/assess?run=jump';
export const ACCOUNT_HREF = '/account';

/** Where the daily drill runs. */
export const DAILY_DRILL_PATH = '/train/today-drill';
/** The claim route. */
export const DAILY_DRILL_CLAIM_PATH = '/api/daily-drill/claim';

export const DAILY_EYEBROW = "Today's drill";
export const SAME_ALL_DAY_LINE = 'The same drill all day, on every device. A new one tomorrow.';
export const START_CTA = "Start today's drill";
export const DONE_TITLE = 'Done for today';
// TODAY-DRILL (2026-10-27): reworded so no line names a medical word (lib/coach/weeklyDraft/copy.ts MEDICAL_WORDS caught
// "diagnosis"); the meaning is unchanged: a pause until a clinician has been seen and the Mirror cleared it.
export const STOPPED_LINE = "Today's drill is on pause. Check with a clinician first, then clear it from the Mirror. It's a pause, not a verdict.";
/** Said on the result card instead of the drills page's "nothing is saved": here one fact is kept. */
export const KEPT_LINE = 'Only the fact that you finished today’s drill is kept, for your streak and Lab Credits. Nothing the camera read is sent.';
export const PREP_LINE = 'Four calm minutes of the Wake-Up first, then the drill.';
export const CLAIM_FAILED_LINE = "We couldn't save that you finished. Your drill still counts if you try again today.";

/** Why this drill: the number it was picked from, said as the player knows it. */
export function whyLine(focus: Focus, skill: SkillReading | null, tied: boolean): string {
  if (!skill || focus === 'starter') return 'A good all-round start: the Pre-Game Wake-Up, for the whole body.';
  const slipping = skill.trend === 'worse' ? ', and it slipped against last week' : '';
  const tie = tied ? ' (tied with another of your numbers; the pick is fixed for today)' : '';
  return `Picked from your lowest number: ${skill.label.toLowerCase()}, ${skill.display}${slipping}${tie}.`;
}

/** The credit line before the drill is done. `streakOpens`: finishing it is what opens today's streak day. */
export function rewardLine(credit: number, streakOpens: boolean, nextStreakDays: number): string {
  const lc = `${credit} Lab Credits`;
  return streakOpens ? `Finish it for ${lc}, and day ${nextStreakDays} of your streak.` : `Finish it for ${lc}. Your streak already counts today.`;
}

/** The done line, from what the claim paid. */
export function doneLine(amount: number, streakDays: number | null): string {
  const streak = streakDays && streakDays > 0 ? ` Streak: ${streakDays} ${streakDays === 1 ? 'day' : 'days'}.` : '';
  return `+${amount} Lab Credits.${streak} A new drill tomorrow.`;
}

export interface Nudge { text: string; href: string; cta: string }

/**
 * No measured number yet: what would give the pick one, by the gates that decide whether a number is saved at all
 * (profile v2's: an opted-in verified adult's numbers are on the account; nobody else's are).
 */
export function measureNudge(g: { adult: boolean; canSaveScan: boolean }): Nudge {
  if (g.canSaveScan) return { text: 'Do a one-minute jump check, and tomorrow’s drill is picked from your numbers.', href: JUMP_CHECK_HREF, cta: JUMP_CHECK };
  if (g.adult) return { text: 'Turn on saving your jump numbers, and your drill is picked from them.', href: ACCOUNT_HREF, cta: 'Account settings' };
  return { text: 'Under 18, your numbers stay on your phone, so your daily drill is the all-round one. You can still check your jump any time.', href: SCREEN_HOME, cta: 'Check your jump' };
}
