// The /api/learn routes' logic — auth and request shape stay in app/api/learn/*/route.ts, thin on purpose, so this file
// runs for real over a stand-in database in lib/knowledge/server/learnRoutes.test.ts (vitest does not collect app/).
// KNOWLEDGE-FEED v2 (2026-10-06): owner decisions 2 (account sync), 3 (daily-goal XP bonus) and 4 (learning XP feeds
// account XP, capped).
//
// THE AGE RULE. Only a VERIFIED ADULT's progress is written to the account: User.dobYear read from the database
// (lib/privacy/scanSaveGate.readDobYear → verifiedAdult, the same strict rule as every other adults-only write). Under 18
// and unknown age get `eligible: false` (GET) or 403 `learn_sync_adults_only` (writes) and nothing is written — their
// progress stays on their device, and so does their learning XP. Deleting your own learn data needs no age.
//
// FAIL SOFT. Until prisma/pending/2026-10-06-knowledge-feed.sql is applied, the tables do not exist: every read and
// write of them is caught and answered 503 `learn_sync_unavailable` (the feed stays device-only), never a 500. Logs carry
// an event name and the error's name/code only — never a user id, a card or an age.

import { readDobYear, verifiedAdult, type GateDb } from '@/lib/privacy/scanSaveGate';
import { cardById } from '../catalog';
import { mergeStates, sanitizeIncoming, type MergeMode } from '../sync';
import { applyLearnEvent, LEARN_ACCOUNT_XP_DAILY_CAP, parseEvent, plausibleDay } from '../accountXp';
import { ledgerFromRow, saveState, stateFromRows, type LearnDb } from './learnStore';

export interface Out { status: number; body: Record<string, unknown> }

export const ADULTS_ONLY: Out = { status: 403, body: { error: 'learn_sync_adults_only', saved: false } };
export const UNAVAILABLE: Out = { status: 503, body: { error: 'learn_sync_unavailable' } };
/** A device id is the client's own random token (syncClient.deviceId): short, plain characters. */
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;

function logFail(event: string, e: unknown): void {
  const err = (e && typeof e === 'object' ? e : {}) as { name?: unknown; code?: unknown };
  const safe = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(v) ? v : '');
  console.warn(`[learn] ${event} ${safe(err.name) || typeof e}${safe(err.code) ? ` ${safe(err.code)}` : ''}`);
}

async function adult(db: unknown, userId: string): Promise<boolean> {
  return verifiedAdult(await readDobYear(db as GateDb, userId, 'learn_sync'));
}

/** GET /api/learn/sync — may this account sync, and what does the account hold? Reads only. */
export async function syncStatus(dbIn: unknown, userId: string): Promise<Out> {
  if (!(await adult(dbIn, userId))) return { status: 200, body: { eligible: false } };
  const db = dbIn as LearnDb;
  try {
    const p = await db.learnProfile.findUnique({ where: { userId } });
    const cards = p ? await db.learnCard.findMany({ where: { userId } }) : [];
    const ledger = ledgerFromRow(p);
    return { status: 200, body: { eligible: true, state: p ? stateFromRows(p, cards) : null, devices: p?.devices ?? [], xp: { day: ledger.day, today: ledger.today, cap: LEARN_ACCOUNT_XP_DAILY_CAP } } };
  } catch (e) {
    logFail('sync_read_failed', e);
    return UNAVAILABLE;
  }
}

/**
 * POST /api/learn/sync { deviceId, mode, state } — merge this device's progress into the account and return the result.
 * `mode: 'first-link'` from a device the account has never merged adds the device's history (lib/knowledge/sync.ts);
 * from a device already in LearnProfile.devices it is downgraded to 'linked', so a retry never double-counts.
 * No account XP is credited here: merged history is learning XP only (account XP comes from events, capped).
 */
