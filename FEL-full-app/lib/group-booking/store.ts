// lib/group-booking/store.ts — GROUP-BOOKING: the seven pending tables in parameterised raw SQL, behind one probe
// (lib/coach/pendingSchema.ts). THE TABLES ARE NOT ON PRODUCTION YET: they arrive with prisma/pending/
// 2026-11-02-group-booking.sql, which the owner applies. Until then groupBookingReady() is false, every page says "Opens
// soon", every read answers "not available" and every write is refused before any statement runs; applying the SQL
// switches it on within minutes, no deploy. InPersonSession is created last, so its presence means all seven are there.
//
// Every statement is parameterised ($1, $2 …); nothing from a request is ever put into SQL text. Ids are made here.
//
// SEATS. A slot (one regular session of a group, or one make-up slot at a gym: calendar.ts groupSlotKey / makeupSlotKey)
// holds at most `max` people. A seat is taken inside a transaction, under a per-slot advisory lock (the coach-business
// holdSpot pattern), by giving it the lowest free seat NUMBER 1..max; the table's UNIQUE ("slotKey", "seat") is the
// backstop if anything ever skipped the lock. A cancelled seat gives its number back (seat = NULL).
import { randomBytes, randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import { isDayPair } from './config';
import type { GroupClass, GroupDecision, GroupPass, GroupSeat, JoinKind, PayMode, SeatKind, SeatStatus } from './rules';

export type { RawDb };

/** A RawDb that can also run a transaction (Prisma's interactive $transaction, or a test stand-in). */
export interface TxDb extends RawDb {
  $transaction<T>(fn: (tx: RawDb) => Promise<T>): Promise<T>;
}

const probe = pendingProbe('group_booking', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'InPersonSession' LIMIT 1`);

export function groupBookingReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}
export function groupBookingFailed(event: string, e: unknown, now: number = Date.now()): void {
  probe.fail(event, e, now);
}
/** Tests only. */
export function resetGroupBookingProbe(): void {
  probe.reset();
}

const NOW = `(NOW() AT TIME ZONE 'UTC')`;
const G = `"id", "ownerId", "trainerUserId", "name", "gymId", "dayPair", "hour", "startDate", "weeks", "minSeats", "maxSeats", "cutoffHours", "decision", "status"`;
const P = `"id", "groupId", "userId", "kind", "sessions", "startWeek", "windowEnd", "priceCents", "payMode", "paidAt", "status"`;
const S = `"id", "slotKey", "groupId", "gymId", "userId", "passId", "date", "startsAt", "kind", "makeupForId", "status", "late"`;
const T = `"id", "ownerId", "trainerUserId", "displayName", "inviteCode", "gyms", "weeklyHours", "online", "inPerson", "status"`;
const I = `"id", "trainerUserId", "clientUserId", "gymId", "startsAt", "minutes", "priceCents", "payMode", "paidAt", "status", "late"`;

export const SQL = {
  // gyms
  gyms: `SELECT "id", "address" FROM "GroupGym"`,
  setGym: `INSERT INTO "GroupGym" ("id", "address", "updatedAt") VALUES ($1, $2, ${NOW}) ON CONFLICT ("id") DO UPDATE SET "address" = EXCLUDED."address", "updatedAt" = EXCLUDED."updatedAt"`,
  // trainers
  trainersFor: `SELECT ${T} FROM "GroupTrainer" WHERE "ownerId" = $1 AND "status" <> 'removed' ORDER BY "createdAt" ASC LIMIT 50`,
  activeTrainerByUser: `SELECT ${T} FROM "GroupTrainer" WHERE "trainerUserId" = $1 AND "status" = 'active' LIMIT 1`,
  insertTrainer: `INSERT INTO "GroupTrainer" ("id", "ownerId", "displayName", "inviteCode", "gyms", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::jsonb, 'invited', ${NOW}, ${NOW})`,
  acceptTrainer: `UPDATE "GroupTrainer" SET "trainerUserId" = $2, "inviteCode" = NULL, "status" = 'active', "updatedAt" = ${NOW} WHERE "inviteCode" = $1 AND "status" = 'invited' AND "ownerId" <> $2 RETURNING "id", "ownerId", "displayName"`,
  updateTrainer: `UPDATE "GroupTrainer" SET "gyms" = $3::jsonb, "weeklyHours" = $4::jsonb, "online" = $5, "inPerson" = $6, "updatedAt" = ${NOW} WHERE "id" = $1 AND "ownerId" = $2 AND "status" <> 'removed'`,
  removeTrainer: `UPDATE "GroupTrainer" SET "status" = 'removed', "inviteCode" = NULL, "updatedAt" = ${NOW} WHERE "id" = $1 AND "ownerId" = $2`,
  // groups
  openGroups: `SELECT ${G} FROM "GroupClass" WHERE "status" = 'open' ORDER BY "startDate" ASC, "hour" ASC LIMIT 200`,
  groupById: `SELECT ${G} FROM "GroupClass" WHERE "id" = $1`,
  groupsForOwner: `SELECT ${G} FROM "GroupClass" WHERE "ownerId" = $1 ORDER BY "startDate" DESC, "hour" ASC LIMIT 200`,
  groupsForTrainer: `SELECT ${G} FROM "GroupClass" WHERE "trainerUserId" = $1 ORDER BY "startDate" DESC, "hour" ASC LIMIT 200`,
  insertGroup: `INSERT INTO "GroupClass" ("id", "ownerId", "trainerUserId", "name", "gymId", "dayPair", "hour", "startDate", "weeks", "minSeats", "maxSeats", "cutoffHours", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'open', ${NOW}, ${NOW})`,
  moveGym: `UPDATE "GroupClass" SET "gymId" = $3, "updatedAt" = ${NOW} WHERE "id" = $1 AND "ownerId" = $2 AND "status" = 'open'`,
  decide: `UPDATE "GroupClass" SET "decision" = $3, "decidedAt" = ${NOW}, "status" = CASE WHEN $3 = 'cancel' THEN 'cancelled' ELSE "status" END, "updatedAt" = ${NOW} WHERE "id" = $1 AND "ownerId" = $2 AND "status" = 'open'`,
  // seats and passes
  // pg_advisory_xact_lock returns void, which Prisma cannot deserialize: select a constant FROM it instead
  lockSlot: `SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext($1))`,
  seatsIn: `SELECT "slotKey", "seat" FROM "GroupSeat" WHERE "slotKey" = ANY($1::text[]) AND "seat" IS NOT NULL`,
  insertPass: `INSERT INTO "GroupPass" ("id", "groupId", "userId", "kind", "sessions", "startWeek", "windowEnd", "priceCents", "payMode", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', ${NOW}, ${NOW})`,
  insertSeat: `INSERT INTO "GroupSeat" ("id", "slotKey", "seat", "groupId", "gymId", "userId", "passId", "date", "startsAt", "kind", "makeupForId", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'booked', ${NOW}, ${NOW})`,
  seatsForUser: `SELECT ${S} FROM "GroupSeat" WHERE "userId" = $1 AND "startsAt" >= $2 ORDER BY "startsAt" ASC LIMIT 300`,
  seatById: `SELECT ${S} FROM "GroupSeat" WHERE "id" = $1`,
  seatsInSlot: `SELECT ${S} FROM "GroupSeat" WHERE "slotKey" = $1 ORDER BY "createdAt" ASC LIMIT 50`,
  makeupSeatsAt: `SELECT ${S} FROM "GroupSeat" WHERE "kind" = 'makeup' AND "gymId" = ANY($1::text[]) AND "startsAt" >= $2 AND "startsAt" < $3 AND "seat" IS NOT NULL ORDER BY "startsAt" ASC LIMIT 500`,
  makeupsFor: `SELECT "makeupForId" FROM "GroupSeat" WHERE "makeupForId" = ANY($1::text[])`,
  cancelSeat: `UPDATE "GroupSeat" SET "status" = 'cancelled', "seat" = NULL, "late" = $3, "makeupForId" = NULL, "cancelledAt" = ${NOW}, "updatedAt" = ${NOW} WHERE "id" = $1 AND "userId" = $2 AND "status" = 'booked'`,
  markSeat: `UPDATE "GroupSeat" SET "status" = $2, "updatedAt" = ${NOW} WHERE "id" = $1 AND "status" IN ('booked', 'present', 'missed')`,
  passesForUser: `SELECT ${P} FROM "GroupPass" WHERE "userId" = $1 AND "status" = 'active' ORDER BY "createdAt" DESC LIMIT 100`,
  passById: `SELECT ${P} FROM "GroupPass" WHERE "id" = $1`,
  passesForGroups: `SELECT ${P} FROM "GroupPass" WHERE "groupId" = ANY($1::text[]) AND "status" = 'active' LIMIT 2000`,
  setPassPaid: `UPDATE "GroupPass" SET "paidAt" = CASE WHEN $2 THEN ${NOW} ELSE NULL END, "markedPaidByUserId" = CASE WHEN $2 THEN $3 ELSE NULL END, "updatedAt" = ${NOW} WHERE "id" = $1 AND "status" = 'active'`,
  // waitlist
  insertWait: `INSERT INTO "GroupWaitlist" ("id", "groupId", "userId", "createdAt") VALUES ($1, $2, $3, ${NOW}) ON CONFLICT ("groupId", "userId") DO NOTHING`,
  waitFor: `SELECT "groupId", "userId", "createdAt" FROM "GroupWaitlist" WHERE "groupId" = ANY($1::text[]) ORDER BY "createdAt" ASC LIMIT 1000`,
  // in-person 1:1
  insertInPerson: `INSERT INTO "InPersonSession" ("id", "trainerUserId", "clientUserId", "gymId", "startsAt", "minutes", "priceCents", "payMode", "status", "slotLock", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'booked', $9, ${NOW}, ${NOW}) ON CONFLICT ("slotLock") DO NOTHING`,
  inPersonForTrainers: `SELECT ${I} FROM "InPersonSession" WHERE "trainerUserId" = ANY($1::text[]) AND "startsAt" >= $2 AND "startsAt" < $3 ORDER BY "startsAt" ASC LIMIT 500`,
  inPersonForClient: `SELECT ${I} FROM "InPersonSession" WHERE "clientUserId" = $1 AND "startsAt" >= $2 ORDER BY "startsAt" ASC LIMIT 100`,
  inPersonById: `SELECT ${I} FROM "InPersonSession" WHERE "id" = $1`,
  cancelInPerson: `UPDATE "InPersonSession" SET "status" = 'cancelled', "late" = $3, "slotLock" = NULL, "cancelledAt" = ${NOW}, "updatedAt" = ${NOW} WHERE "id" = $1 AND "clientUserId" = $2 AND "status" = 'booked'`,
  markInPerson: `UPDATE "InPersonSession" SET "status" = $2, "updatedAt" = ${NOW} WHERE "id" = $1 AND "status" IN ('booked', 'present', 'missed')`,
  setInPersonPaid: `UPDATE "InPersonSession" SET "paidAt" = CASE WHEN $2 THEN ${NOW} ELSE NULL END, "markedPaidByUserId" = CASE WHEN $2 THEN $3 ELSE NULL END, "updatedAt" = ${NOW} WHERE "id" = $1 AND "status" <> 'cancelled'`,
} as const;

// ── row shapes ─────────────────────────────────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? '' : String(v));
const strOrNull = (v: unknown) => (v == null ? null : String(v));
const date = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));
const dateOrNull = (v: unknown) => (v == null ? null : date(v));
const json = (v: unknown): unknown => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };

