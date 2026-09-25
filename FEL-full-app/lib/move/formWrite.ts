// formWrite — the session's form read, written (movement play, phase 10, 2026-09-24).
//
// Called by POST /api/sessions inside its transaction, with a form already bounded by boundFormSummary and planned
// before the session's drillResult rows (writeFormPlan; review D2: a measured jump is the session's one power
// reading, formSummary.gameRowAttrs). Two writes:
//   · every attempt's raw numbers as a WorkoutScan row (the player's history: 'dunk' / 'jump' / 'shot_form' /
//     'strike_form' / 'board_form'; see formSummary.scanKindFor);
//   · at most ONE PrqEntry per session: power from a dunk session's best measured jump (formSummary
//     POWER_SESSION_MODES), unit 'score', source 'camera' — an
//     estimate, so it counts in the PRQ vector and no verified shield stands on it (lib/prq.ts isPrqEstimate).
//
// Kept out of the route file so it can be tested against a fake transaction (vitest does not collect app/).

import type { Prisma } from '@/public/_prisma/client';
import { createPrqEntry } from '@/lib/prq-entries';
import { PRQ_CAMERA_SOURCE } from '@/lib/prq';
import { planFormWrite, type FormSummary, type FormWritePlan } from './formSummary';

export interface FormWriteResult {
  /** History rows written (one per kept attempt). */
  stored: number;
  /** The camera power entry, with the previous camera estimate for a "since last time" line; null when no jump was measured. */
  power: { value: number; previous: number | null; heightCm: number; flightMs: number; source: typeof PRQ_CAMERA_SOURCE } | null;
}

export async function writeFormRead(
  db: Prisma.TransactionClient,
  form: FormSummary,
  ctx: { userId: string; sessionId: string; measuredAt: Date },
): Promise<FormWriteResult> {
  return writeFormPlan(db, planFormWrite(form, ctx));
}

/**
 * The write for a plan already made. REVIEW (2026-09-24, D2): POST /api/sessions plans BEFORE its drillResult rows,
 * because a measured jump is the session's one power reading (formSummary.gameRowAttrs), and writes the plan it
 * decided on rather than planning twice.
 */
export async function writeFormPlan(db: Prisma.TransactionClient, plan: FormWritePlan): Promise<FormWriteResult> {
  if (plan.scans.length) {
    await db.workoutScan.createMany({
      data: plan.scans.map((r) => ({ userId: r.userId, kind: r.kind, metrics: r.metrics as Prisma.InputJsonValue })),
    });
  }

  if (!plan.power || !plan.best) return { stored: plan.scans.length, power: null };

  // read before the write, so "previous" is the last session's estimate and not this one
  const prev = await db.prqEntry.findFirst({
    where: { userId: plan.power.userId, attribute: plan.power.attribute, source: PRQ_CAMERA_SOURCE },
    orderBy: { measuredAt: 'desc' },
    select: { value: true },
  });
  // Not caught. planFormWrite builds an entry createPrqEntry's validation accepts (formWrite.test pins it), so a throw
  // here is the database failing, and a failed statement inside a Postgres transaction aborts it: swallowed, the
  // transaction's COMMIT would roll back the whole session while the route answered ok. It fails loudly instead.
  await createPrqEntry(db, plan.power);
  return {
    stored: plan.scans.length,
    power: { value: plan.power.value, previous: prev?.value ?? null, heightCm: plan.best.heightCm, flightMs: plan.best.flightMs, source: PRQ_CAMERA_SOURCE },
  };
}