export async function syncPush(dbIn: unknown, userId: string, body: unknown): Promise<Out> {
  if (!(await adult(dbIn, userId))) return ADULTS_ONLY;
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const deviceId = typeof b.deviceId === 'string' && DEVICE_RE.test(b.deviceId) ? b.deviceId : null;
  const asked: MergeMode | null = b.mode === 'first-link' || b.mode === 'linked' ? b.mode : null;
  if (!deviceId || !asked) return { status: 400, body: { error: 'bad_request' } };
  const incoming = sanitizeIncoming(b.state, (id) => !!cardById(id));
  const db = dbIn as LearnDb;
  try {
    return await db.$transaction(async (tx) => {
      const p = await tx.learnProfile.findUnique({ where: { userId } });
      const before = stateFromRows(p, p ? await tx.learnCard.findMany({ where: { userId } }) : []);
      const devices = p?.devices ?? [];
      const mode: MergeMode = asked === 'first-link' && !devices.includes(deviceId) ? 'first-link' : 'linked';
      const merged = mergeStates(before, incoming, mode);
      const nextDevices = devices.includes(deviceId) ? devices : [...devices, deviceId].slice(-20);
      await saveState(tx, userId, merged, ledgerFromRow(p), nextDevices, before);
      return { status: 200, body: { ok: true, mode, state: { ...merged, recent: [] } } };
    });
  } catch (e) {
    logFail('sync_write_failed', e);
    return UNAVAILABLE;
  }
}

/** DELETE /api/learn/sync — take your learning data back off the account. Open to every signed-in account (no age
 *  needed to delete your own data). Account XP already credited stays: it is the account's, like a game's. */
export async function syncDelete(dbIn: unknown, userId: string): Promise<Out> {
  const db = dbIn as LearnDb;
  try {
    const cards = await db.learnCard.deleteMany({ where: { userId } });
    const profile = await db.learnProfile.deleteMany({ where: { userId } });
    return { status: 200, body: { ok: true, deleted: { profile: profile.count, cards: cards.count } } };
  } catch (e) {
    logFail('sync_delete_failed', e);
    return UNAVAILABLE;
  }
}

export interface EventDeps {
  /** PlayerProfile exists before its row is locked and credited (lib/profile-service.getOrCreateProfile). */
  ensureProfile(userId: string): Promise<unknown>;
  /** Lock the PlayerProfile row for the transaction (lib/economy-caps-db.lockPlayerForDailyCap): two events of one
   *  account can't both read the same cap ledger and both spend its headroom. */
  lockPlayer(tx: LearnDb, userId: string): Promise<void>;
  now(): number;
}

/**
 * POST /api/learn/event { day, event } — one card view or quiz answer from a synced account. The server applies it to
 * its own copy with the device's reducers, grades a quiz itself, and credits the learning XP it earned to account XP
 * under the daily cap (and the daily-goal bonus once a day). Responds with what was credited.
 */
export async function learnEvent(dbIn: unknown, userId: string, body: unknown, deps: EventDeps): Promise<Out> {
  if (!(await adult(dbIn, userId))) return ADULTS_ONLY;
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const now = deps.now();
  if (!plausibleDay(b.day, now)) return { status: 400, body: { error: 'bad_day' } };
  const day = b.day as number;
  const parsed = parseEvent(b.event, cardById);
  if (!parsed) return { status: 400, body: { error: 'bad_event' } };
  const db = dbIn as LearnDb;
  try {
    await deps.ensureProfile(userId);
    return await db.$transaction(async (tx) => {
      await deps.lockPlayer(tx, userId);
      const p = await tx.learnProfile.findUnique({ where: { userId } });
      const rows = await tx.learnCard.findMany({ where: { userId, cardId: parsed.card.id } });
      const before = stateFromRows(p, rows);
      const { state, award, correct } = applyLearnEvent(before, ledgerFromRow(p), parsed.event, parsed.card, day, now);
      await saveState(tx, userId, state, award.ledger, p?.devices ?? [], before);
      if (award.accountXp > 0) {
        await tx.playerProfile.update({ where: { userId }, data: { xp: { increment: award.accountXp }, lastActiveAt: new Date(now) } });
      }
      return {
        status: 200,
        body: {
          ok: true, accountXp: award.accountXp, goalBonus: award.goalBonus, capHit: award.capHit,
          xpToday: award.ledger.today, cap: LEARN_ACCOUNT_XP_DAILY_CAP, ...(correct === undefined ? {} : { correct }),
        },
      };
    });
  } catch (e) {
    logFail('event_failed', e);
    return UNAVAILABLE;
  }
}
