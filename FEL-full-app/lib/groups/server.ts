// TEAMS-SQUADS: the server side — reads the members' rows under the existing gates, builds the view, and runs every
// write a route asks for. Each function answers { status, body }, so a route is three lines and has nothing to export
// but its handlers (tests/route-exports.test.ts).
//
// BEFORE THE PENDING SQL IS APPLIED: reads say { available: false } (200) and writes say 503 groups_not_ready. Nothing
// else in this file runs without the tables, so nothing 500s (store.ts has the seam).
//
// THE GATES, AND WHERE THEY RUN:
//   · join/start: lib/groups/gates.ts (the coach loop's teen gate for a team; the squad gate for a squad).
//   · scores: a verified adult's only (verifiedAdultUserWhere, INSIDE the query, as profile v2 does).
//   · measured reps and jumps: a verified adult with the live jump_numbers opt-in (scanSaveUserWhere, inside the query)
//     who turned sharing on for this group; a minor never has the switch.
//   · a team's roll-up: the viewer's own live roster only (a coach sees the athletes they coach, COACH-LOOP §3).
// activity.ts and feed.ts check each member's facts again on the way out.

import { CHALLENGE_TTL_MS } from '@/lib/social/challenge-terms';
import { MODE_INFO, canonicalModeKey } from '@/lib/game-data';
import { RIVAL_HISTORY_SINCE } from '@/lib/rival-history';
import { dailyDrillKey } from '@/lib/daily-drill/load';
import { ASSESSMENT_KIND } from '@/lib/assess/prqWrite';
import type { T5Extra } from '@/lib/assess/scoring';
import { jumpRecords } from '@/lib/jump/seam';
import { profileGates, scanSaveUserWhere, verifiedAdultUserWhere } from '@/lib/profile-v2/gate';
import { newCodedToken } from '@/lib/coach/inviteServer';
import { codeOfToken, codeTokenPrefix, formatCode, normalizeCode } from '@/lib/coach/inviteCode';
import type { Prisma } from '@/lib/generated/prisma';
import {
  boards, buddies, duoGoals, duoKey, friendStreak, isDuoTarget, rolloverAward, standings, teamRollup, trophyShelf, allowedActivity,
  EMPTY_ACTIVITY, STREAK_LOOKBACK_DAYS, type Activity,
} from './activity';
import { buildFeed, isReactionKey, reactionDedupe } from './feed';
import { groupGate, groupGateBody } from './gates';
import {
  ageBand, can, canRemove, canSetRole, checkGroupName, checkHomeCourt, firstName, homeCourtName, isGroupColor, isGroupKind, roomFor,
} from './rules';
import * as store from './store';
import { MAX_GROUPS_PER_USER, NUDGES, type GroupKind, type GroupRow, type MemberFacts, type MemberRow, type NudgeKey } from './types';
import type { GroupSummary, GroupView } from './view';
import { dayOf, lastDays, prevWeekKey, weekBounds, weekKeyOf } from './week';

/** The Prisma calls this file makes (structural, so a test's fake fits), plus the two raw calls of the store. */
export interface GroupsDb extends store.RawDb {
  user: { findMany(a: unknown): Promise<any[]>; findUnique(a: unknown): Promise<any> };
  guardianConsent: { findMany(a: unknown): Promise<any[]> };
  facilitatorProfile: { findUnique(a: unknown): Promise<any> };
  coachClient: { findMany(a: unknown): Promise<any[]>; findUnique(a: unknown): Promise<any>; create(a: unknown): Promise<any>; update(a: unknown): Promise<any> };
  walletLedgerEntry: { findMany(a: unknown): Promise<any[]> };
  gameSession: { findMany(a: unknown): Promise<any[]>; groupBy(a: unknown): Promise<any[]> };
  mirrorSession: { findMany(a: unknown): Promise<any[]> };
  workoutScan: { findMany(a: unknown): Promise<any[]> };
  challengeLink: { findMany(a: unknown): Promise<any[]>; findUnique(a: unknown): Promise<any> };
}

export interface Res { status: number; body: Record<string, unknown> }
const ok = (body: Record<string, unknown>): Res => ({ status: 200, body });
const err = (status: number, error: string, extra: Record<string, unknown> = {}): Res => ({ status, body: { error, ...extra } });
const NOT_READY: Res = err(503, 'groups_not_ready', { message: 'Squads and teams are coming soon.' });
const NOT_FOUND: Res = err(404, 'not_found');
const fromWrite = (w: store.Write<unknown>): Res | null => (w.ok ? null : w.error === 'not_ready' ? NOT_READY : err(w.error === 'conflict' ? 409 : 500, w.error === 'conflict' ? 'conflict' : 'write_failed'));

