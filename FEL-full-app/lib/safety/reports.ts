// lib/safety/reports.ts — SAFETY lane (SAF-05, 2026-10-25): reporting a person, and what an admin does about it.
//
// THE FLOW: a signed-in person reports a profile, a squad post, a group, a challenge result or a coach message with a
// preset reason → the admin queue (/admin/reports) → dismiss, warn, mute or ban → the person sees their standing on the
// support page and may APPEAL once → an admin upholds or lifts. Every step writes a ModerationAudit row.
//
// THE RULES THIS HOLDS (owner, QUALITY 2026-10-20 "safety ALL"; teen rules; brief SAF-05):
//   · A REPORT NEVER LEAKS ITS REPORTER. The reported person is never told who reported them, never reads the note, and
//     their data export leaves reports about them out (lib/data-rights/registry.ts). The reporter is answered the same
//     { received: true } whatever happened (stored, duplicate, unknown target, self, before the SQL), so a report is not
//     an oracle for whether an account or a post exists.
//   · NO FREE TEXT FROM OR ABOUT A MINOR. A note is kept only when the reporter AND the person reported are verified
//     adults; otherwise it is dropped (the preset reason carries the report). An appeal note likewise: adults only. Every
//     kept note passes the shared text screen and is capped. A minor never sees another user's free text here: the
//     moderated person sees preset reasons only, and only admins see notes.
//   · THE TARGET'S OWNER IS FOUND ON THE SERVER from the target (a card slug, a post id, a code) — never taken from the
//     body. One that cannot be resolved is stored with no person (an admin still sees the target).
//   · EVERY ACTION IS AUDITED and every moderation can be appealed; an appeal is decided by an admin, never automatically.
//   · RATE: 10 reports per reporter per hour (new, owner can tune); a second open report of the same target by the same
//     person is not stored again.
//
// Mute and ban are STATE here (UserModeration) with one reader, moderationState(). Wiring them into the write routes that
// let a person reach others (the squads act route, coach messages, challenge posts, sign-in for a ban) is routed to those
// routes' owners — docs/TEEN-SAFE-AUDIT.md lists each line.
import type { Caller, CallerDb } from './caller';
import { isAdultAccount } from './caller';
import { cleanTyped, screenAbuse, screenRefusal } from './textScreen';
import { audit, newId, rawExec, rawQuery, safetyReady, SQL, type RawDb } from './store';
import {
  ADMIN_ACTIONS, APPEAL_REASONS, APPEAL_WINDOW_DAYS, DEFAULT_DAYS, MODERATION_KINDS, NOTE_MAX, REPORT_REASONS, REPORT_TARGETS,
  type ReportTarget, type Standing,
} from './reportPresets';

export * from './reportPresets';

export const REPORT_RATE = { perHour: 10 } as const;

const pick = <T extends string>(list: readonly T[], v: unknown): T | null => (list as readonly unknown[]).includes(v) ? (v as T) : null;

// ── resolving a target to the person behind it ──────────────────────────────────────────────────────────────────────

export interface ReportsDb extends RawDb, CallerDb {
  creatorCard: { findUnique(a: unknown): Promise<{ ownerId: string } | null> };
  challengeLink: { findUnique(a: unknown): Promise<{ ownerUserId: string | null } | null> };
  programMessage: { findUnique(a: unknown): Promise<{ authorId: string } | null> };
}