export const asGroup = (r: Row): GroupClass => ({
  id: str(r.id), ownerId: str(r.ownerId), trainerUserId: str(r.trainerUserId), name: str(r.name), gymId: str(r.gymId),
  dayPair: isDayPair(r.dayPair) ? r.dayPair : 'mon_wed', hour: Number(r.hour), startDate: str(r.startDate), weeks: Number(r.weeks),
  minSeats: Number(r.minSeats), maxSeats: Number(r.maxSeats), cutoffHours: Number(r.cutoffHours),
  decision: r.decision === 'run' || r.decision === 'merge' || r.decision === 'cancel' ? r.decision : null,
  status: r.status === 'cancelled' ? 'cancelled' : 'open',
});
export const asPass = (r: Row): GroupPass => ({
  id: str(r.id), groupId: str(r.groupId), userId: str(r.userId), kind: (r.kind === 'package' || r.kind === 'full' ? r.kind : 'drop_in') as JoinKind,
  sessions: Number(r.sessions), startWeek: Number(r.startWeek), windowEnd: str(r.windowEnd), priceCents: Number(r.priceCents),
  payMode: (r.payMode === 'online' ? 'online' : 'at_gym') as PayMode, paidAt: dateOrNull(r.paidAt), status: r.status === 'cancelled' ? 'cancelled' : 'active',
});
const SEAT_STATUSES: readonly SeatStatus[] = ['booked', 'present', 'missed', 'cancelled'];
export const asSeat = (r: Row): GroupSeat => ({
  id: str(r.id), slotKey: str(r.slotKey), groupId: str(r.groupId), gymId: str(r.gymId), userId: str(r.userId), passId: str(r.passId),
  date: str(r.date), startsAt: date(r.startsAt), kind: (r.kind === 'makeup' ? 'makeup' : 'regular') as SeatKind, makeupForId: strOrNull(r.makeupForId),
  status: (SEAT_STATUSES as readonly unknown[]).includes(r.status) ? (r.status as SeatStatus) : 'booked', late: r.late === true,
});