const soft = <T>(p: Promise<T>, empty: T): Promise<T> => p.catch(() => empty);
const READ_CAP = { runs: 3000, scores: 1500, mirror: 400, scans: 200 } as const;
/** How far back a verified jump counts on the board. (new) */
export const JUMP_BOARD_WINDOW_MS = 90 * 86_400_000;

export const joinPath = (token: string) => `/squads/join/${encodeURIComponent(token)}`;
export const groupPath = (id: string) => `/squads/${encodeURIComponent(id)}`;

const modeNameOf = (mode: string) => MODE_INFO[canonicalModeKey(mode)]?.name ?? mode;

async function isCertified(db: GroupsDb, userId: string): Promise<boolean> {
  const fac = await soft(db.facilitatorProfile.findUnique({ where: { userId }, select: { certificationStatus: true } }), null);
  return fac?.certificationStatus === 'certified';
}

async function gateFor(db: GroupsDb, kind: GroupKind, userId: string, now: Date) {
  try {
    const [user, consents] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { dobYear: true } }),
      db.guardianConsent.findMany({ where: { menteeId: userId }, select: { requestedAt: true, acceptedAt: true, revokedAt: true, menteeBirthYear: true } }),
    ]);
    return groupGate(kind, { dobYear: user?.dobYear ?? null, consents }, now);
  } catch {
    // a read that fails closes the gate, as the coach loop's does
    return { ok: false as const, error: 'age_required' as const };
  }
}

// ── reading members and what they did ─────────────────────────────────────────────────────────────────────────────

/** The members' account facts. `rosterOf`: whose live roster `onRoster` is measured against (a team's viewing coach). */
export async function memberFacts(db: GroupsDb, rows: readonly MemberRow[], rosterOf: string | null, now: Date): Promise<MemberFacts[]> {
  const ids = rows.map((r) => r.userId);
  const [users, roster] = await Promise.all([
    soft(db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, dobYear: true, scanSaveOptIn: { select: { scope: true, granted: true, revokedAt: true } } } }), []),
    rosterOf ? soft(db.coachClient.findMany({ where: { coachId: rosterOf, endedAt: null, clientId: { in: ids } }, select: { clientId: true } }), []) : Promise.resolve([]),
  ]);
  const live = new Set(roster.map((r: { clientId: string }) => r.clientId));
  return rows.map((r) => {
    const u = users.find((x: { id: string }) => x.id === r.userId);
    const gates = profileGates(u?.dobYear ?? null, u?.scanSaveOptIn ?? null, now);
    return { ...r, name: firstName(u?.name), band: ageBand(u?.dobYear ?? null, now), canSaveScan: gates.canSaveScan, onRoster: live.has(r.userId) };
  });
}

