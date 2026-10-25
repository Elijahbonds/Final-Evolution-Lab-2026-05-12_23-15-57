// lib/coach/habits/copy.ts — COACH-PARITY (2026-10-26): what the coach and the athlete read about habits.
// Lines marked DRAFT are privacy or health lines for the owner (docs/COACH-PARITY.md §Draft copy); the health ones show
// only while COACH_PARITY_HEALTH_ENABLED is on.
import type { HabitError } from './rules';

export const COMING_SOON_LINE = 'Habits are coming soon.';

/** Today, under the habits. A product line. */
export const SEEN_LINE = 'Your coach sees which days you ticked.';

/** DRAFT (health): beside a health habit on Today. */
export const HEALTH_HABIT_LINE_DRAFT = 'A health habit: FEL keeps it only if you said yes to FEL keeping health data, and your coach sees it only if you share your health with them.';

/** DRAFT (health): when an adult ticks a health habit without the health_data grant. */
export const HEALTH_CONSENT_NEEDED_DRAFT = 'To tick health habits, say yes to FEL keeping your health data first.';

/** DRAFT (privacy): the coach's form, beside a team: who a health habit skips. */
export const TEAM_HEALTH_NOTE_DRAFT = 'Health habits reach the adults on a team only.';

export const HEALTH_OFF_LINE = 'Health habits (sleep, body weight, food) open when FEL’s wording for them is approved.';

export const HABIT_ERROR_COPY: Record<HabitError | 'habit_adults_only' | 'not_your_athlete' | 'not_your_team' | 'too_many_habits', string> = {
  preset: 'Pick a habit, or Custom.',
  label_required: 'Give the habit a name.',
  habit_is_pain: 'Pain goes through FEL’s own pain check-in, not a habit.',
  health_off: HEALTH_OFF_LINE,
  kind: 'Pick tick-off or a number.',
  target: 'The target is a number above zero.',
  unit: 'Keep the unit to letters, like min or km.',
  frequency: 'Pick daily, or 1 to 6 days a week.',
  habit_adults_only: 'That habit is for adults only.',
  not_your_athlete: 'That athlete is not on your roster.',
  not_your_team: 'You do not run that team.',
  too_many_habits: 'That is the most habits one coach can run. Archive one first.',
};