export interface WeeklyWindow { dow: number; startMin: number; endMin: number }
export interface GroupTrainer {
  id: string; ownerId: string; trainerUserId: string | null; displayName: string; inviteCode: string | null;
  gyms: string[]; weeklyHours: WeeklyWindow[]; online: boolean; inPerson: boolean; status: 'invited' | 'active' | 'removed';
}
/** The coach-store WeeklyWindow shape, cleaned (lib/coach-store/slots.ts). */
export function cleanWeekly(v: unknown): WeeklyWindow[] {
  const list = Array.isArray(v) ? v : [];
  return list.flatMap((w) => {
    const o = (w && typeof w === 'object' ? w : {}) as Record<string, unknown>;
    const dow = Number(o.dow), startMin = Number(o.startMin), endMin = Number(o.endMin);
    if (![dow, startMin, endMin].every(Number.isInteger) || dow < 0 || dow > 6 || startMin < 0 || endMin > 1440 || endMin <= startMin) return [];
    return [{ dow, startMin, endMin }];
  }).slice(0, 28);
}
export const asTrainer = (r: Row): GroupTrainer => ({
  id: str(r.id), ownerId: str(r.ownerId), trainerUserId: strOrNull(r.trainerUserId), displayName: str(r.displayName), inviteCode: strOrNull(r.inviteCode),
  gyms: (Array.isArray(json(r.gyms)) ? (json(r.gyms) as unknown[]) : []).filter((g): g is string => typeof g === 'string'),
  weeklyHours: cleanWeekly(json(r.weeklyHours)), online: r.online !== false, inPerson: r.inPerson !== false,
  status: r.status === 'active' ? 'active' : r.status === 'removed' ? 'removed' : 'invited',
});