/** Everything the views need, read once, every gate inside the query. */
export async function readActivity(db: GroupsDb, members: readonly MemberFacts[], challengeCodes: readonly string[], now: Date): Promise<Activity> {
  const ids = members.map((m) => m.userId);
  if (!ids.length) return EMPTY_ACTIVITY;
  const days = lastDays(now, STREAK_LOOKBACK_DAYS);
  const lastWeekStart = weekBounds(prevWeekKey(weekKeyOf(now))).start;
  const thisWeekStart = weekBounds(weekKeyOf(now)).start;
  const adults = members.filter((m) => m.band === 'adult').map((m) => m.userId);
  const sharing = members.filter((m) => m.band === 'adult' && m.canSaveScan && m.shareMeasured).map((m) => m.userId);
  const splitKeys = Object.keys(RIVAL_HISTORY_SINCE);
  const adultWhere = verifiedAdultUserWhere(now);
  const saveWhere = scanSaveUserWhere(now);

  const weekScores: Prisma.GameSessionWhereInput = { userId: { in: adults }, createdAt: { gte: thisWeekStart }, mode: { notIn: splitKeys }, user: { is: adultWhere } };
  const priorBests: Prisma.GameSessionWhereInput = { userId: { in: adults }, createdAt: { lt: thisWeekStart }, mode: { notIn: splitKeys }, user: { is: adultWhere } };
  const repsWhere: Prisma.MirrorSessionWhereInput = { userId: { in: sharing }, patternId: { in: ['squat', 'lunge'] }, createdAt: { gte: lastWeekStart }, user: { is: saveWhere } };
  const jumpsWhere: Prisma.WorkoutScanWhereInput = { userId: { in: sharing }, kind: ASSESSMENT_KIND, createdAt: { gte: new Date(now.getTime() - JUMP_BOARD_WINDOW_MS) }, user: { is: saveWhere } };

  const [ledger, runs, weekRows, prior, reps, scans, links] = await Promise.all([
    soft(db.walletLedgerEntry.findMany({ where: { idempotencyKey: { in: ids.flatMap((id) => days.map((d) => dailyDrillKey(id, d))) } }, select: { idempotencyKey: true } }), []),
    soft(db.gameSession.findMany({ where: { userId: { in: ids }, createdAt: { gte: lastWeekStart } }, orderBy: { createdAt: 'desc' }, take: READ_CAP.runs, select: { userId: true, createdAt: true, won: true } }), []),
    adults.length ? soft(db.gameSession.findMany({ where: weekScores, orderBy: { createdAt: 'desc' }, take: READ_CAP.scores, select: { userId: true, mode: true, score: true, createdAt: true } }), []) : Promise.resolve([]),
    adults.length ? soft(db.gameSession.groupBy({ by: ['userId', 'mode'], where: priorBests, _max: { score: true } }), []) : Promise.resolve([]),
    sharing.length ? soft(db.mirrorSession.findMany({ where: repsWhere, orderBy: { createdAt: 'desc' }, take: READ_CAP.mirror, select: { id: true, userId: true, patternId: true, reps: true, createdAt: true } }), []) : Promise.resolve([]),
    sharing.length ? soft(db.workoutScan.findMany({ where: jumpsWhere, orderBy: { createdAt: 'desc' }, take: READ_CAP.scans, select: { id: true, userId: true, metrics: true, createdAt: true } }), []) : Promise.resolve([]),
    challengeCodes.length ? soft(db.challengeLink.findMany({ where: { code: { in: [...challengeCodes] } }, select: { code: true, ownerUserId: true, modeKey: true, score: true, createdAt: true } }), []) : Promise.resolve([]),
  ]);

  const drillDays: Record<string, string[]> = {};
  for (const row of ledger as { idempotencyKey: string }[]) {
    const [, day, userId] = row.idempotencyKey.split(':');
    if (userId && day) (drillDays[userId] ??= []).push(day);
  }

  // a PR: this week's best in a mode over every earlier best in it (a first-ever score is not a PR: nothing to beat)
  const priorBest = new Map((prior as { userId: string; mode: string; _max: { score: number | null } }[]).map((p) => [`${p.userId}|${p.mode}`, p._max?.score ?? null]));
  const bestThisWeek = new Map<string, { userId: string; mode: string; score: number; at: number }>();
  for (const r of weekRows as { userId: string; mode: string; score: number; createdAt: Date }[]) {
    const k = `${r.userId}|${r.mode}`; const cur = bestThisWeek.get(k);
    if (!cur || r.score > cur.score) bestThisWeek.set(k, { userId: r.userId, mode: r.mode, score: r.score, at: new Date(r.createdAt).getTime() });
  }
  const prs = [...bestThisWeek.entries()].flatMap(([k, b]) => {
    const before = priorBest.get(k);
    return typeof before === 'number' && b.score > before ? [{ ...b, modeName: modeNameOf(b.mode), previous: before }] : [];
  });

  const jumps = (scans as { id: string; userId: string; metrics: unknown; createdAt: Date }[]).flatMap((s) => {
    const tests = (s.metrics as { tests?: { t5?: unknown }[] } | null)?.tests;
    const t5 = Array.isArray(tests) ? tests.find((t) => t && typeof t === 'object' && t.t5)?.t5 : null;
    if (!t5 || typeof t5 !== 'object' || !Array.isArray((t5 as T5Extra).jumps)) return [];
    // lib/jump/seam.ts: the jump as a typed record; verifyJump decides `verified` (a stored read has no re-timed
    // method, so it does not verify today — docs/TEAMS-SQUADS.md, "verified jumps")
    return jumpRecords(t5 as T5Extra, { source: 'live' }).filter((r) => r.type === 'cmj').map((record) => ({ userId: s.userId, id: s.id, record, at: new Date(s.createdAt).getTime() }));
  });

  return allowedActivity(members, {
    drillDays,
    runs: (runs as { userId: string; createdAt: Date; won: boolean }[]).map((r) => ({ userId: r.userId, at: new Date(r.createdAt).getTime(), won: r.won === true })),
    prs,
    reps: (reps as { id: string; userId: string; patternId: string; reps: number; createdAt: Date }[]).map((r) => ({ userId: r.userId, id: r.id, patternId: r.patternId, reps: Number(r.reps) || 0, at: new Date(r.createdAt).getTime() })),
    jumps,
    challenges: (links as { code: string; ownerUserId: string | null; modeKey: string; score: number; createdAt: Date }[]).map((c) => ({ code: c.code, ownerUserId: c.ownerUserId, modeName: modeNameOf(c.modeKey), score: c.score, at: new Date(c.createdAt).getTime() })),
  });
}

