// lib/coach/parity/probe.ts — COACH-PARITY (2026-10-26): the one probe and the switches for check-in forms and habits.
//
// THE TABLES ARE NOT ON PRODUCTION YET: they arrive with prisma/pending/2026-10-26-coach-parity.sql, which the owner
// applies. The probe is the shared one (lib/coach/pendingSchema.ts): until the tables are there every read answers
// "not available" and every write "not ready", and applying the SQL switches both features on within minutes, no deploy.
// The five tables arrive in one file; CoachHabitTick is created last, so its presence means all five are there.
//
// THE SWITCHES (.env.example, both default OFF):
//   COACH_PARITY_HEALTH_ENABLED  health questions in a check-in and health habits (sleep, body weight, diet). Their
//                                athlete-facing lines are DRAFTS for the owner (lib/coach/checkins/copy.ts, habits/copy.ts),
//                                so a coach cannot add one and an athlete is never asked one until the owner approves the
//                                wording and turns this on. Training questions and habits need no switch.
//   COACH_IMPORT_AI_ENABLED      the importer may ask the AI to read a paste the rules could not (lib/coach/import/ai.ts).
//                                It needs the Abacus kill switch on too (lib/abacus/killSwitch.ts, switch + key). Off, the deterministic
//                                parser does it all.
import { pendingProbe, type RawDb } from '../pendingSchema';

export type { RawDb };

const probe = pendingProbe('coach_parity', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'CoachHabitTick' LIMIT 1`);

export function parityReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}

/** A statement that relies on the tables failed (see pendingSchema.ts fail()). */
export function parityFail(event: string, e: unknown, now: number = Date.now()): void {
  probe.fail(event, e, now);
}

/** Tests only. */
export function resetParityProbe(): void {
  probe.reset();
}

type Env = Readonly<Record<string, string | undefined>>;
const on = (v: string | undefined) => v === 'true' || v === '1';

/** Health questions and health habits: off until the owner approves their wording (see the header). */
export function parityHealthEnabled(env: Env = process.env): boolean {
  return on(env.COACH_PARITY_HEALTH_ENABLED);
}

/** The importer's AI assist: its own switch AND the Abacus kill switch (the caller checks that one). */
export function importAiSwitch(env: Env = process.env): boolean {
  return on(env.COACH_IMPORT_AI_ENABLED);
}