export type InPersonStatus = 'booked' | 'present' | 'missed' | 'cancelled';
export interface InPersonSession {
  id: string; trainerUserId: string; clientUserId: string; gymId: string; startsAt: Date; minutes: number; priceCents: number;
  payMode: PayMode; paidAt: Date | null; status: InPersonStatus; late: boolean;
}
export const asInPerson = (r: Row): InPersonSession => ({
  id: str(r.id), trainerUserId: str(r.trainerUserId), clientUserId: str(r.clientUserId), gymId: str(r.gymId), startsAt: date(r.startsAt),
  minutes: Number(r.minutes), priceCents: Number(r.priceCents), payMode: (r.payMode === 'online' ? 'online' : 'at_gym') as PayMode, paidAt: dateOrNull(r.paidAt),
  status: (SEAT_STATUSES as readonly unknown[]).includes(r.status) ? (r.status as InPersonStatus) : 'booked', late: r.late === true,
});

// ── reads: null before the SQL (or when a statement fails); never throw ────────────────────────────────────────────────

async function read<T>(db: RawDb, now: number, event: string, run: () => Promise<T>): Promise<T | null> {
  if (!(await groupBookingReady(db, now))) return null;
  try { return await run(); } catch (e) { groupBookingFailed(event, e, now); return null; }
}
const q = (db: RawDb, sql: string, ...v: unknown[]) => db.$queryRawUnsafe<Row[]>(sql, ...v);

export const gymAddresses = (db: RawDb, now = Date.now()) =>
  read(db, now, 'group_read_failed', async () => new Map((await q(db, SQL.gyms)).map((r) => [str(r.id), strOrNull(r.address)] as const)));
