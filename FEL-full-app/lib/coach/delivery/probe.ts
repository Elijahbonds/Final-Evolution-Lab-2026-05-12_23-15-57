// lib/coach/delivery/probe.ts — COACH-DELIVERY (2026-10-26): the one probe for the lane's tables, and its switches.
//
// THE TABLES ARE NOT ON PRODUCTION YET: they arrive with prisma/pending/2026-10-26-coach-delivery.sql, which the owner
// applies. The probe is the shared one (lib/coach/pendingSchema.ts): until the tables are there every read answers "not
// available" and every write "not ready" (503 delivery_not_ready), and applying the SQL switches the features on within
// minutes, no deploy. The seven tables arrive in one file; CoachReview is created last, so its presence means all are.
//
// THE SWITCHES (.env.example, default OFF/unset):
//   COACH_AUTOMATIONS_CRON_SECRET  the scheduled sweep (POST /api/cron/coach-automations, header x-coach-automations-secret).
//                                  Unset = the route answers 503 and nothing runs on a schedule; a coach's own "Run now"
//                                  still works. An automation never emails, so EMAIL_ENABLED plays no part.
import { pendingProbe, type RawDb } from '../pendingSchema';

export type { RawDb };

const probe = pendingProbe('coach_delivery', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'CoachReview' LIMIT 1`);

export function deliveryReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}

/** A statement that relies on the tables failed (see pendingSchema.ts fail()). */
export function deliveryFail(event: string, e: unknown, now: number = Date.now()): void {
  probe.fail(event, e, now);
}

/** Tests only. */
export function resetDeliveryProbe(): void {
  probe.reset();
}

export interface Res { status: number; body: Record<string, unknown> }
export const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });
export const NOT_READY: Res = res(503, { error: 'delivery_not_ready' });

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? new Date(v).toISOString() : new Date(0).toISOString());
export const asIso = iso;
export const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
export const strOrNull = (v: unknown): string | null => (v == null ? null : String(v));

/** A read behind the probe: null before the SQL, or when the statement fails. Never throws. */
export async function readRows<T>(db: RawDb, now: number, event: string, run: () => Promise<T>): Promise<T | null> {
  if (!(await deliveryReady(db, now))) return null;
  try { return await run(); } catch (e) { deliveryFail(event, e, now); return null; }
}

/** A write behind the probe: the affected-row count, or null before the SQL / on failure. Never throws. */
export async function writeRows(db: RawDb, now: number, event: string, run: () => Promise<number>): Promise<number | null> {
  if (!(await deliveryReady(db, now))) return null;
  try { return Number(await run()); } catch (e) { deliveryFail(event, e, now); return null; }
}
