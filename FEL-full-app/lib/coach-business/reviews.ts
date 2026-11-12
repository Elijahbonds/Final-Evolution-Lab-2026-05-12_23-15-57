// lib/coach-business/reviews.ts — COACH-DELIVERY COA-10 (2026-10-27): a client's review of a coach once a package has ended,
// shown on the coach's page and in find-a-coach. CoachReview (prisma/pending/2026-10-26-coach-delivery.sql), raw SQL behind
// the lane's probe; the eligibility reads CoachSale (the coach-business SQL) behind its own probe.
//
// WHO MAY REVIEW: a VERIFIED ADULT (the DB's User.dobYear; teens never) who BOUGHT from this coach — a sale where money moved
// (paidAt set) and that was not refunded in full — once that package ENDED:
//   · monthly coaching: the subscription ended (status CANCELED);
//   · a one-off package (session pack, review, program, team fee): REVIEW_AFTER_DAYS after it was paid.
//     assumption (new, owner call): FEL cannot see when a session pack is used up, so two weeks stands in for "ended".
// One review per client per coach (a later one replaces their earlier one).
//
// THE TEXT: up to TEXT_MAX characters, refused when it names a condition, a treatment or a guarantee (lib/share/screen.ts, the
// trainers'-words screen) or carries contact details (an email, a phone number, a link, a handle) — written here.
// The SHARED ABUSE SCREEN (SAF-06, lib/safety/textScreen.ts) is on lane/safety and has NOT landed: until it does, the text
// is shown to the COACH only and the public page shows the stars and the count (REVIEW_TEXT_PUBLIC). Turning text on is
// one line once SAF-06 is wired into cleanReview — routed to the safety lane in the report.
// The coach may HIDE a review from their page; they can never edit one.
import { isPublishable } from '@/lib/share/screen';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { asIso, deliveryReady, readRows, res, strOrNull, writeRows, type Res } from '@/lib/coach/delivery/probe';
import { businessReady, type RawDb } from './store';

export const STARS = { min: 1, max: 5 } as const;
import { TEXT_MAX } from './reviewCopy';
export { TEXT_MAX };
/** (new, assumption) Days after a one-off package is paid that it counts as ended. */
export const REVIEW_AFTER_DAYS = 14;
/** OFF until SAF-06's shared screen checks review text (see the header). */
export const REVIEW_TEXT_PUBLIC = false as const;

const CONTACT = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(https?:\/\/|www\.)|(\+?\d[\d\s().-]{7,}\d)|(^|\s)@[a-z0-9_.]{2,}/i;

export function cleanReview(body: unknown): { ok: true; stars: number; text: string | null } | { ok: false; error: 'stars' | 'text_too_long' | 'text_claims' | 'text_contact' } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const stars = b.stars;
  if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < STARS.min || stars > STARS.max) return { ok: false, error: 'stars' };
  const text = typeof b.text === 'string' ? b.text.replace(/\s+/g, ' ').trim() : '';
  if (text.length > TEXT_MAX) return { ok: false, error: 'text_too_long' };
  if (text && CONTACT.test(text)) return { ok: false, error: 'text_contact' };
  if (text && !isPublishable(text)) return { ok: false, error: 'text_claims' };
  return { ok: true, stars, text: text || null };
}

export interface SaleFact { kind: string; status: string; paidAt: Date | null }

/** Has a package from this coach ended for this buyer? (see the header) */
export function packageEnded(sales: readonly SaleFact[], now: Date): boolean {
  return sales.some((s) => s.paidAt && s.status !== 'REFUNDED' && (s.kind === 'monthly'
    ? s.status === 'CANCELED'
    : now.getTime() - s.paidAt.getTime() >= REVIEW_AFTER_DAYS * 86_400_000));
}

const NOW = `(NOW() AT TIME ZONE 'UTC')`;
export const SQL = {
  sales: `SELECT "id", "kind", "status", "paidAt" FROM "CoachSale" WHERE "coachId" = $1 AND "buyerId" = $2 AND "paidAt" IS NOT NULL ORDER BY "paidAt" DESC LIMIT 20`,
  dob: `SELECT "dobYear" FROM "User" WHERE "id" = $1`,
  upsert:
    `INSERT INTO "CoachReview" ("id", "coachId", "athleteId", "saleId", "stars", "text", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, 'shown', ${NOW}, ${NOW}) ` +
    `ON CONFLICT ("coachId", "athleteId") DO UPDATE SET "stars" = EXCLUDED."stars", "text" = EXCLUDED."text", "saleId" = EXCLUDED."saleId", "updatedAt" = EXCLUDED."updatedAt"`,
  mine: `SELECT "id", "stars", "text", "status", "updatedAt" FROM "CoachReview" WHERE "coachId" = $1 AND "athleteId" = $2`,
  forCoach: `SELECT r."id", r."stars", r."text", r."status", r."updatedAt", u."name" FROM "CoachReview" r LEFT JOIN "User" u ON u."id" = r."athleteId" WHERE r."coachId" = $1 ORDER BY r."updatedAt" DESC LIMIT 200`,
  setStatus: `UPDATE "CoachReview" SET "status" = $3, "updatedAt" = ${NOW} WHERE "id" = $1 AND "coachId" = $2`,
  summary: `SELECT "coachId", COUNT(*)::int AS "n", AVG("stars")::float AS "avg" FROM "CoachReview" WHERE "coachId" = ANY($1::text[]) AND "status" = 'shown' GROUP BY "coachId"`,
  shownFor: `SELECT "stars", "text", "updatedAt" FROM "CoachReview" WHERE "coachId" = $1 AND "status" = 'shown' ORDER BY "updatedAt" DESC LIMIT 20`,
} as const;