/** The account behind a target, or null. Reads only the owner column; never throws. */
export async function resolveTarget(db: ReportsDb, kind: ReportTarget, ref: string): Promise<string | null> {
  try {
    switch (kind) {
      case 'profile': return (await db.creatorCard.findUnique({ where: { slug: ref.toLowerCase() }, select: { ownerId: true } }))?.ownerId ?? null;
      case 'challenge': return (await db.challengeLink.findUnique({ where: { code: ref }, select: { ownerUserId: true } }))?.ownerUserId ?? null;
      case 'coach_message': return (await db.programMessage.findUnique({ where: { id: ref }, select: { authorId: true } }))?.authorId ?? null;
      case 'squad_post': {
        const rows = await db.$queryRawUnsafe<{ fromUserId: string }[]>(`SELECT "fromUserId" FROM "TrainingGroupAct" WHERE "id" = $1`, ref);
        return rows?.[0]?.fromUserId ?? null;
      }
      case 'group': {
        const rows = await db.$queryRawUnsafe<{ ownerId: string }[]>(`SELECT "ownerId" FROM "TrainingGroup" WHERE "id" = $1`, ref);
        return rows?.[0]?.ownerId ?? null;
      }
    }
  } catch {
    return null;   // a table not there yet (squads are pending SQL), or a bad id: no person, the report still lands
  }
  return null;
}

export interface Res { status: number; body: Record<string, unknown> }
const RECEIVED: Res = { status: 200, body: { received: true } };

// ── filing a report ─────────────────────────────────────────────────────────────────────────────────────────────────

export async function fileReport(db: ReportsDb, caller: Caller, body: unknown, now: number = Date.now()): Promise<Res> {
  if (!caller.userId) return { status: 401, body: { error: 'unauthorized' } };
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const kind = pick(REPORT_TARGETS, b.target);
  const reason = pick(REPORT_REASONS, b.reason);
  const ref = typeof b.ref === 'string' ? b.ref.trim().slice(0, 96) : '';
  if (!kind || !reason || !/^[A-Za-z0-9_-]{1,96}$/.test(ref)) return { status: 400, body: { error: 'invalid_report' } };

  const reportedId = await resolveTarget(db, kind, ref);
  if (reportedId && reportedId === caller.userId) return RECEIVED;   // reporting yourself: nothing to review

  // the note: verified adult about a verified adult only; screened; capped
  let note: string | null = null;
  const typed = cleanTyped(b.note, NOTE_MAX);
  if (typed && caller.adult && (await isAdultAccount(db, reportedId, new Date(now)))) {
    const hits = screenAbuse(typed).filter((h) => h.kind === 'contact');
    if (hits.length) return { status: 422, body: { error: 'note_refused', message: screenRefusal(hits) } };
    note = typed;   // abuse words in a note QUOTE what was said — the admin needs them; contact details are refused
  }

  if (!(await safetyReady(db, now))) return { status: 200, body: { received: true } };
  const recent = await rawQuery<{ n: number }>(db, 'report_rate_failed', SQL.countRecentReports, [caller.userId, 60], now);
  if (recent && Number(recent[0]?.n ?? 0) >= REPORT_RATE.perHour) return { status: 429, body: { error: 'rate_limited' } };
  const dup = await rawQuery<{ id: string }>(db, 'report_dup_failed', SQL.duplicateReport, [caller.userId, kind, ref], now);
  if (dup?.length) return RECEIVED;

  const id = newId();
  const wrote = await rawExec(db, 'report_insert_failed', SQL.insertReport, [id, caller.userId, reportedId, kind, ref, reason, note], now);
  if (typeof wrote === 'number' && wrote > 0) await audit(db, caller.userId, 'report_filed', 'report', id, { target: kind, reason }, now);
  return RECEIVED;
}

// ── the admin queue ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface QueueReport { id: string; reportedId: string | null; targetKind: string; targetRef: string; reason: string; note: string | null; status: string; action: string | null; createdAt: Date }
export interface QueueAppeal { id: string; userId: string; kind: string; reason: string; createdAt: Date; endsAt: Date | null; appealReason: string | null; appealNote: string | null; appealedAt: Date | null }