// ── the views ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function listGroups(db: GroupsDb, viewerId: string, now = new Date()): Promise<Res> {
  const mine = await store.myGroups(db, viewerId, now.getTime());
  if (mine === null) return ok({ available: false, groups: [] });
  const groups: GroupSummary[] = mine.map((g) => ({ id: g.id, kind: g.kind, name: g.name, color: g.color, role: g.role, members: g.members }));
  return ok({ available: true, groups, certifiedCoach: await isCertified(db, viewerId) });
}

/** The group page for one member; settles last week's league on the way (once: the dedupeKey is unique). */
export async function loadGroupView(db: GroupsDb, groupId: string, viewerId: string, now = new Date()): Promise<Res> {
  const t = now.getTime();
  if (!(await store.groupsReady(db, t))) return ok({ available: false });
  const group = await store.groupById(db, groupId, t);
  if (!group) return NOT_FOUND;
  const rows = await store.members(db, groupId, t);
  const meRow = rows?.find((r) => r.userId === viewerId);
  // not a member: the same 404 as no group at all — no group has a public page, and a minor is never on one
  if (!rows || !meRow) return NOT_FOUND;

  const rollupAllowed = group.kind === 'team' && can(meRow.role, 'see_rollup');
  const facts = await memberFacts(db, rows, rollupAllowed ? viewerId : null, now);
  const weekKey = weekKeyOf(now);
  const since = weekBounds(prevWeekKey(weekKey)).start;
  let acts = (await store.acts(db, groupId, since, t)) ?? [];
  const codes = acts.filter((x) => x.kind === 'challenge' && x.ref).map((x) => x.ref!);
  // the viewer's own open challenges, to offer for posting
  const mineOpen = await soft(db.challengeLink.findMany({
    where: { ownerUserId: viewerId, createdAt: { gte: new Date(t - CHALLENGE_TTL_MS) } }, orderBy: { createdAt: 'desc' }, take: 10,
    select: { code: true, modeKey: true, score: true },
  }), []);
  const activity = await readActivity(db, facts, codes, now);

  // the weekly rollover: settle last week's league once
  const award = rolloverAward(group.createdAt, facts, activity, weekKey, acts);
  if (award) {
    const w = await store.insertAct(db, { groupId, kind: 'trophy', dedupeKey: award.dedupeKey, fromUserId: null, toUserId: award.toUserId, ref: award.ref, preset: award.preset, points: award.points }, t);
    if (w.ok && w.value) acts = [{ id: 'new', kind: 'trophy', dedupeKey: award.dedupeKey, fromUserId: null, toUserId: award.toUserId, ref: award.ref, preset: award.preset, points: award.points, createdAt: t }, ...acts];
  }

  const me = facts.find((m) => m.userId === viewerId)!;
  const today = dayOf(now);
  const seeInvite = can(me.role, 'see_invite');
  const code = codeOfToken(group.inviteToken);
  const view: GroupView = {
    id: group.id, kind: group.kind, name: group.name, color: group.color,
    homeCourt: group.homeCourt ? { ref: group.homeCourt, name: homeCourtName(group.homeCourt) ?? group.homeCourt } : null,
    me: { userId: viewerId, role: me.role, shareMeasured: me.shareMeasured, canShareMeasured: me.band === 'adult' && me.canSaveScan },
    can: {
      edit: can(me.role, 'edit'), invite: seeInvite, remove: can(me.role, 'remove_member'), assign: group.kind === 'team' && can(me.role, 'assign'),
      setRole: can(me.role, 'set_role'), leave: can(me.role, 'leave'), delete: can(me.role, 'delete'),
    },
    invite: seeInvite && code ? { code: formatCode(code), path: joinPath(group.inviteToken), open: group.inviteOpen } : null,
    members: facts.map((m) => ({ userId: m.userId, name: m.name, role: m.role, you: m.userId === viewerId })),
    dailyDrillAssigned: group.kind === 'team' && group.dailyDrill,
    buddies: buddies(facts, activity, viewerId, acts, t),
    streak: friendStreak(facts, activity, group.createdAt, t),
    duos: duoGoals(facts, activity, acts, weekKey),
    boards: boards(facts, activity, weekKey),
    league: { weekKey, standings: standings(facts, activity, weekKey) },
    trophies: trophyShelf(facts, acts),
    feed: buildFeed(facts, activity, acts, viewerId, weekKey),
    rollup: rollupAllowed ? teamRollup(facts, activity, weekKey, group.dailyDrill) : null,
    myChallenges: (mineOpen as { code: string; modeKey: string; score: number }[]).map((c) => ({ code: c.code, modeName: modeNameOf(c.modeKey), score: c.score, posted: codes.includes(c.code) })),
    nudges: acts.flatMap((x) => {
      if (x.kind !== 'nudge' || x.toUserId !== viewerId || x.ref !== today || !(x.preset && x.preset in NUDGES)) return [];
      const from = facts.find((m) => m.userId === x.fromUserId);
      return from ? [{ fromName: from.name, key: x.preset as NudgeKey }] : [];
    }),
  };
  return ok({ available: true, group: view });
}

