// lib/creator/inquiryStore.ts — "Work with us" inquiries, stored in Postgres with raw SQL (owner, 2026-10-13).
//
// THE TABLE IS NOT ON PRODUCTION YET: it arrives with prisma/pending/2026-10-13-creator-inquiry.sql, which the owner
// applies. Until then every save answers `unavailable` and the route answers 503 inquiries_unavailable, with an honest
// message — never a 500 and never a silent drop (the release's pending-SQL pattern, lib/coach/pendingSchema.ts, which
// explains the cached information_schema probe). The generated Prisma client is not used and not regenerated.
//
// What is stored, and for how long: brand, contact name, email, budget range, dates, what they need, the message, which
// page it came from, and when. No IP address and no IP hash. An inquiry is deleted INQUIRY_RETENTION_DAYS after it was
// sent; the delete runs on every save, so an idle form keeps nothing past that either way on its next use, and the
// owner can also run it by hand (see the SQL file). lib/policies.ts states the same period to the visitor.
import { randomUUID } from 'node:crypto';
import { logPendingFailure, pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';

export type { RawDb };

/** How long an inquiry is kept before it is deleted. The privacy policy (lib/policies.ts) says the same. */
export const INQUIRY_RETENTION_DAYS = 365;

export type InquiryStatus = 'NEW';

export interface InquiryRecord {
  brand: string;
  contactName: string;
  email: string;
  budgetRange: string;
  dates: string;
  deliverables: string;
  message: string;
  profileSlug: string | null;
  source: string;
}

export type SaveInquiryResult = { ok: true; id: string } | { ok: false; reason: 'unavailable' | 'failed' };

const probe = pendingProbe(
  'creator_inquiry',
  `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'CreatorInquiry' LIMIT 1`,
);

/** Tests only. */
export function resetInquiryProbe(): void {
  probe.reset();
}

/** Is the table there? Never throws. A "no" is asked again after a few minutes, so applying the SQL switches it on. */
export function inquiriesReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}

export const INSERT_SQL =
  `INSERT INTO "CreatorInquiry" ("id", "brand", "contactName", "email", "budgetRange", "dates", "deliverables", "message", "profileSlug", "source", "status", "createdAt") ` +
  `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'NEW', (NOW() AT TIME ZONE 'UTC'))`;

export const PURGE_SQL = `DELETE FROM "CreatorInquiry" WHERE "createdAt" < ((NOW() AT TIME ZONE 'UTC') - make_interval(days => $1::int))`;

/** Save one inquiry. Resolves `unavailable` when the table is not there, `failed` on any other database error. */
export async function saveInquiry(db: RawDb, record: InquiryRecord, now: number = Date.now()): Promise<SaveInquiryResult> {
  if (!(await probe.ready(db, now))) return { ok: false, reason: 'unavailable' };
  const id = randomUUID();
  try {
    await db.$executeRawUnsafe(
      INSERT_SQL,
      id,
      record.brand,
      record.contactName,
      record.email,
      record.budgetRange,
      record.dates,
      record.deliverables,
      record.message,
      record.profileSlug,
      record.source,
    );
  } catch (e) {
    probe.fail('creator_inquiry_write_failed', e, now);
    // A vanished table reads as unavailable (the probe is reset); anything else is a real failure to report.
    return { ok: false, reason: (await probe.ready(db, now)) ? 'failed' : 'unavailable' };
  }
  // Retention: delete what is past its period. Best effort; the inquiry above is already saved.
  await db.$executeRawUnsafe(PURGE_SQL, INQUIRY_RETENTION_DAYS).catch((e: unknown) => logPendingFailure('creator_inquiry_purge_failed', e));
  return { ok: true, id };
}
