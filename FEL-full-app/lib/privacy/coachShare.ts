// AB-04: "has this adult opted in and shared with coach X?"
//
// COACH-STORE-V1 should call adultOptedInAndSharedWithCoach and not read ScanSaveOptIn.coachShares itself.
//
// A share is true only when the jump_numbers grant is live (granted, not revoked) AND some entry has that
// coachId, a bookingId, and withdrawnAt null. Revoking the opt-in makes this false immediately without deleting
// the entries. Granting again resurrects an entry that was not withdrawn — the withdrawal is the off switch
// for a coach, and the adult can withdraw whether or not the opt-in is currently on.
//
// Shares live as JSON on ScanSaveOptIn so SessionBooking gains no column (that table is read by GET
// /api/v1/sessions; a missing column there would 500 a deploy that raced the SQL).
//
// Fail closed: any thrown read → false. No user id in the log.

import { scanSaveOptIn } from './scanSaveOptIn';
import { canSaveScanNumbers, logGateFailure } from './scanSaveGate';

export interface CoachShareEntry {
  bookingId: string;
  coachId: string;
  sharedAt: string;
  withdrawnAt: string | null;
}

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

export function parseCoachShares(raw: unknown): CoachShareEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CoachShareEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (typeof e.bookingId !== 'string' || !ID_RE.test(e.bookingId)) continue;
    if (typeof e.coachId !== 'string' || !ID_RE.test(e.coachId)) continue;
    if (typeof e.sharedAt !== 'string' || !e.sharedAt) continue;
    if (e.withdrawnAt != null && typeof e.withdrawnAt !== 'string') continue;
    out.push({
      bookingId: e.bookingId,
      coachId: e.coachId,
      sharedAt: e.sharedAt,
      withdrawnAt: e.withdrawnAt == null ? null : e.withdrawnAt,
    });
  }
  return out;
}

type ShareRow = { coachShares: unknown };

type ShareDb = {
  scanSaveOptIn: {
    findUnique: (args: { where: { userId: string }; select: { coachShares: true } }) => Promise<ShareRow | null>;
    update?: (args: { where: { userId: string }; data: { coachShares: CoachShareEntry[] } }) => Promise<unknown>;
  };
  coachClient?: {
    findFirst: (args: { where: { clientId: string; coachId: string; endedAt: null }; select: { id: true } }) => Promise<{ id: string } | null>;
  };
};

/**
 * True when this adult's jump-number opt-in is on and they have an unwithdrawn share with this coach
 * for some booking. False for kids, unknown age, a revoked opt-in, a withdrawn share, or any error.
 */
export async function adultOptedInAndSharedWithCoach(db: unknown, userId: string, coachId: string): Promise<boolean> {
  if (typeof userId !== 'string' || !userId || typeof coachId !== 'string' || !ID_RE.test(coachId)) return false;
  try {
    if (!(await scanSaveOptIn(db, userId))) return false;
    const row = await (db as ShareDb).scanSaveOptIn.findUnique({
      where: { userId },
      select: { coachShares: true },
    });
    return parseCoachShares(row?.coachShares).some((s) => s.coachId === coachId && s.withdrawnAt == null);
  } catch (e) {
    logGateFailure('scan_save_coach_share_read_failed', e);
    return false;
  }
}

/**
 * Record a per-booking share. False (and no write) unless the account can save numbers AND coachId is a live
 * CoachClient of this athlete. A thrown write returns false so the booking that called this can still succeed.
 */
export async function recordCoachShare(db: unknown, userId: string, bookingId: string, coachId: string): Promise<boolean> {
  if (!ID_RE.test(bookingId) || !ID_RE.test(coachId)) return false;
  try {
    if (!(await canSaveScanNumbers(db as Parameters<typeof canSaveScanNumbers>[0], userId))) return false;
    const client = db as ShareDb;
    const link = await client.coachClient?.findFirst({
      where: { clientId: userId, coachId, endedAt: null },
      select: { id: true },
    });
    if (!link) return false;
    const row = await client.scanSaveOptIn.findUnique({ where: { userId }, select: { coachShares: true } });
    const shares = parseCoachShares(row?.coachShares);
    const now = new Date().toISOString();
    const existing = shares.find((s) => s.bookingId === bookingId);
    const next = existing
      ? shares.map((s) => (s.bookingId === bookingId ? { ...s, coachId, withdrawnAt: null } : s))
      : [...shares, { bookingId, coachId, sharedAt: now, withdrawnAt: null }];
    await client.scanSaveOptIn.update?.({ where: { userId }, data: { coachShares: next } });
    return true;
  } catch (e) {
    logGateFailure('scan_save_coach_share_write_failed', e);
    return false;
  }
}

/** Withdraw one booking's share. Does not require the opt-in to be on. False when there is nothing to withdraw. */
export async function withdrawCoachShare(db: unknown, userId: string, bookingId: string): Promise<boolean> {
  if (typeof userId !== 'string' || !userId || !ID_RE.test(bookingId)) return false;
  try {
    const client = db as ShareDb;
    const row = await client.scanSaveOptIn.findUnique({ where: { userId }, select: { coachShares: true } });
    if (!row) return false;
    const shares = parseCoachShares(row.coachShares);
    const now = new Date().toISOString();
    let changed = false;
    const next = shares.map((s) => {
      if (s.bookingId !== bookingId || s.withdrawnAt) return s;
      changed = true;
      return { ...s, withdrawnAt: now };
    });
    if (!changed) return false;
    await client.scanSaveOptIn.update?.({ where: { userId }, data: { coachShares: next } });
    return true;
  } catch (e) {
    logGateFailure('scan_save_coach_share_write_failed', e);
    return false;
  }
}

export function activeSharedBookingIds(raw: unknown): string[] {
  return parseCoachShares(raw).filter((s) => s.withdrawnAt == null).map((s) => s.bookingId);
}