// ── create, join, preview ────────────────────────────────────────────────────────────────────────────────────────

async function freshToken(db: GroupsDb, now: number): Promise<string | null> {
  for (let i = 0; i < 4; i++) {
    const { code, token } = newCodedToken();
    const taken = await store.tokenPrefixTaken(db, codeTokenPrefix(code), now);
    if (taken === null) return null;
    if (!taken) return token;
  }
  throw new Error('group invite code space exhausted on four tries');
}

/** POST /api/groups { kind, name, color, homeCourt? } */
export async function createGroupFor(db: GroupsDb, viewerId: string, body: unknown, now = new Date()): Promise<Res> {
  const t = now.getTime();
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!isGroupKind(b.kind)) return err(400, 'kind_invalid');
  const name = checkGroupName(b.kind, b.name);
  if (!name.ok) return err(400, name.error);
  if (!isGroupColor(b.color)) return err(400, 'color_invalid');
  const court = checkHomeCourt(b.homeCourt);
  if (!court.ok) return err(400, 'home_court_invalid');
  if (!(await store.groupsReady(db, t))) return NOT_READY;
  // a team is a coach's: certified coaches only (the assign-to-many rule); a squad's starter passes the join gate
  if (b.kind === 'team' && !(await isCertified(db, viewerId))) return err(403, 'teams_are_for_coaches', { message: 'Teams are for certified coaches. Start a squad with friends instead.' });
  const gate = await gateFor(db, b.kind, viewerId, now);
  if (!gate.ok) return { status: 403, body: groupGateBody(b.kind, gate.error) };
  const n = await store.countMine(db, viewerId, t);
  if (n === null) return NOT_READY;
  if (n >= MAX_GROUPS_PER_USER) return err(409, 'too_many_groups', { message: `You can be in ${MAX_GROUPS_PER_USER} squads and teams at once.` });
  const token = await freshToken(db, t);
  if (!token) return NOT_READY;
  const w = await store.createGroup(db, { kind: b.kind, ownerId: viewerId, name: name.name, color: b.color, homeCourt: court.ref, inviteToken: token }, t);
  if (!w.ok) return w.error === 'conflict' ? err(409, 'name_taken', { message: 'You already have one with that name.' }) : fromWrite(w)!;
  return { status: 201, body: { id: w.value, path: groupPath(w.value) } };
}

async function findInvite(db: GroupsDb, input: { token?: unknown; code?: unknown }, now: number): Promise<GroupRow | null> {
  if (typeof input.token === 'string' && input.token.length <= 80) return store.groupByToken(db, input.token, now);
  const code = normalizeCode(input.code);
  return code ? store.groupByCodePrefix(db, codeTokenPrefix(code), now) : null;
}

