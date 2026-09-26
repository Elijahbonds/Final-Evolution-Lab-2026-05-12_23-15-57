/**
 * lib/workout/plan-sale.ts — /workout's plans are not on sale, and what the app says about it. PURE, client-safe.
 *
 * MIRROR-COACH P1 (2026-09-25), owner decision #3: PULL /workout FROM SALE now; relaunch later on FEL templates behind
 * the protocol gate. What it sold was one flat plan for everyone (the page planned from defaultMetrics, so every buyer
 * got the Mobility focus), sets and reps that never change across 12 weeks under a card that said "Full periodized
 * build", and "Depth Drop to Vertical" 4x4 in week 1 with no gate (lib/workout/plan-generator.ts).
 *
 * The refusal is on the server twice: POST /api/v1/workout/plan answers every purchase with this message before it
 * reads anything, and both SKUs are in NOT_ON_SALE (lib/wallet/catalog.ts), so spend() refuses them from any route.
 * The page only repeats what the server already does. Buyers keep their plans: GET /api/v1/workout/plan still returns
 * them, revised (lib/workout/plan-revision.ts).
 */

/** The SKUs /workout sold. Both are held in NOT_ON_SALE until the relaunch (plan-sale.test.ts pins it). */
export const WORKOUT_PLAN_SKUS = ['workout_plan_4w', 'workout_program_12w'] as const;

/**
 * What the purchase route answers and the page says, word for word. FEL's draft (MIRROR-COACH P1 review, 2026-09-25):
 * decision #3 pulled the sale and gave no wording, so this line is for the owner to approve.
 */
export const PLAN_SALE_PAUSED = 'The training plan is being rebuilt; it will be back with real programs.';

/**
 * MIRROR-COACH P2 (2026-09-25), owner decisions #23 and #24 (painfree/DECISIONS-2.md): NO REFUND for a /workout plan.
 * Its buyer keeps the corrected plan and gets the relaunched plans free when they ship (the relaunch is P8, at the same
 * shard price as before for everyone else). Every revised plan's in-app note ends with this line (plan-revision.ts), so
 * it is a promise P8 must keep for every WorkoutPlan owner. "When they ship", no date: P8 has none. FEL's wording, for
 * the owner to approve.
 */
export const RELAUNCH_FREE_LINE = 'When our new training plans ship, you get them free.';
