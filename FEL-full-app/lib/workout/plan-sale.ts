/**
 * lib/workout/plan-sale.ts — what /workout sells, at what price, and what the app says about it. PURE, client-safe.
 *
 * MIRROR-COACH P1 (2026-09-25), owner decision #3: PULL /workout FROM SALE now; relaunch later on FEL templates behind
 * the protocol gate. What it sold was one flat plan for everyone (the page planned from defaultMetrics, so every buyer
 * got the Mobility focus), sets and reps that never change across 12 weeks under a card that said "Full periodized
 * build", and "Depth Drop to Vertical" 4x4 in week 1 with no gate (lib/workout/plan-generator.ts). P1 refused the sale
 * twice on the server: the purchase route answered every POST with PLAN_SALE_PAUSED before it read anything, and both
 * SKUs sat in NOT_ON_SALE (lib/wallet/catalog.ts), so spend() refused them from any route.
 *
 * MIRROR-COACH P8 (2026-09-29), owner decisions #3, #23 and #24: THE RELAUNCH. Both products are back on sale at the
 * SAME shard prices as before — the SKUs never left the catalog, so each still carries the price it always had (60 and
 * 200, lib/wallet/catalog.ts; relaunch.test.ts pins both) — and what they buy is new: a FEL template matched to the
 * buyer's answers (lib/coach/templates templateFor), behind the protocol gate, never the old generator's weeks
 * (lib/workout/relaunch.ts). Past buyers get them free (lib/workout/pastBuyer.ts). The change that put them back is two
 * lines: both SKUs out of NOT_ON_SALE, and the purchase route's blanket refusal gone. The tier strings plans are stored
 * under did not change, so the wallet's dead-buy sweep reads every plan the way it always did (lib/wallet/dead-buys.ts).
 */

/** The SKUs /workout sells. Back on sale since MIRROR-COACH P8 (relaunch.test.ts pins it). */
export const WORKOUT_PLAN_SKUS = ['workout_plan_4w', 'workout_program_12w'] as const;
export type WorkoutPlanSku = (typeof WORKOUT_PLAN_SKUS)[number];

/** WorkoutPlan.tier, as the plan route has always stored it (dead-buys.ts matches a charge to a plan by it). */
export type WorkoutTier = 'plan_4w' | 'program_12w';

export interface WorkoutProduct {
  tier: WorkoutTier;
  sku: WorkoutPlanSku;
  /** What the page calls it. */
  name: string;
  weeks: 4 | 12;
  /** 4-week waves it runs (lib/coach/templates/waves.ts): one, or three back to back. */
  waves: 1 | 3;
  /** One line under the name. */
  line: string;
}

/**
 * The two products, as they always were: a 4-week plan and a 12-week one. What changed is what they hold (MIRROR-COACH
 * P8): one FEL template wave, or three of them — in the second wave each lift that does not land moves one rung up its
 * ladder, and in the third again where its ladder has a rung left (lib/coach/templates expandTemplate).
 *
 * MIRROR-COACH P8 FIX (2026-09-30, code review). The 12-week line said every adult lift "moves one step up its ladder in
 * the second and third" — measured over expandTemplate, only 5–6 of each adult template's 20–22 items move again in wave
 * 3 (most reach the top of their ladder in wave 2), so weeks 9–12 are mostly weeks 5–8 again; the line now says exactly
 * that much (templates/index.test.ts holds it to the measured moves). And a YOUTH template's weeks never move on their
 * own, so its 12 weeks were the 4-week plan three times over at 200 shards against 60: the 12-week plan is adults only
 * now (relaunchServer.ts offers and sells it to an adult only; WORKOUT_YOUTH_LINE says why).
 */
export const WORKOUT_PRODUCTS: readonly WorkoutProduct[] = [
  { tier: 'plan_4w', sku: 'workout_plan_4w', name: '4-week plan', weeks: 4, waves: 1, line: 'One four-week wave of your template.' },
  {
    tier: 'program_12w', sku: 'workout_program_12w', name: '12-week plan', weeks: 12, waves: 3,
    line: 'Three four-week waves back to back, for adults. In the second wave each lift that does not land moves one step up its ladder, and in the third it moves again where its ladder has a step left.',
  },
];