/** What /admin/reports shows: open reports (newest first) and open appeals (oldest first). null = tables not there. */
export async function adminQueue(db: RawDb, now: number = Date.now()): Promise<{ reports: QueueReport[]; appeals: QueueAppeal[] } | null> {
  const reports = await rawQuery<QueueReport>(db, 'queue_reports_failed', SQL.listReports, [['open'], 100], now);
  if (reports === null) return null;
  const appeals = (await rawQuery<QueueAppeal>(db, 'queue_appeals_failed', SQL.openAppeals, [100], now)) ?? [];
  return { reports, appeals };
}

/** dismiss | warn | mute | ban on one open report. Admins only (the route checks the role). */
export async function actOnReport(db: RawDb, adminId: string, body: unknown, now: number = Date.now()): Promise<Res> {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const reportId = typeof b.reportId === 'string' ? b.reportId.slice(0, 64) : '';
  const action = pick(ADMIN_ACTIONS, b.action);
  const reason = pick(REPORT_REASONS, b.reason);
  if (!reportId || !action) return { status: 400, body: { error: 'invalid' } };
  if (!(await safetyReady(db, now))) return { status: 503, body: { error: 'reports_not_ready' } };
  const rows = await rawQuery<{ id: string; reportedId: string | null; status: string }>(db, 'report_read_failed', SQL.reportById, [reportId], now);
  const report = rows?.[0];
  if (!report) return { status: 404, body: { error: 'not_found' } };
  if (report.status !== 'open') return { status: 409, body: { error: 'already_decided' } };

  if (action === 'dismiss') {
    const n = await rawExec(db, 'report_close_failed', SQL.closeReport, [reportId, 'dismissed', null, adminId], now);
    if (n !== 1) return { status: 409, body: { error: 'already_decided' } };
    await audit(db, adminId, 'report_dismissed', 'report', reportId, null, now);
    return { status: 200, body: { ok: true, status: 'dismissed' } };
  }
  if (!report.reportedId) return { status: 409, body: { error: 'no_person' } };
  if (!reason) return { status: 400, body: { error: 'reason_required' } };
  const days = typeof b.days === 'number' && Number.isInteger(b.days) && b.days > 0 && b.days <= 365 ? b.days : DEFAULT_DAYS[action];
  const endsAt = action === 'warn' || days == null ? null : new Date(now + days * 86_400_000);
  const n = await rawExec(db, 'report_close_failed', SQL.closeReport, [reportId, 'actioned', action, adminId], now);
  if (n !== 1) return { status: 409, body: { error: 'already_decided' } };
  const moderationId = newId();
  const m = await rawExec(db, 'moderation_insert_failed', SQL.insertModeration, [moderationId, report.reportedId, action, reason, reportId, adminId, endsAt], now);
  if (m !== 1) return { status: 500, body: { error: 'write_failed' } };
  await audit(db, adminId, `moderation_${action}`, 'moderation', moderationId, { reportId, reason, days: endsAt ? days : null }, now);
  await audit(db, adminId, 'report_actioned', 'report', reportId, { action, moderationId }, now);
  return { status: 200, body: { ok: true, status: 'actioned', moderationId } };
}

/** uphold | lift one open appeal. Admins only. */
export async function decideAppeal(db: RawDb, adminId: string, body: unknown, now: number = Date.now()): Promise<Res> {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const moderationId = typeof b.moderationId === 'string' ? b.moderationId.slice(0, 64) : '';
  const decision = b.decision === 'uphold' ? 'upheld' : b.decision === 'lift' ? 'lifted' : null;
  if (!moderationId || !decision) return { status: 400, body: { error: 'invalid' } };
  const n = await rawExec(db, 'appeal_decide_failed', SQL.decideAppeal, [moderationId, decision], now);
  if (n === 'not_ready') return { status: 503, body: { error: 'reports_not_ready' } };
  if (n !== 1) return { status: 409, body: { error: 'no_open_appeal' } };
  await audit(db, adminId, `appeal_${decision}`, 'moderation', moderationId, null, now);
  return { status: 200, body: { ok: true, appealStatus: decision } };
}

// ── the person's own standing, and their appeal ─────────────────────────────────────────────────────────────────────