export const openGroups = (db: RawDb, now = Date.now()) => read(db, now, 'group_read_failed', async () => (await q(db, SQL.openGroups)).map(asGroup));
export const groupById = (db: RawDb, id: string, now = Date.now()) => read(db, now, 'group_read_failed', async () => { const r = (await q(db, SQL.groupById, id))[0]; return r ? asGroup(r) : null; });
export const groupsForOwner = (db: RawDb, ownerId: string, now = Date.now()) => read(db, now, 'group_read_failed', async () => (await q(db, SQL.groupsForOwner, ownerId)).map(asGroup));
export const groupsForTrainer = (db: RawDb, userId: string, now = Date.now()) => read(db, now, 'group_read_failed', async () => (await q(db, SQL.groupsForTrainer, userId)).map(asGroup));
export const passesForGroups = async (db: RawDb, ids: readonly string[], now = Date.now()) =>
  (ids.length ? read(db, now, 'group_read_failed', async () => (await q(db, SQL.passesForGroups, [...ids])).map(asPass)) : []);
export const passesForUser = (db: RawDb, userId: string, now = Date.now()) => read(db, now, 'group_read_failed', async () => (await q(db, SQL.passesForUser, userId)).map(asPass));
export const passById = (db: RawDb, id: string, now = Date.now()) => read(db, now, 'group_read_failed', async () => { const r = (await q(db, SQL.passById, id))[0]; return r ? asPass(r) : null; });
export const seatsForUser = (db: RawDb, userId: string, from: Date, now = Date.now()) => read(db, now, 'group_read_failed', async () => (await q(db, SQL.seatsForUser, userId, from)).map(asSeat));
export const seatById = (db: RawDb, id: string, now = Date.now()) => read(db, now, 'group_read_failed', async () => { const r = (await q(db, SQL.seatById, id))[0]; return r ? asSeat(r) : null; });
export const seatsInSlot = (db: RawDb, slotKey: string, now = Date.now()) => read(db, now, 'group_read_failed', async () => (await q(db, SQL.seatsInSlot, slotKey)).map(asSeat));
export const makeupSeatsAt = (db: RawDb, gymIds: readonly string[], from: Date, to: Date, now = Date.now()) =>
  read(db, now, 'group_read_failed', async () => (await q(db, SQL.makeupSeatsAt, [...gymIds], from, to)).map(asSeat));
export const makeupsFor = async (db: RawDb, seatIds: readonly string[], now = Date.now()) =>
  (seatIds.length ? read(db, now, 'group_read_failed', async () => new Set((await q(db, SQL.makeupsFor, [...seatIds])).map((r) => str(r.makeupForId)))) : new Set<string>());
export const waitFor = async (db: RawDb, groupIds: readonly string[], now = Date.now()) =>
  (groupIds.length ? read(db, now, 'group_read_failed', async () => (await q(db, SQL.waitFor, [...groupIds])).map((r) => ({ groupId: str(r.groupId), userId: str(r.userId), createdAt: date(r.createdAt) }))) : []);
export const trainersFor = (db: RawDb, ownerId: string, now = Date.now()) => read(db, now, 'group_read_failed', async () => (await q(db, SQL.trainersFor, ownerId)).map(asTrainer));
export const activeTrainerByUser = (db: RawDb, userId: string, now = Date.now()) =>
  read(db, now, 'group_read_failed', async () => { const r = (await q(db, SQL.activeTrainerByUser, userId))[0]; return r ? asTrainer(r) : null; });
export const inPersonForTrainers = async (db: RawDb, ids: readonly string[], from: Date, to: Date, now = Date.now()) =>
  (ids.length ? read(db, now, 'group_read_failed', async () => (await q(db, SQL.inPersonForTrainers, [...ids], from, to)).map(asInPerson)) : []);
export const inPersonForClient = (db: RawDb, userId: string, from: Date, now = Date.now()) =>
  read(db, now, 'group_read_failed', async () => (await q(db, SQL.inPersonForClient, userId, from)).map(asInPerson));
export const inPersonById = (db: RawDb, id: string, now = Date.now()) =>
  read(db, now, 'group_read_failed', async () => { const r = (await q(db, SQL.inPersonById, id))[0]; return r ? asInPerson(r) : null; });

