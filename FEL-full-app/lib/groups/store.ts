// TEAMS-SQUADS: the group tables, in raw SQL behind the pending-schema seam.
//
// THE TABLES ARE NOT ON PRODUCTION YET: they arrive with prisma/pending/2026-10-25-teams-squads.sql, which the owner
// applies. Until then (and in CI) every read here answers null ("not available") and every write answers 'not_ready':
// the routes turn that into { available: false } or a 503 groups_not_ready, never a 500. The probe is the shared one
// (lib/coach/pendingSchema.ts), so applying the SQL switches the feature on within minutes, with no deploy.
//
// Every statement is parameterised ($1 …); nothing from a request is ever put into SQL text. Ids are made here
// (node:crypto randomUUID): the generated client never sees these tables until the owner regenerates it.

import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import { GROUP_ROLES, type ActKind, type GroupAct, type GroupColor, type GroupKind, type GroupRole, type GroupRow, type MemberRow } from './types';
import { isGroupColor, isGroupKind } from './rules';

export type { RawDb };

// the acts table is created last in the one file, so its presence means all three are there
const probe = pendingProbe('groups', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'TrainingGroupAct' LIMIT 1`);

/** Tests only. */
export function resetGroupsProbe(): void {
  probe.reset();
}

export function groupsReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}

const G = `"id", "kind", "ownerId", "name", "color", "homeCourt", "inviteToken", "inviteOpen", "dailyDrill", "createdAt"`;
const NOW = `(NOW() AT TIME ZONE 'UTC')`;

/** The statements, named, so a test's stand-in database answers each one by name. */
export const SQL = {
  insertGroup: `INSERT INTO "TrainingGroup" (${G}) VALUES ($1, $2, $3, $4, $5, $6, $7, true, false, ${NOW})`,
  deleteGroup: `DELETE FROM "TrainingGroup" WHERE "id" = $1`,
  groupById: `SELECT ${G} FROM "TrainingGroup" WHERE "id" = $1`,
  groupByToken: `SELECT ${G} FROM "TrainingGroup" WHERE "inviteToken" = $1`,
  groupByCode: `SELECT ${G} FROM "TrainingGroup" WHERE "inviteToken" LIKE $1 LIMIT 2`,
  tokenTaken: `SELECT 1 AS "ok" FROM "TrainingGroup" WHERE "inviteToken" LIKE $1 LIMIT 1`,
  myGroups:
    `SELECT g."id", g."kind", g."ownerId", g."name", g."color", g."homeCourt", g."inviteToken", g."inviteOpen", g."dailyDrill", g."createdAt", m."role", ` +
    `(SELECT COUNT(*)::int FROM "TrainingGroupMember" c WHERE c."groupId" = g."id") AS "members" ` +
    `FROM "TrainingGroupMember" m JOIN "TrainingGroup" g ON g."id" = m."groupId" WHERE m."userId" = $1 ORDER BY g."createdAt" ASC`,
  countMine: `SELECT COUNT(*)::int AS "n" FROM "TrainingGroupMember" WHERE "userId" = $1`,
  members: `SELECT "groupId", "userId", "role", "shareMeasured", "joinedAt" FROM "TrainingGroupMember" WHERE "groupId" = $1 ORDER BY "joinedAt" ASC`,
  membership: `SELECT "groupId", "userId", "role", "shareMeasured", "joinedAt" FROM "TrainingGroupMember" WHERE "groupId" = $1 AND "userId" = $2`,
  addMember: `INSERT INTO "TrainingGroupMember" ("groupId", "userId", "role", "shareMeasured", "joinedAt") VALUES ($1, $2, $3, false, ${NOW}) ON CONFLICT ("groupId", "userId") DO NOTHING`,
  removeMember: `DELETE FROM "TrainingGroupMember" WHERE "groupId" = $1 AND "userId" = $2 AND "role" <> 'owner'`,
  setRole: `UPDATE "TrainingGroupMember" SET "role" = $3 WHERE "groupId" = $1 AND "userId" = $2 AND "role" <> 'owner'`,
  setShare: `UPDATE "TrainingGroupMember" SET "shareMeasured" = $3 WHERE "groupId" = $1 AND "userId" = $2`,
  update: `UPDATE "TrainingGroup" SET "name" = $2, "color" = $3, "homeCourt" = $4, "dailyDrill" = $5, "inviteOpen" = $6, "inviteToken" = $7 WHERE "id" = $1`,
  acts: `SELECT "id", "kind", "dedupeKey", "fromUserId", "toUserId", "ref", "preset", "points", "createdAt" FROM "TrainingGroupAct" WHERE "groupId" = $1 AND ("createdAt" >= $2 OR "kind" = 'trophy') ORDER BY "createdAt" DESC LIMIT 2000`,
  insertAct:
    `INSERT INTO "TrainingGroupAct" ("id", "groupId", "kind", "dedupeKey", "fromUserId", "toUserId", "ref", "preset", "points", "createdAt") ` +
    `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${NOW}) ON CONFLICT ("groupId", "dedupeKey") DO NOTHING`,
  deleteAct: `DELETE FROM "TrainingGroupAct" WHERE "groupId" = $1 AND "dedupeKey" = $2 AND "fromUserId" = $3`,
  squadmates:
    `SELECT 1 AS "ok" FROM "TrainingGroupMember" a JOIN "TrainingGroupMember" b ON a."groupId" = b."groupId" ` +
    `JOIN "TrainingGroup" g ON g."id" = a."groupId" WHERE g."kind" = 'squad' AND a."userId" = $1 AND b."userId" = $2 LIMIT 1`,
} as const;

const ms = (v: unknown): number => (v instanceof Date ? v.getTime() : typeof v === 'string' || typeof v === 'number' ? new Date(v).getTime() : 0);
const isRole = (v: unknown): v is GroupRole => (GROUP_ROLES as readonly unknown[]).includes(v);

function asGroup(r: Record<string, unknown>): GroupRow | null {
  if (!isGroupKind(r.kind) || typeof r.id !== 'string' || typeof r.ownerId !== 'string' || typeof r.inviteToken !== 'string') return null;
  return {
    id: r.id, kind: r.kind, ownerId: r.ownerId, name: String(r.name ?? ''), color: (isGroupColor(r.color) ? r.color : 'cyan') as GroupColor,
    homeCourt: typeof r.homeCourt === 'string' ? r.homeCourt : null, inviteToken: r.inviteToken,
    inviteOpen: r.inviteOpen === true, dailyDrill: r.dailyDrill === true, createdAt: ms(r.createdAt),
  };
}
function asMember(r: Record<string, unknown>): MemberRow | null {
  if (typeof r.userId !== 'string' || typeof r.groupId !== 'string' || !isRole(r.role)) return null;
  return { groupId: r.groupId, userId: r.userId, role: r.role, shareMeasured: r.shareMeasured === true, joinedAt: ms(r.joinedAt) };
}
function asAct(r: Record<string, unknown>): GroupAct {
  const s = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    id: String(r.id), kind: String(r.kind) as ActKind, dedupeKey: String(r.dedupeKey), fromUserId: s(r.fromUserId), toUserId: s(r.toUserId),
    ref: s(r.ref), preset: s(r.preset), points: typeof r.points === 'number' ? r.points : r.points == null ? null : Number(r.points), createdAt: ms(r.createdAt),
  };
}

export type Write<T = true> = { ok: true; value: T } | { ok: false; error: 'not_ready' | 'conflict' | 'failed' };
const NOT_READY = { ok: false as const, error: 'not_ready' as const };

/** Run a read when the tables are there; null when they are not or the read failed on a missing table. */
async function read<T>(db: RawDb, event: string, fn: () => Promise<T>, now: number): Promise<T | null> {
  if (!(await groupsReady(db, now))) return null;
  try { return await fn(); } catch (e) { probe.fail(`groups_${event}_failed`, e, now); return null; }
}
async function write<T>(db: RawDb, event: string, fn: () => Promise<Write<T>>, now: number): Promise<Write<T>> {
  if (!(await groupsReady(db, now))) return NOT_READY;
  try { return await fn(); } catch (e) {
    probe.fail(`groups_${event}_failed`, e, now);
    const code = (e as { code?: unknown; meta?: { code?: unknown } })?.meta?.code ?? (e as { code?: unknown })?.code;
    return { ok: false, error: code === '23505' ? 'conflict' : 'failed' };
  }
}

export type MyGroup = GroupRow & { role: GroupRole; members: number };

export function myGroups(db: RawDb, userId: string, now = Date.now()): Promise<MyGroup[] | null> {
  return read(db, 'mine', async () => {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.myGroups, userId);
    return rows.flatMap((r) => { const g = asGroup(r); return g && isRole(r.role) ? [{ ...g, role: r.role, members: Number(r.members ?? 0) }] : []; });
  }, now);
}

export function countMine(db: RawDb, userId: string, now = Date.now()): Promise<number | null> {
  return read(db, 'count', async () => Number((await db.$queryRawUnsafe<{ n: unknown }[]>(SQL.countMine, userId))[0]?.n ?? 0), now);
}

export function groupById(db: RawDb, id: string, now = Date.now()): Promise<GroupRow | null> {
  return read(db, 'group', async () => { const r = (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.groupById, id))[0]; return r ? asGroup(r) : null; }, now);
}

export function groupByToken(db: RawDb, token: string, now = Date.now()): Promise<GroupRow | null> {
  return read(db, 'by_token', async () => { const r = (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.groupByToken, token))[0]; return r ? asGroup(r) : null; }, now);
}

/** The ONE group whose token starts with `CODE~` (two would be a clash: answer none). */
export function groupByCodePrefix(db: RawDb, prefix: string, now = Date.now()): Promise<GroupRow | null> {
  return read(db, 'by_code', async () => {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.groupByCode, `${prefix}%`);
    return rows.length === 1 ? asGroup(rows[0]) : null;
  }, now);
}

export function tokenPrefixTaken(db: RawDb, prefix: string, now = Date.now()): Promise<boolean | null> {
  return read(db, 'token_taken', async () => (await db.$queryRawUnsafe<unknown[]>(SQL.tokenTaken, `${prefix}%`)).length > 0, now);
}

export function members(db: RawDb, groupId: string, now = Date.now()): Promise<MemberRow[] | null> {
  return read(db, 'members', async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.members, groupId)).flatMap((r) => { const m = asMember(r); return m ? [m] : []; }), now);
}

export function membership(db: RawDb, groupId: string, userId: string, now = Date.now()): Promise<MemberRow | null> {
  return read(db, 'membership', async () => { const r = (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.membership, groupId, userId))[0]; return r ? asMember(r) : null; }, now);
}

export function acts(db: RawDb, groupId: string, since: Date, now = Date.now()): Promise<GroupAct[] | null> {
  return read(db, 'acts', async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.acts, groupId, since)).map(asAct), now);
}

export function areSquadmates(db: RawDb, a: string, b: string, now = Date.now()): Promise<boolean> {
  if (a === b) return Promise.resolve(false);
  return read(db, 'squadmates', async () => (await db.$queryRawUnsafe<unknown[]>(SQL.squadmates, a, b)).length > 0, now).then((v) => v === true);
}

export interface NewGroup { kind: GroupKind; ownerId: string; name: string; color: GroupColor; homeCourt: string | null; inviteToken: string }

/** The group and its owner's membership. If the second insert fails the first is undone, so no group is left ownerless. */
export function createGroup(db: RawDb, g: NewGroup, now = Date.now()): Promise<Write<string>> {
  return write(db, 'create', async () => {
    const id = randomUUID();
    await db.$executeRawUnsafe(SQL.insertGroup, id, g.kind, g.ownerId, g.name, g.color, g.homeCourt, g.inviteToken);
    try {
      await db.$executeRawUnsafe(SQL.addMember, id, g.ownerId, 'owner');
    } catch (e) {
      await db.$executeRawUnsafe(SQL.deleteGroup, id).catch(() => 0);
      throw e;
    }
    return { ok: true, value: id };
  }, now);
}

/** true when a row was added; false when they were already a member. */
export function addMember(db: RawDb, groupId: string, userId: string, role: GroupRole, now = Date.now()): Promise<Write<boolean>> {
  return write(db, 'add_member', async () => ({ ok: true, value: (await db.$executeRawUnsafe(SQL.addMember, groupId, userId, role)) > 0 }), now);
}

export function removeMember(db: RawDb, groupId: string, userId: string, now = Date.now()): Promise<Write<boolean>> {
  return write(db, 'remove_member', async () => ({ ok: true, value: (await db.$executeRawUnsafe(SQL.removeMember, groupId, userId)) > 0 }), now);
}

export function setRole(db: RawDb, groupId: string, userId: string, role: Exclude<GroupRole, 'owner'>, now = Date.now()): Promise<Write<boolean>> {
  return write(db, 'set_role', async () => ({ ok: true, value: (await db.$executeRawUnsafe(SQL.setRole, groupId, userId, role)) > 0 }), now);
}

export function setShare(db: RawDb, groupId: string, userId: string, on: boolean, now = Date.now()): Promise<Write<boolean>> {
  return write(db, 'set_share', async () => ({ ok: true, value: (await db.$executeRawUnsafe(SQL.setShare, groupId, userId, on)) > 0 }), now);
}

export function updateGroup(db: RawDb, g: GroupRow, now = Date.now()): Promise<Write> {
  return write(db, 'update', async () => {
    await db.$executeRawUnsafe(SQL.update, g.id, g.name, g.color, g.homeCourt, g.dailyDrill, g.inviteOpen, g.inviteToken);
    return { ok: true, value: true };
  }, now);
}

export function deleteGroup(db: RawDb, id: string, now = Date.now()): Promise<Write> {
  return write(db, 'delete', async () => { await db.$executeRawUnsafe(SQL.deleteGroup, id); return { ok: true, value: true }; }, now);
}

export interface NewAct { groupId: string; kind: ActKind; dedupeKey: string; fromUserId: string | null; toUserId: string | null; ref: string | null; preset: string | null; points: number | null }

/** true when written; false when the dedupeKey was already there (a double tap, a lost race). */
export function insertAct(db: RawDb, x: NewAct, now = Date.now()): Promise<Write<boolean>> {
  return write(db, 'act', async () => ({
    ok: true,
    value: (await db.$executeRawUnsafe(SQL.insertAct, randomUUID(), x.groupId, x.kind, x.dedupeKey, x.fromUserId, x.toUserId, x.ref, x.preset, x.points)) > 0,
  }), now);
}

export function deleteAct(db: RawDb, groupId: string, dedupeKey: string, fromUserId: string, now = Date.now()): Promise<Write<boolean>> {
  return write(db, 'unact', async () => ({ ok: true, value: (await db.$executeRawUnsafe(SQL.deleteAct, groupId, dedupeKey, fromUserId)) > 0 }), now);
}