/** GET /api/groups/join?token= | ?code= — what the landing page shows before anyone signs in: the group's kind and name. */
export async function previewInvite(db: GroupsDb, input: { token?: unknown; code?: unknown }, now = new Date()): Promise<Res> {
  if (!(await store.groupsReady(db, now.getTime()))) return ok({ available: false });
  const g = await findInvite(db, input, now.getTime());
  // a closed invite and one that never existed answer alike
  if (!g || !g.inviteOpen) return NOT_FOUND;
  return ok({ available: true, kind: g.kind, name: g.name, color: g.color, token: g.inviteToken });
}

/** POST /api/groups/join { token } | { code } */
export async function joinGroup(db: GroupsDb, viewerId: string, body: unknown, now = new Date()): Promise<Res> {
  const t = now.getTime();
  const b = (body && typeof body === 'object' ? body : {}) as { token?: unknown; code?: unknown };
  if (!(await store.groupsReady(db, t))) return NOT_READY;
  const g = await findInvite(db, b, t);
  if (!g || !g.inviteOpen) return NOT_FOUND;
  const already = await store.membership(db, g.id, viewerId, t);
  if (already) return ok({ result: 'already', id: g.id, path: groupPath(g.id) });
  const gate = await gateFor(db, g.kind, viewerId, now);
  if (!gate.ok) return { status: 403, body: groupGateBody(g.kind, gate.error) };
  const [rows, n] = await Promise.all([store.members(db, g.id, t), store.countMine(db, viewerId, t)]);
  if (rows === null || n === null) return NOT_READY;
  if (!roomFor(g.kind, rows.length)) return err(409, 'group_full', { message: 'This one is full.' });
  if (n >= MAX_GROUPS_PER_USER) return err(409, 'too_many_groups', { message: `You can be in ${MAX_GROUPS_PER_USER} squads and teams at once.` });
  if (g.kind === 'team') {
    // a team is the coach's roster: joining it joins the roster, as the coach's own invite does (gate already run)
    const link = await db.coachClient.findUnique({ where: { coachId_clientId: { coachId: g.ownerId, clientId: viewerId } }, select: { id: true, endedAt: true } });
    if (!link) await db.coachClient.create({ data: { coachId: g.ownerId, clientId: viewerId, via: 'team' } });
    else if (link.endedAt) await db.coachClient.update({ where: { id: link.id }, data: { endedAt: null } });
  }
  const w = await store.addMember(db, g.id, viewerId, 'member', t);
  if (!w.ok) return fromWrite(w)!;
  return ok({ result: w.value ? 'joined' : 'already', id: g.id, path: groupPath(g.id) });
}

// ── edits ────────────────────────────────────────────────────────────────────────────────────────────────────────

async function loadAs(db: GroupsDb, groupId: string, viewerId: string, t: number): Promise<{ group: GroupRow; me: MemberRow; rows: MemberRow[] } | Res> {
  if (!(await store.groupsReady(db, t))) return NOT_READY;
  const group = await store.groupById(db, groupId, t);
  const rows = group ? await store.members(db, groupId, t) : null;
  const me = rows?.find((r) => r.userId === viewerId);
  return group && rows && me ? { group, me, rows } : NOT_FOUND;
}
const isRes = (v: unknown): v is Res => !!v && typeof v === 'object' && 'status' in v && 'body' in v;

/** PATCH /api/groups/[id] { name?, color?, homeCourt?, dailyDrill?, inviteOpen?, rotateInvite? } */
export async function editGroup(db: GroupsDb, groupId: string, viewerId: string, body: unknown, now = new Date()): Promise<Res> {
  const t = now.getTime();
  const l = await loadAs(db, groupId, viewerId, t);
  if (isRes(l)) return l;
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const known = new Set(['name', 'color', 'homeCourt', 'dailyDrill', 'inviteOpen', 'rotateInvite']);
  if (Object.keys(b).some((k) => !known.has(k))) return err(400, 'unexpected_field');
  const next: GroupRow = { ...l.group };
  // the assigned daily drill is a coach's call (owner or coach); every other edit is the owner's
  if ('dailyDrill' in b) {
    if (l.group.kind !== 'team' || !can(l.me.role, 'assign')) return err(403, 'forbidden');
    if (typeof b.dailyDrill !== 'boolean') return err(400, 'daily_drill_invalid');
    next.dailyDrill = b.dailyDrill;
  }
  const ownerEdits = ['name', 'color', 'homeCourt', 'inviteOpen', 'rotateInvite'].filter((k) => k in b);
  if (ownerEdits.length && !can(l.me.role, 'edit')) return err(403, 'forbidden');
  if ('name' in b) { const n = checkGroupName(l.group.kind, b.name); if (!n.ok) return err(400, n.error); next.name = n.name; }
  if ('color' in b) { if (!isGroupColor(b.color)) return err(400, 'color_invalid'); next.color = b.color; }
  if ('homeCourt' in b) { const c = checkHomeCourt(b.homeCourt); if (!c.ok) return err(400, 'home_court_invalid'); next.homeCourt = c.ref; }
  if ('inviteOpen' in b) { if (typeof b.inviteOpen !== 'boolean') return err(400, 'invite_open_invalid'); next.inviteOpen = b.inviteOpen; }
  if (b.rotateInvite === true) { const tok = await freshToken(db, t); if (!tok) return NOT_READY; next.inviteToken = tok; }
  const w = await store.updateGroup(db, next, t);
  if (!w.ok) return w.error === 'conflict' ? err(409, 'name_taken') : fromWrite(w)!;
  return ok({ saved: true });
}