/** Seats taken per slot key. */
export async function takenBySlot(db: RawDb, slotKeys: readonly string[], now = Date.now()): Promise<Map<string, number> | null> {
  if (!slotKeys.length) return new Map();
  return read(db, now, 'group_read_failed', async () => {
    const m = new Map<string, number>();
    for (const r of await q(db, SQL.seatsIn, [...slotKeys])) m.set(str(r.slotKey), (m.get(str(r.slotKey)) ?? 0) + 1);
    return m;
  });
}

// ── writes: a count (or an id), null before the SQL / on failure; never throw ─────────────────────────────────────────

async function write(db: RawDb, now: number, event: string, run: () => Promise<number>): Promise<number | null> {
  if (!(await groupBookingReady(db, now))) return null;
  try { return Number(await run()); } catch (e) { groupBookingFailed(event, e, now); return null; }
}
const x = (db: RawDb, sql: string, ...v: unknown[]) => db.$executeRawUnsafe(sql, ...v);

export const setGymAddress = (db: RawDb, gymId: string, address: string | null, now = Date.now()) => write(db, now, 'group_write_failed', () => x(db, SQL.setGym, gymId, address));

export async function insertGroup(db: RawDb, ownerId: string, g: { name: string; gymId: string; dayPair: string; hour: number; startDate: string; trainerUserId: string; weeks: number; minSeats: number; maxSeats: number; cutoffHours: number }, now = Date.now()): Promise<string | null> {
  const id = randomUUID();
  const n = await write(db, now, 'group_write_failed', () => x(db, SQL.insertGroup, id, ownerId, g.trainerUserId, g.name, g.gymId, g.dayPair, g.hour, g.startDate, g.weeks, g.minSeats, g.maxSeats, g.cutoffHours));
  return n ? id : null;
}
export const moveGroupGym = (db: RawDb, id: string, ownerId: string, gymId: string, now = Date.now()) => write(db, now, 'group_write_failed', () => x(db, SQL.moveGym, id, ownerId, gymId));
export const decideGroup = (db: RawDb, id: string, ownerId: string, d: GroupDecision, now = Date.now()) => write(db, now, 'group_write_failed', () => x(db, SQL.decide, id, ownerId, d));
export const cancelSeat = (db: RawDb, id: string, userId: string, late: boolean, now = Date.now()) => write(db, now, 'group_write_failed', () => x(db, SQL.cancelSeat, id, userId, late));
export const markSeat = (db: RawDb, id: string, status: 'present' | 'missed' | 'booked', now = Date.now()) => write(db, now, 'group_write_failed', () => x(db, SQL.markSeat, id, status));
export const setPassPaid = (db: RawDb, id: string, paid: boolean, byUserId: string, now = Date.now()) => write(db, now, 'group_write_failed', () => x(db, SQL.setPassPaid, id, paid, byUserId));
export const joinWaitlist = (db: RawDb, groupId: string, userId: string, now = Date.now()) => write(db, now, 'group_write_failed', () => x(db, SQL.insertWait, randomUUID(), groupId, userId));
export const cancelInPerson = (db: RawDb, id: string, userId: string, late: boolean, now = Date.now()) => write(db, now, 'group_write_failed', () => x(db, SQL.cancelInPerson, id, userId, late));
export const markInPerson = (db: RawDb, id: string, status: 'present' | 'missed' | 'booked', now = Date.now()) => write(db, now, 'group_write_failed', () => x(db, SQL.markInPerson, id, status));
export const setInPersonPaid = (db: RawDb, id: string, paid: boolean, byUserId: string, now = Date.now()) => write(db, now, 'group_write_failed', () => x(db, SQL.setInPersonPaid, id, paid, byUserId));

export async function inviteTrainer(db: RawDb, ownerId: string, displayName: string, gyms: string[], now = Date.now()): Promise<{ id: string; code: string } | null> {
  const id = randomUUID(), code = randomBytes(18).toString('base64url');
  const n = await write(db, now, 'group_write_failed', () => x(db, SQL.insertTrainer, id, ownerId, displayName, code, JSON.stringify(gyms)));
  return n ? { id, code } : null;
}
export async function acceptTrainer(db: RawDb, code: string, userId: string, now = Date.now()): Promise<{ id: string; ownerId: string; displayName: string } | null> {
  if (!(await groupBookingReady(db, now))) return null;
  try {
    const r = (await q(db, SQL.acceptTrainer, code, userId))[0];
    return r ? { id: str(r.id), ownerId: str(r.ownerId), displayName: str(r.displayName) } : null;
  } catch (e) { groupBookingFailed('group_write_failed', e, now); return null; }
}
export const updateTrainer = (db: RawDb, id: string, ownerId: string, t: { gyms: string[]; weeklyHours: WeeklyWindow[]; online: boolean; inPerson: boolean }, now = Date.now()) =>
  write(db, now, 'group_write_failed', () => x(db, SQL.updateTrainer, id, ownerId, JSON.stringify(t.gyms), JSON.stringify(t.weeklyHours), t.online, t.inPerson));