/** The products a reader of this audience may buy (MIRROR-COACH P8 FIX): a youth reader, the 4-week plan only. */
export const productsFor = (audience: 'adult' | 'youth'): readonly WorkoutProduct[] =>
  (audience === 'youth' ? WORKOUT_PRODUCTS.filter((p) => p.tier === 'plan_4w') : WORKOUT_PRODUCTS);

export const productFor = (tier: unknown): WorkoutProduct | null => WORKOUT_PRODUCTS.find((p) => p.tier === tier) ?? null;
export const productForSku = (sku: unknown): WorkoutProduct | null => WORKOUT_PRODUCTS.find((p) => p.sku === sku) ?? null;

// ── the answers (MIRROR-COACH P8) ────────────────────────────────────────────────────────────────────────────────────

/**
 * What the buyer tells /workout: how many days a week they train and what equipment they have. Their AGE is not an
 * answer: the server reads the account's birth year (lib/mirror/youth.ts isMinorForMirror) and a youth reader gets a
 * youth template whatever the page sends (lib/workout/relaunch.ts pickTemplate).
 */
export interface WorkoutAnswers { daysPerWeek: 2 | 3 | 4; equipment: 'bodyweight' | 'gym' }

/** The days the page offers: an adult template is 3 or 4 days, a youth one 2 or 3 (lib/coach/templates/list.ts templateFor). */
export const DAY_CHOICES = { adult: [3, 4], youth: [2, 3] } as const;

/**
 * The answers from a request body, or null when they are not exactly what the page sends. With `audience` (MIRROR-COACH
 * P8 FIX, 2026-09-30), the days must also be one the page offers that audience (DAY_CHOICES): an adult's "2 days" used to
 * be taken and mapped to the 3-day template, which the page never previewed to them.
 */
export function parseAnswers(v: unknown, audience?: 'adult' | 'youth'): WorkoutAnswers | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const { daysPerWeek, equipment } = v as Record<string, unknown>;
  if (daysPerWeek !== 2 && daysPerWeek !== 3 && daysPerWeek !== 4) return null;
  if (equipment !== 'bodyweight' && equipment !== 'gym') return null;
  if (audience && !(DAY_CHOICES[audience] as readonly number[]).includes(daysPerWeek)) return null;
  return { daysPerWeek, equipment };
}

// ── the words (MIRROR-COACH P8; FEL's draft, for the owner to approve) ───────────────────────────────────────────────
// Owner rule (c): the copy says what a plan is — "a FEL template matched to your answers" — never "periodized" (the
// waves are named as four-week waves and as FEL's choice) and never "scored". relaunch.test.ts lints every line here.

/** Under the page title. */
export const WORKOUT_INTRO =
  'A FEL template matched to your answers: how many days a week you train and what equipment you have. Every week trains all six patterns (squat, hinge, lunge, push, pull, carry), and pulls at least as much as it presses.';

/**
 * The adult template's jumps, said before anyone buys. The weeks figure is the protocol gate's LANDING_CHECK_WEEKS
 * (relaunch.test.ts holds them equal; the gate module is not imported here to keep this file light for the page).
 */
export const WORKOUT_JUMP_LINE =
  'Some adult days open with a jump. It shows as written once your health answers are in, current and hold nothing that keeps jumps back, a recent pain check-in (if any) says carry on, and a landing check from the last 4 weeks is on file. Until then you get its easier step and one line saying why.';

/**
 * A reader under 18. MIRROR-COACH P8 FIX (2026-09-30): no longer "or no birth year" — a blank birth year buys nothing
 * until it is answered (WORKOUT_AGE_NEEDED_LINE) — and it says why there is no 12-week plan.
 */
export const WORKOUT_YOUTH_LINE =
  "Under 18: you get a youth template. Bodyweight only, no jumps, and effort tops out at Drive. The 12-week plan is for adults: a youth template's weeks don't step up on their own, so it would be the same four weeks three times.";