/** DELETE /api/groups/[id] — the owner's only. */
export async function deleteGroupFor(db: GroupsDb, groupId: string, viewerId: string, now = new Date()): Promise<Res> {
  const t = now.getTime();
  const l = await loadAs(db, groupId, viewerId, t);
  if (isRes(l)) return l;
  if (!can(l.me.role, 'delete')) return err(403, 'forbidden');
  const w = await store.deleteGroup(db, groupId, t);
  return fromWrite(w) ?? ok({ deleted: true });
}

/** POST /api/groups/[id]/members { action: 'leave' | 'remove' | 'role' | 'share', userId?, role?, on? } */
export async function memberAction(db: GroupsDb, groupId: string, viewerId: string, body: unknown, now = new Date()): Promise<Res> {
  const t = now.getTime();
  const l = await loadAs(db, groupId, viewerId, t);
  if (isRes(l)) return l;
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const target = typeof b.userId === 'string' ? l.rows.find((r) => r.userId === b.userId) : undefined;
  switch (b.action) {
    case 'leave': {
      // a team's roster link stays: leaving the team is not leaving the coach (the roster has its own end)
      if (!can(l.me.role, 'leave')) return err(409, 'owner_cannot_leave', { message: 'Hand the group over or delete it: an owner cannot leave.' });
      return fromWrite(await store.removeMember(db, groupId, viewerId, t)) ?? ok({ left: true });
    }
    case 'remove': {
      if (!target) return NOT_FOUND;
      if (!can(l.me.role, 'remove_member') || !canRemove(l.me.role, target.role, target.userId === viewerId)) return err(403, 'forbidden');
      return fromWrite(await store.removeMember(db, groupId, target.userId, t)) ?? ok({ removed: true });
    }
    case 'role': {
      if (!target) return NOT_FOUND;
      if (b.role !== 'coach' && b.role !== 'member') return err(400, 'role_invalid');
      if (!can(l.me.role, 'set_role') || !canSetRole(target.role, b.role, await isCertified(db, target.userId))) return err(403, 'forbidden');
      return fromWrite(await store.setRole(db, groupId, target.userId, b.role, t)) ?? ok({ saved: true });
    }
    case 'share': {
      if (typeof b.on !== 'boolean') return err(400, 'on_invalid');
      // the switch exists only for a verified adult who saves numbers; a minor (or unknown age) can never turn it on
      if (b.on) {
        const [facts] = await memberFacts(db, [l.me], null, now);
        if (facts.band !== 'adult' || !facts.canSaveScan) return err(403, 'share_adults_who_save_only', { message: 'Sharing measured numbers is for adults who save them.' });
      }
      return fromWrite(await store.setShare(db, groupId, viewerId, b.on, t)) ?? ok({ saved: true, on: b.on });
    }
    default:
      return err(400, 'action_invalid');
  }
}

/**
 * POST /api/groups/[id]/act — one preset act, each once:
 *   { kind: 'react', item, reaction } / { kind: 'unreact', item, reaction }   a reaction to a feed item the viewer can see
 *   { kind: 'nudge', to, nudge }                                            a buddy who has not done today's drill
 *   { kind: 'duo', with, target }                                           this week's duo goal with another member
 *   { kind: 'challenge', code }                                             one of the viewer's own open challenges
 * Any other field is refused: there is nowhere to put a typed word.
 */