export const removeTrainer = (db: RawDb, id: string, ownerId: string, now = Date.now()) => write(db, now, 'group_write_failed', () => x(db, SQL.removeTrainer, id, ownerId));

/** A 1:1 in person: the slot lock (trainer + start) refuses a second booking of the same time. Null = taken / not ready. */
export async function insertInPerson(db: RawDb, s: { trainerUserId: string; clientUserId: string; gymId: string; startsAt: Date; minutes: number; priceCents: number; payMode: PayMode }, now = Date.now()): Promise<string | null> {
  const id = randomUUID();
  const lock = `${s.trainerUserId}:${s.startsAt.toISOString()}`;
  const n = await write(db, now, 'group_write_failed', () => x(db, SQL.insertInPerson, id, s.trainerUserId, s.clientUserId, s.gymId, s.startsAt, s.minutes, s.priceCents, s.payMode, lock));
  return n ? id : null;
}

// ── the seat transaction ──────────────────────────────────────────────────────────────────────────────────────────────

export interface SeatWant { slotKey: string; groupId: string; gymId: string; date: string; startsAt: Date; kind: SeatKind; makeupForId: string | null }
export interface PassWant { groupId: string; userId: string; kind: JoinKind; sessions: number; startWeek: number; windowEnd: string; priceCents: number; payMode: PayMode }

export type TakeResult = { ok: true; passId: string; seatIds: string[] } | { ok: false; reason: 'full' | 'not_ready' | 'failed' };

/**
 * Take every seat a reservation needs, or none: lock each slot (sorted, so two reservations can never deadlock), count,
 * and insert the pass and its seats only if every slot has a seat under `max`. A make-up passes `existingPassId` and no pass.
 */
export async function takeSeats(db: TxDb, want: { pass: PassWant | null; existingPassId?: string; userId: string; seats: SeatWant[]; max: number }, now = Date.now()): Promise<TakeResult> {
  if (!(await groupBookingReady(db, now))) return { ok: false, reason: 'not_ready' };
  try {
    return await db.$transaction(async (tx) => {
      const keys = [...new Set(want.seats.map((s) => s.slotKey))].sort();
      for (const k of keys) await tx.$queryRawUnsafe(SQL.lockSlot, k);
      const used = new Map<string, Set<number>>();
      for (const r of await tx.$queryRawUnsafe<Row[]>(SQL.seatsIn, keys)) {
        const k = str(r.slotKey);
        (used.get(k) ?? used.set(k, new Set()).get(k)!).add(Number(r.seat));
      }
      const numbers: number[] = [];
      for (const s of want.seats) {
        const taken = used.get(s.slotKey) ?? new Set<number>();
        let n = 1;
        while (taken.has(n)) n++;
        if (n > want.max) return { ok: false as const, reason: 'full' as const };
        numbers.push(n);
      }
      let passId = want.existingPassId ?? '';
      if (want.pass) {
        passId = randomUUID();
        const p = want.pass;
        await tx.$executeRawUnsafe(SQL.insertPass, passId, p.groupId, p.userId, p.kind, p.sessions, p.startWeek, p.windowEnd, p.priceCents, p.payMode);
      }
      const seatIds: string[] = [];
      for (let i = 0; i < want.seats.length; i++) {
        const s = want.seats[i], id = randomUUID();
        await tx.$executeRawUnsafe(SQL.insertSeat, id, s.slotKey, numbers[i], s.groupId, s.gymId, want.userId, passId, s.date, s.startsAt, s.kind, s.makeupForId);
        seatIds.push(id);
      }
      return { ok: true as const, passId, seatIds };
    });
  } catch (e) {
    groupBookingFailed('group_seat_failed', e, now);
    return { ok: false, reason: 'failed' };
  }
}