/**
 * MIRROR-COACH P8 FIX (2026-09-30, code review — blocker "An account with no birth year buys, or claims free, a youth plan
 * it keeps for good"). Decision #20 is "blank = youth rules UNTIL ANSWERED", but a plan is stored as the weeks it was
 * bought with, so a youth template bought on a blank birth year stayed youth after the answer. Nothing is sold or claimed
 * until the birth year is on file (relaunchServer.ts 409 age_needed); the page says this, with the link.
 */
export const WORKOUT_AGE_NEEDED_LINE =
  'Add your birth year in your health answers first: it decides which template you get, and a plan keeps the template it was made with.';
/** Where the birth year is answered (the health intake, in the Mirror — lib/coach/protocolGate.ts HEALTH_ANSWERS_HREF). */
export const WORKOUT_AGE_HREF = '/play/mirror';

/** On a product a past buyer claims free (lib/workout/pastBuyer.ts). */
export const WORKOUT_FREE_LINE = 'Free for you: you bought a plan here before.';

/** When the server could not read the past purchases: nothing is sold on that read (a past buyer must never be charged). */
export const WORKOUT_CHECK_FAILED = "We couldn't check your past purchases just now, so nothing can be bought until you reload the page.";

/** When the server could not read the birth year (MIRROR-COACH P8 FIX: it used to show WORKOUT_CHECK_FAILED, which blamed
 *  the past purchases). */
export const WORKOUT_AGE_UNREAD = "We couldn't read your account's birth year just now, so nothing can be bought until you reload the page.";

/**
 * The purchase route's answer when the charge went through and the plan did not save. MIRROR-COACH P8 FIX (2026-09-30):
 * the server now finishes such a charge on the next press of that product, with any key — a reload no longer loses it
 * (relaunchServer.ts, pastBuyer.ts unfinishedCharges) — so the line can say "or after a reload".
 */
export const WORKOUT_PLAN_NOT_SAVED =
  'Your shards were taken but the plan did not save. Press the button again, now or after a reload: it finishes this same purchase without charging you twice.';

/** A paid plan with no plan on file (its write failed, or it was deleted): the page offers to write it, uncharged. */
export const unfinishedLine = (name: string): string => `You paid for a ${name} that isn't on your account now. Get it: the payment you made covers it, and nothing more is taken.`;

/** The server would now pick another template than the one the page showed (the account changed since it loaded). */
export const WORKOUT_TEMPLATE_CHANGED = 'Your account changed since this page loaded, so it was showing the wrong template. The page has been reloaded: check your plan and press again.';

/**
 * P1's line from the days the sale was pulled, word for word (FEL's draft, MIRROR-COACH P1 review, 2026-09-25).
 * MIRROR-COACH P8: nothing shows it any more — the sale is back. It stays exported, unchanged, because P1's recorded
 * baseline probe (scripts/probes/_mirror-baseline.mts) and plan-revision.test.ts's pinned words still name it.
 */
export const PLAN_SALE_PAUSED = 'The training plan is being rebuilt; it will be back with real programs.';

/**
 * MIRROR-COACH P2 (2026-09-25), owner decisions #23 and #24 (painfree/DECISIONS-2.md): NO REFUND for a /workout plan.
 * Its buyer keeps the corrected plan and gets the relaunched plans free. Every revised plan's in-app note ends with this
 * line (plan-revision.ts).
 *
 * MIRROR-COACH P8 (2026-09-29): the promise is kept, so the line stops saying "when they ship" and says where they are.
 * MIRROR-COACH P8 FIX (2026-09-30, code review): it said "one of each is free for you", and stayed on every revised plan
 * after both claims were used, beside prices. A past buyer now has every template free, one plan per product and template
 * (lib/workout/pastBuyer.ts), and anyone holding a revised (legacy) plan is a past buyer — so this line is true on every
 * read it shows on. The note is worked out on every read and never stored. FEL's wording, for the owner to approve.
 */
export const RELAUNCH_FREE_LINE = 'Our new training plans are here, and they are free for you: pick one at the top of this page.';