async function eligibility(db: RawDb, coachId: string, athleteId: string, now: Date): Promise<{ ok: true; saleId: string } | { ok: false; error: 'adults_only' | 'no_ended_package' }> {
  const u = (await db.$queryRawUnsafe<{ dobYear: number | null }[]>(SQL.dob, athleteId).catch(() => []))[0];
  if (!verifiedAdult(u?.dobYear ?? null, now)) return { ok: false, error: 'adults_only' };
  if (!(await businessReady(db))) return { ok: false, error: 'no_ended_package' };
  const rows = await db.$queryRawUnsafe<{ id: string; kind: string; status: string; paidAt: Date | string | null }[]>(SQL.sales, coachId, athleteId).catch(() => []);
  const sales = rows.map((r) => ({ id: String(r.id), kind: String(r.kind), status: String(r.status), paidAt: r.paidAt ? new Date(r.paidAt) : null }));
  const ended = sales.find((s) => packageEnded([s], now));
  return ended ? { ok: true, saleId: ended.id } : { ok: false, error: 'no_ended_package' };
}

/** GET for an athlete: may they review this coach, and their review if any. */
export async function reviewContext(db: RawDb, athleteId: string, coachId: string, now: Date = new Date()): Promise<Res> {
  if (!(await deliveryReady(db, now.getTime()))) return res(200, { available: false });
  const e = await eligibility(db, coachId, athleteId, now);
  const mine = (await readRows(db, now.getTime(), 'review_read_failed', () => db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.mine, coachId, athleteId)))?.[0];
  return res(200, { available: true, eligible: e.ok, why: e.ok ? null : e.error, mine: mine ? { stars: Number(mine.stars), text: strOrNull(mine.text), status: String(mine.status) } : null });
}

export async function submitReview(db: RawDb, athleteId: string, body: unknown, now: Date = new Date()): Promise<Res> {
  if (!(await deliveryReady(db, now.getTime()))) return res(503, { error: 'delivery_not_ready' });
  const coachId = body && typeof body === 'object' ? (body as { coachId?: unknown }).coachId : null;
  if (typeof coachId !== 'string' || !coachId || coachId === athleteId) return res(400, { error: 'bad_coach' });
  const c = cleanReview(body);
  if (!c.ok) return res(400, { error: c.error });
  const e = await eligibility(db, coachId, athleteId, now);
  if (!e.ok) return res(e.error === 'adults_only' ? 403 : 409, { error: e.error });
  const { randomUUID } = await import('node:crypto');
  const n = await writeRows(db, now.getTime(), 'review_write_failed', () => db.$executeRawUnsafe(SQL.upsert, randomUUID(), coachId, athleteId, e.saleId, c.stars, c.text));
  return n ? res(200, { ok: true }) : res(500, { error: 'not_saved' });
}

/** The coach's own reviews (text included: private feedback), and hide/show. */
export async function coachReviews(db: RawDb, coachId: string, now: Date = new Date()): Promise<Res> {
  const rows = await readRows(db, now.getTime(), 'review_read_failed', () => db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.forCoach, coachId));
  if (!rows) return res(200, { available: false });
  return res(200, { available: true, textPublic: REVIEW_TEXT_PUBLIC, reviews: rows.map((r) => ({ id: String(r.id), stars: Number(r.stars), text: strOrNull(r.text), status: String(r.status), name: (strOrNull(r.name) ?? 'A client').split(' ')[0], updatedAt: asIso(r.updatedAt) })) });
}

export async function setReviewStatus(db: RawDb, coachId: string, body: unknown, now: Date = new Date()): Promise<Res> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.id !== 'string' || (b.action !== 'hide' && b.action !== 'show')) return res(400, { error: 'bad_request' });
  const n = await writeRows(db, now.getTime(), 'review_write_failed', () => db.$executeRawUnsafe(SQL.setStatus, b.id, coachId, b.action === 'hide' ? 'hidden' : 'shown'));
  return n === null ? res(503, { error: 'delivery_not_ready' }) : n ? res(200, { ok: true }) : res(404, { error: 'not_found' });
}

export interface ReviewSummary { count: number; avg: number }

/** Shown reviews' count and average per coach (find-a-coach, the coach page). Empty before the SQL. Never throws. */
export async function reviewSummaries(db: RawDb, coachIds: readonly string[], now = Date.now()): Promise<Map<string, ReviewSummary>> {
  const out = new Map<string, ReviewSummary>();
  if (!coachIds.length) return out;
  const rows = await readRows(db, now, 'review_read_failed', () => db.$queryRawUnsafe<{ coachId: string; n: number; avg: number }[]>(SQL.summary, [...coachIds]));
  for (const r of rows ?? []) out.set(String(r.coachId), { count: Number(r.n), avg: Math.round(Number(r.avg) * 10) / 10 });
  return out;
}

/** The coach page's section: the summary, and each shown review's stars (and its text once REVIEW_TEXT_PUBLIC). */
export async function publicReviews(db: RawDb, coachId: string, now = Date.now()): Promise<{ summary: ReviewSummary | null; items: { stars: number; text: string | null; at: string }[] }> {
  const summary = (await reviewSummaries(db, [coachId], now)).get(coachId) ?? null;
  const rows = summary ? (await readRows(db, now, 'review_read_failed', () => db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.shownFor, coachId))) ?? [] : [];
  return { summary, items: rows.map((r) => ({ stars: Number(r.stars), text: REVIEW_TEXT_PUBLIC ? strOrNull(r.text) : null, at: asIso(r.updatedAt).slice(0, 10) })) };
}

export { REVIEW_ERROR_COPY } from './reviewCopy';