interface ModRow { id: string; kind: string; reason: string; createdAt: Date; endsAt: Date | null; liftedAt: Date | null; appealStatus: string }

const isActive = (r: Pick<ModRow, 'kind' | 'endsAt' | 'liftedAt'>, now: number) => r.kind !== 'warn' && !r.liftedAt && (!r.endsAt || new Date(r.endsAt).getTime() > now);

/** The person's moderations: preset fields only — never the report, its note, the reporter or the admin. */
export async function myStanding(db: RawDb, userId: string, now: number = Date.now()): Promise<Standing[] | null> {
  const rows = await rawQuery<ModRow>(db, 'standing_read_failed', SQL.moderationsFor, [userId], now);
  if (rows === null) return null;
  return rows.map((r) => ({
    id: r.id,
    kind: (pick(MODERATION_KINDS, r.kind) ?? 'warn'),
    reason: (pick(REPORT_REASONS, r.reason) ?? 'other'),
    createdAt: new Date(r.createdAt).toISOString(),
    endsAt: r.endsAt ? new Date(r.endsAt).toISOString() : null,
    active: isActive(r, now),
    appealStatus: (pick(['none', 'open', 'upheld', 'lifted'] as const, r.appealStatus) ?? 'none'),
    canAppeal: r.appealStatus === 'none' && now - new Date(r.createdAt).getTime() < APPEAL_WINDOW_DAYS * 86_400_000,
  }));
}

/** File the one appeal a moderation allows. A preset reason; a note only from a verified adult, screened and capped. */
export async function fileAppeal(db: RawDb, caller: Caller, body: unknown, now: number = Date.now()): Promise<Res> {
  if (!caller.userId) return { status: 401, body: { error: 'unauthorized' } };
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const moderationId = typeof b.moderationId === 'string' ? b.moderationId.slice(0, 64) : '';
  const reason = pick(APPEAL_REASONS, b.reason);
  if (!moderationId || !reason) return { status: 400, body: { error: 'invalid' } };
  let note: string | null = null;
  const typed = cleanTyped(b.note, NOTE_MAX);
  if (typed && caller.adult) {
    const hits = screenAbuse(typed);
    if (hits.length) return { status: 422, body: { error: 'note_refused', message: screenRefusal(hits) } };
    note = typed;
  }
  const rows = await rawQuery<ModRow & { userId: string }>(db, 'moderation_read_failed', SQL.moderationById, [moderationId], now);
  if (rows === null) return { status: 503, body: { error: 'reports_not_ready' } };
  const m = rows[0];
  // someone else's moderation reads the same as none at all
  if (!m || m.userId !== caller.userId) return { status: 404, body: { error: 'not_found' } };
  if (now - new Date(m.createdAt).getTime() >= APPEAL_WINDOW_DAYS * 86_400_000) return { status: 409, body: { error: 'appeal_window_closed' } };
  const n = await rawExec(db, 'appeal_file_failed', SQL.fileAppeal, [moderationId, caller.userId, reason, note], now);
  if (n !== 1) return { status: 409, body: { error: 'already_appealed' } };
  await audit(db, caller.userId, 'appeal_filed', 'moderation', moderationId, { reason }, now);
  return { status: 200, body: { ok: true, appealStatus: 'open' } };
}

/** Is this account muted or banned right now? The reader the write routes call (routed wiring). Fails OPEN to "no
 *  moderation" only when the tables are not there; a read error after that reads as not moderated and is logged. */
export async function moderationState(db: RawDb, userId: string, now: number = Date.now()): Promise<{ muted: boolean; banned: boolean }> {
  const rows = await rawQuery<ModRow>(db, 'moderation_state_failed', SQL.moderationsFor, [userId], now);
  const live = (rows ?? []).filter((r) => isActive(r, now));
  return { muted: live.some((r) => r.kind === 'mute' || r.kind === 'ban'), banned: live.some((r) => r.kind === 'ban') };
}
