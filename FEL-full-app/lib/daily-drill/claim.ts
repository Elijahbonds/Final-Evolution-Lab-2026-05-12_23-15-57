// DAILY-DRILL — finishing today's drill: the day's credit, once, and the streak day by the play path's own claim.
//
// ONCE A DAY, RACE-SAFE. The claim is one transaction:
//   1. the player's PlayerProfile row is locked (lib/economy-caps-db lockPlayerForDailyCap, SELECT … FOR UPDATE — the
//      lock POST /api/sessions takes for the daily caps), so two claims of the same player run one after the other;
//   2. the streak day is claimed by claimPlayStreak (lib/streak/claim.ts, STREAK-CLAIM-RACE #277/#292, moved there from
//      the sessions route unchanged), conditional on the profile this request read: a drill and a game finishing at the
//      same moment pay the day's streak LC once, whichever wins;
//   3. the Lab Credits go through the wallet's one mover (applyLc) under the key daily_drill:<PT day>:<user> with
//      rejectReplay: a key already on the ledger aborts the whole transaction (the streak write rolls back with it), and
//      a key another claim committed DURING this one is a replay that is never committed (challenges-2's pattern).
// The loser of any race answers 'already' from the winner's row. The ledger row is the record that the drill was done
// today (no new table): the card reads it back by its key.
//
// WHAT IT PAYS. The drill's own credit (REASON.DAILY_DRILL_COMPLETE, the wallet's reward rule: (new) 10 LC) plus, when
// finishing it is what opens today's streak day, that day's streak LC (session-payout STREAK_LC_PER_DAY × day, as a game
// pays it) — one ledger row, as a session's credits are. A day a game already opened pays the drill credit alone.
//
// WHAT IT TRUSTS. The camera drill runs on the device and its "done" is the device's word, as every camera number is
// (lib/move/formSummary: "the server cannot verify them"). So the claim is bounded, not believed: one per day, and only
// for a drill of TODAY's focus (the route recomputes the pick). Nothing the camera read is sent or kept.
import { applyLc, WalletError } from '@/lib/wallet/wallet-service';
import { REASON } from '@/lib/wallet/reward-rules';
import { lockPlayerForDailyCap } from '@/lib/economy-caps-db';
import { streakStep, type StreakProfile } from '@/lib/session-payout';
import { claimPlayStreak } from '@/lib/streak/claim';
import { ptDay } from '@/lib/wallet/dailyKey';
import { dailyDrillKey, type DailyDrillView } from './load';
import { focusDrillIds, type Focus } from './plan';

export type ClaimStatus = 'granted' | 'already' | 'not_today' | 'stopped';

export interface ClaimResult {
  status: ClaimStatus;
  /** What this claim paid (granted) or what the day's claim paid (already). */
  amount: number;
  /** The streak's share of `amount` (granted only). */
  streakBonus: number;
  /** The profile's streak after the claim, when known. */
  streakDays: number | null;
}

/** "jump:pogo-bilateral" → its focus and drill, when it is one this module could have made. */
export function parseDailyKey(key: unknown): { focus: Focus; drillId: string } | null {
  if (typeof key !== 'string' || key.length > 80) return null;
  const [focus, drillId, extra] = key.split(':');
  if (extra !== undefined || !focus || !drillId) return null;
  const ids = (() => { try { return focusDrillIds(focus as Focus); } catch { return []; } })();
  return ids.includes(drillId) ? { focus: focus as Focus, drillId } : null;
}

/**
 * Is this key today's drill? Its focus must be today's; its drill either side of today's gate (a pain check-in or a
 * passed landing check can move the gate during the day, and a drill started before it moved still counts).
 */
export function isTodaysKey(view: Pick<DailyDrillView, 'focus' | 'plan'>, key: unknown): boolean {
  const k = parseDailyKey(key);
  return !!k && !!view.plan && k.focus === view.focus;
}

/** Structural: the transaction calls this file and its helpers make. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface ClaimDeps {
  now: () => Date;
  /** The profile the streak step is decided from (the route: getOrCreateProfile, as the sessions route reads it). */
  readProfile: (userId: string) => Promise<StreakProfile | null>;
  applyLc: typeof applyLc;
}

const NOTHING = { amount: 0, streakBonus: 0, streakDays: null } as const;

async function dayClaim(db: Db, key: string): Promise<{ amount: number; streakDays: number | null } | null> {
  const row = await db.walletLedgerEntry.findUnique({ where: { idempotencyKey: key }, select: { delta: true, metadata: true } });
  if (!row) return null;
  const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>;
  return { amount: Number(row.delta ?? 0), streakDays: typeof meta.streakDays === 'number' ? meta.streakDays : null };
}

/**
 * Claim today's drill for `userId`. `view` is today's drill as the route just computed it (loadDailyDrill); `key` is
 * what the page finished. `credit` is in the view (the wallet's rule, read live).
 */
export async function claimDailyDrill(db: Db, userId: string, view: DailyDrillView, key: unknown, deps: ClaimDeps): Promise<ClaimResult> {
  const now = deps.now();
  const ledgerKey = dailyDrillKey(userId, ptDay(now));
  // the cheap answer first: a day already claimed (a retry, a second device) reads one row
  const before = await dayClaim(db, ledgerKey);
  if (before) return { status: 'already', streakBonus: 0, ...before };
  if (!view.plan) return { status: 'stopped', ...NOTHING };
  if (!isTodaysKey(view, key)) return { status: 'not_today', ...NOTHING };
  const k = parseDailyKey(key)!;

  const seen = await deps.readProfile(userId);
  const stamp = now;
  const step = streakStep(seen, stamp.getTime(), 'play');
  try {
    return await db.$transaction(async (tx: Db) => {
      await lockPlayerForDailyCap(tx, userId);
      const streakClaimed = await claimPlayStreak(tx, userId, seen, step, stamp);
      const streakBonus = streakClaimed ? step.streakBonus : 0;
      const amount = view.credit + streakBonus;
      // the streak as the row has it now (this claim's day, or the one a game or another claim took a moment ago)
      const row = await tx.playerProfile.findUnique({ where: { userId }, select: { streakDays: true } }).catch(() => null);
      const streakDays = Number.isFinite(Number(row?.streakDays)) ? Number(row.streakDays) : streakClaimed ? step.streakDays : Math.max(0, Number(seen?.streakDays ?? 0));
      // the rule switched off (RewardRule.active false) and no streak day to pay: nothing to file, so nothing is recorded
      if (amount <= 0) return { status: 'granted' as const, amount: 0, streakBonus: 0, streakDays };
      const paid = await deps.applyLc(tx, {
        playerId: userId, delta: amount, reasonCode: REASON.DAILY_DRILL_COMPLETE, source: 'gameplay', idempotencyKey: ledgerKey,
        metadata: { day: ptDay(now), focus: k.focus, drillId: k.drillId, drillCredit: view.credit, streakBonus, streakDays, ...(streakClaimed && step.owed ? { streakOwed: true } : {}) },
        rejectReplay: true,
      });
      // a key another claim committed DURING this transaction (its insert won the unique race): never commit this one
      if (paid.replayed) throw new WalletError('REPLAYED_KEY', 'daily drill already claimed');
      return { status: 'granted' as const, amount, streakBonus, streakDays };
    });
  } catch (e) {
    // lost the race, or a retry: the winner's row is the record
    const after = await dayClaim(db, ledgerKey).catch(() => null);
    if (after) return { status: 'already', streakBonus: 0, ...after };
    throw e;
  }
}