export async function groupAct(db: GroupsDb, groupId: string, viewerId: string, body: unknown, now = new Date()): Promise<Res> {
  const t = now.getTime();
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const allowedKeys: Record<string, string[]> = { react: ['item', 'reaction'], unreact: ['item', 'reaction'], nudge: ['to', 'nudge'], duo: ['with', 'target'], challenge: ['code'] };
  const kind = typeof b.kind === 'string' ? b.kind : '';
  if (!allowedKeys[kind]) return err(400, 'kind_invalid');
  if (Object.keys(b).some((k) => k !== 'kind' && !allowedKeys[kind].includes(k))) return err(400, 'unexpected_field');
  const l = await loadAs(db, groupId, viewerId, t);
  if (isRes(l)) return l;
  const insert = async (x: Omit<store.NewAct, 'groupId'>) => {
    const w = await store.insertAct(db, { groupId, ...x }, t);
    return fromWrite(w) ?? ok({ saved: true, already: !(w as { value: boolean }).value });
  };

  if (kind === 'react' || kind === 'unreact') {
    if (!can(l.me.role, 'react')) return err(403, 'forbidden');
    if (!isReactionKey(b.reaction) || typeof b.item !== 'string' || b.item.length > 160) return err(400, 'reaction_invalid');
    const dedupe = reactionDedupe(b.item, viewerId, b.reaction);
    if (kind === 'unreact') return fromWrite(await store.deleteAct(db, groupId, dedupe, viewerId, t)) ?? ok({ saved: true });
    // only an item on this group's feed, as the viewer sees it right now
    const view = await loadGroupView(db, groupId, viewerId, now);
    const feed = ((view.body.group as GroupView | undefined)?.feed ?? []);
    if (!feed.some((f) => f.key === b.item)) return NOT_FOUND;
    return insert({ kind: 'reaction', dedupeKey: dedupe, fromUserId: viewerId, toUserId: null, ref: b.item, preset: b.reaction, points: null });
  }

  if (kind === 'nudge') {
    if (!can(l.me.role, 'nudge')) return err(403, 'forbidden');
    if (typeof b.nudge !== 'string' || !(b.nudge in NUDGES)) return err(400, 'nudge_invalid');
    const to = l.rows.find((r) => r.userId === b.to);
    if (!to || to.userId === viewerId) return NOT_FOUND;
    const today = dayOf(now);
    const facts = await memberFacts(db, [to], null, now);
    const done = (await readActivity(db, facts, [], now)).drillDays[to.userId]?.includes(today);
    if (done) return err(409, 'already_done', { message: 'They already did today’s drill.' });
    return insert({ kind: 'nudge', dedupeKey: `nudge:${today}:${viewerId}:${to.userId}`, fromUserId: viewerId, toUserId: to.userId, ref: today, preset: b.nudge, points: null });
  }

  if (kind === 'duo') {
    if (!can(l.me.role, 'duo')) return err(403, 'forbidden');
    if (!isDuoTarget(b.target)) return err(400, 'target_invalid');
    const partner = l.rows.find((r) => r.userId === b.with);
    if (!partner || partner.userId === viewerId) return NOT_FOUND;
    const week = weekKeyOf(now);
    return insert({ kind: 'duo', dedupeKey: duoKey(week, viewerId, partner.userId), fromUserId: viewerId, toUserId: partner.userId, ref: week, preset: String(b.target), points: null });
  }

  // challenge: one of the viewer's own, still open (challenges v2: 48 hours)
  if (!can(l.me.role, 'post_challenge')) return err(403, 'forbidden');
  if (typeof b.code !== 'string' || b.code.length > 64) return err(400, 'code_invalid');
  const link = await soft(db.challengeLink.findUnique({ where: { code: b.code }, select: { code: true, ownerUserId: true, createdAt: true } }), null);
  if (!link || link.ownerUserId !== viewerId || new Date(link.createdAt).getTime() < t - CHALLENGE_TTL_MS) return NOT_FOUND;
  return insert({ kind: 'challenge', dedupeKey: `challenge:${link.code}`, fromUserId: viewerId, toUserId: null, ref: link.code, preset: null, points: null });
}

/** profile v2's "friend": two accounts in one squad (lib/profile-v2/visibility.ts viewerIsFriend). false before the SQL. */
export function areSquadmates(db: store.RawDb, viewerId: string | null, ownerId: string): Promise<boolean> {
  return viewerId ? store.areSquadmates(db, viewerId, ownerId) : Promise.resolve(false);
}
