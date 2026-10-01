import { NextResponse } from 'next/server';
import { applyLc, sessionWalletGrant } from '@/lib/wallet/wallet-service';
import { REASON } from '@/lib/wallet/reward-rules';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/profile-service';
import { computePrqDelta, MODE_ATTRS, PRQ_CAMERA_SOURCE, prqScore, prqGrade } from '@/lib/prq';
import { sanitizeTallies } from '@/lib/game-systems';
import { createPrqEntry } from '@/lib/prq-entries';
import { addSeasonXp, bookSeasonTierUps } from '@/lib/season/season-service';
import { recordMastery, emitMasteryUps } from '@/lib/mastery/mastery-service';
import { recordServerEvent } from '@/lib/analytics-server';
import { sessionHasPlay } from '@/lib/session-evidence';
import { boundFormSummary, formHasReads, planFormWrite, gameRowAttrs, CAMERA_POWER_ATTR } from '@/lib/move/formSummary';
import { writeFormPlan, type FormWriteResult } from '@/lib/move/formWrite';
import { SCAN_SAVE_REFUSED, canSaveScanNumbers } from '@/lib/privacy/scanSaveGate';
import {
  roomStats, sessionWon, sessionAccuracy, isEndlessSession, sessionPayout, readMusicSet, sessionScoreCap, isCatalogueMode,
  ENDLESS_SESSION_CEILING, ROOM_STATS_FORWARDED, isCreationSession, streakStep, creationNextDueAt, finitePayCapScore,
} from '@/lib/session-payout';
import { canonicalModeKey } from '@/lib/game-data';
import { isExpired } from '@/lib/arena-reclaim';
import { readMusicAttempt, musicAttemptScore, claimMusicSessionPay, MUSIC_SESSION_PAID } from '@/lib/arena-music';
import { checkRunScore, checkUnruledScore } from '@/lib/sessions/modeScoreRules';
import {
  RUN_STATUS, RunClosedError, claimRun, closeRun, fileGrants, findRun, readRunId, replayOf, runWalletKey, sessionLcKey, settleGrant,
  storePaidResult, storedResult, type StoredResult,
} from '@/lib/sessions/sessionRuns';
import { applyEconomyCaps, dailyCapMessage } from '@/lib/economy-caps';
import { sumEarnedToday, lockPlayerForDailyCap } from '@/lib/economy-caps-db';

export const dynamic = 'force-dynamic';

/** A stored or fresh answer, sent as it was decided. */
const send = (r: StoredResult) => NextResponse.json(r.body, { status: r.status });

/**
 * ECONOMY-SESSIONS-HARDEN (2026-09-28): a result that pays nothing and is said out loud — logged with its reason, an
 * analytics row, and (when the run exists) the run closed with this answer stored, so a retry gets the same answer.
 */
async function refuse(
  userId: string, mode: string, reason: string, status: number,
  extra: Record<string, unknown> = {}, run?: { id: string; close: 'rejected' | 'expired'; score?: number | null; durationMs?: number | null },
): Promise<StoredResult> {
  console.warn(`[sessions] ${reason}${extra.detail ? ` ${String(extra.detail)}` : ''}:`, mode, 'user', userId, run ? `run ${run.id}` : 'no run', extra.limit !== undefined && extra.limit !== null ? `limit ${String(extra.limit)}` : '');
  await recordServerEvent({ name: 'session_rejected', userId, props: { mode, reason, ...(extra.detail ? { detail: String(extra.detail) } : {}) } });
  const result: StoredResult = { status, body: { ok: false, paid: false, replayed: false, reason, ...extra, ...(run ? { runId: run.id } : {}) } };
  if (!run) return result;
  return closeRun(prisma, run.id, { status: run.close, result, score: run.score ?? null, durationMs: run.durationMs ?? null, rejectReason: extra.detail ? `${reason}:${String(extra.detail)}` : reason });
}

/** Match states an Arena set can still be played for (app/api/arena: WAITING until joined, ACTIVE until it settles). */
const OPEN_MATCH_STATES = ['WAITING', 'ACTIVE'];

/**
 * MUSIC-SUITE P2 FIX PASS (2026-09-25): is `arenaMatchId` a music duel this player is in, still open, that this player has
 * not submitted a score to yet? The ONLY thing that makes a music set an Arena set to this route (lib/session-payout.ts
 * isEndlessSession). `stats.arena` alone came from the bare ?arena= query (app/play/music/_components/loader.tsx:68) and
 * lifted the endless ceiling for anyone — up to 3,970,700 XP a set while music staking is paused. The shell posts the
 * session BEFORE it submits the Arena score (game-shell.tsx handleEnd), so an honest set is still unsubmitted here, and
 * one match cannot uncap set after set once its score is in. A lookup failure is "not verified": free play.
 *
 * MUSIC-SUITE P6 FIX PASS (2026-09-26): THE FARM THE PAUSE HAD BEEN HIDING. With music stakeable again (step (e)), a
 * music Quick Match is ACTIVE with the house in seat 2 from birth, and this check asked nothing of the SET: no recorded
 * attempt, no limit on how many sessions claimed the match, and the paid score capped only at min(performSetMax(hits),
 * 378,300). Measured with the real helpers: one POST {score 378,300, stats {bars 32, notes 512, perfects 512, arena}} paid
 * 567,500 XP and 18,918 shards (+15 LC), and it could be posted in a loop for 48 h against one 25 LC Quick Match that
 * was never submitted — and the expiry sweep then refunded the 25 LC. Now a verified Arena set needs:
 *   · a FINISHED attempt by this player on this duel (music_attempt_finish — the room posts it before onEnd, so an
 *     honest set always has one);
 *   · its paid score capped at the attempt's REJUDGE (musicAttemptScore), never the client's number;
 *   · ONE paid session per player per duel: the session transaction claims a MUSIC_SESSION_PAID event under the duel's
 *     row lock (claimMusicSessionPay) — a second post for the same duel is paid as free play (the endless ceiling).
 * (The expiry check and the no-opponent check below stay: #30, and movement play's WAITING-duel farm.)
 *
 * MERGE WITH ECONOMY-SESSIONS-HARDEN (2026-09-28): the three rules live inside the run the server started. This read is
 * the EARLY answer only — it runs after the run is found, open, of this mode and inside the mode's score rules (at this
 * merge music had no MEASURED_RUNS row, failed closed, and nothing here was reached — no longer so, see the follow-up
 * paragraph below). A score above the rejudge is
 * SCORE_INVALID above_rejudge (rejected, never clamped — the hardening clamps nothing), and the pay-once claim is made
 * inside the run's paying transaction, after claimRun and before the ledger is filed, so the ledger records what the run
 * was actually paid and a rolled-back run releases its claim with it.
 *
 * ECONOMY-SESSIONS-HARDEN follow-up (owner decisions 2026-09-28): music HAS a rules row now (modeScoreRules.ts
 * derivedBounds: the int4 column limit; its per-set bound stays sessionScoreCap → above_run_cap), so a music run inside
 * its rules DOES reach this read and the three rules above are what hold an Arena set. A mode with no row is recorded
 * unpaid (NO_RULES) and returns before the paying transaction, so it never makes the pay-once claim.
 */
interface ArenaMusicVerdict { matchId: string; rejudged: number }
async function verifiedMusicDuel(userId: string, arenaMatchId: unknown): Promise<ArenaMusicVerdict | null> {
  if (typeof arenaMatchId !== 'string' || !arenaMatchId || arenaMatchId.length > 64) return null;
  try {
    const m = await (prisma as any).competitionMatch.findUnique({
      where: { id: arenaMatchId },
      select: { id: true, mode: true, status: true, currency: true, player1Id: true, player2Id: true, player1Score: true, player2Score: true, expiresAt: true },
    });
    if (!m || canonicalModeKey(m.mode) !== 'music' || m.currency !== 'LC' || !OPEN_MATCH_STATES.includes(m.status)) return null;
    // MUSIC-SUITE P6 (2026-09-26, owner decision #30): past expiresAt the Arena takes no score for it (submit-score 409
    // EXPIRED; the reclaim sweep, lib/arena-reclaim.ts, refunds it or settles it by forfeit) — so, like a WAITING duel with
    // no opponent, its player1Score/player2Score never fills and it would uncap set after set. Expired is free play.
    if (isExpired(m.expiresAt, new Date())) return null;
    // only a duel /api/arena/submit-score will record this set's score in: it refuses a duel with no opponent yet (409
    // WAITING_OPPONENT) before it writes anything, so a WAITING duel's score never went in and every set against it was
    // uncapped, set after set (review of the shell's arenaMatchId, 2026-09-26)
    if (!m.player2Id) return null;
    if (m.player1Id !== userId && m.player2Id !== userId) return null;
    if ((m.player1Id === userId ? m.player1Score : m.player2Score) != null) return null;
    // MUSIC-SUITE P6 FIX PASS: a finished attempt, and its rejudge is the most this set is paid on
    const id = String(m.id ?? arenaMatchId);
    const attempt = await readMusicAttempt(prisma as never, id, userId);
    if (!attempt.finish) return null;
    const v = musicAttemptScore(id, attempt);
    if (!v.ok) return null;
    // (the pay-once claim is made under the duel's lock in the session transaction; this is only the early no)
    const paid = await (prisma as any).matchEvent.findFirst({ where: { matchId: id, userId, eventType: MUSIC_SESSION_PAID }, select: { id: true } });
    if (paid) return null;
    return { matchId: id, rejudged: v.score };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode ?? '');
    const opponentScore = Math.max(0, Math.floor(Number(body?.opponentScore ?? 0)));
    const claimedWon = Boolean(body?.won);
    // ECONOMY-SESSIONS-HARDEN (2026-09-28): the client's `score` is checked AS SENT (lib/sessions/modeScoreRules.ts) and
    // its `duration` is not believed at all — a run's duration is the server's, now − the run's startedAt, below. The
    // client's duration is kept only as the length a Studio creation save reports (telemetry; a creation pays nothing).
    const clientDuration = Math.max(0, Math.floor(Number(body?.duration ?? 0)));

    // Optional standardized fun-loop tallies (M6). Absent for legacy clients — all default to 0.
    const { hits, misses, dodges, combos, maxCombo } = sanitizeTallies(body);

    if (!mode) return NextResponse.json({ error: 'mode required' }, { status: 400 });

    // MUSIC-SUITE P2 (2026-09-25): the room's own end-of-session stats (GameResult.stats — the SHARED CONTRACT in
    // lib/session-payout.ts). `won` is the server's verdict from here on: a music set is won only at accuracy >= 0.5 over
    // >= 8 bars read from its counts (owner decision #13; it was `score > 0`, so one tap paid the +15 LC below), and every
    // other mode keeps its claim. The same `won` reaches the row, the wallet's won earn (it reads the row), season XP and
    // mastery, so no reader pays a win this route refused.
    const stats = roomStats(body);
    const rulesMode = canonicalModeKey(mode);

    // MUSIC-SUITE P3 (2026-09-25): a CREATION session — a Studio save or render (mode music, score 0, metadata.kind
    // 'creation'; lib/session-payout.ts isCreationSession). Before this, sessionHasPlay() below refused it as an idle run,
    // so STUDIO time never reached the streak (PLAN.md: "STUDIO time counts toward the streak ... no XP"). It is decided
    // HERE, before any of the play rules, and it touches exactly two profile fields: streakDays and lastStreakAt, and only
    // when the streak day is due (streakStep). No XP, no profile shards, no Lab Credits (not even the streak's: the day's
    // first PLAY pays those — streakStep's `owed`), never a win, no PRQ, no season XP, no mastery sample — and NO
    // GameSession row: every score reader of that table would misread a score-0 row (the Arena's rival draw reads the
    // player's last ten scores in the mode, app/api/arena/submit-score/route.ts:117-129; season XP's first-of-day bonus
    // counts the day's rows in the mode, season-service.ts:84-93; card stats count sessions; and the wallet's "Session
    // completed" coin earn pays for any row the player owns, wallet-service.ts:245-253).
    // sessionId is null for the same reason. lastActiveAt is left alone on purpose (streakStep's debt reads it).
    if (isCreationSession(rulesMode, Math.max(0, Math.floor(Number(body?.score ?? 0))), body)) {
      const profile = await getOrCreateProfile(userId);
      const before = prqScore(profile as any);
      const stamp = new Date();
      const step = streakStep(profile as any, stamp.getTime(), 'creation');
      let counted = false;
      if (step.due) {
        // conditional on the lastStreakAt this request read: a save and a render posted together count ONE streak day
        // (the loser matches no row and is a no-op like any other repeat)
        const seen = (profile as any)?.lastStreakAt;
        const r = await prisma.playerProfile.updateMany({
          where: { userId, ...(seen ? { lastStreakAt: seen } : {}) },
          data: { streakDays: step.streakDays, lastStreakAt: stamp },
        });
        counted = r.count > 0;
      }
      if (counted) await recordServerEvent({ name: 'session_creation', userId, props: { mode, duration: clientDuration, streakDays: step.streakDays } });
      const payout = sessionPayout({ score: 0, won: false, endless: true, durationSec: clientDuration, kind: 'creation' });
      // MUSIC-SUITE P3 FIX PASS (2026-09-25): a no-op says when the streak day opens, so the Academy asks again then
      // (it used to take any 200 as "counted" and stop for the local day — lib/babylon/music/studioStore.ts CreationLog)
      const nextDue = creationNextDueAt(profile as any, stamp.getTime(), { counted, due: step.due });
      return NextResponse.json({
        ok: true, creation: true, counted, noOp: !counted, nextDueAt: nextDue === null ? null : new Date(nextDue).toISOString(), sessionId: null,
        won: false, capped: false, xp: payout.xp, shards: payout.shards, credits: payout.winCredits,
        streakDays: counted ? step.streakDays : (profile as any)?.streakDays ?? 0, streakBonus: 0,
        prqDelta: 0, prqBefore: before, prqAfter: before, grade: prqGrade(before),
        labCredits: (profile as any)?.labCredits ?? 0, season: null, mastery: null,
      });
    }

    // ECONOMY-SESSIONS-HARDEN (2026-09-28): EVERY PLAY SESSION FINISHES A RUN THE SERVER STARTED (POST /api/sessions/start).
    // Before this, the route paid whatever score and duration a POST carried, and a retried POST paid again: each one
    // wrote a new GameSession, so even the wallet keys built from its id were new. Now the body must name its runId —
    // this user's, still open, the same mode — and the run is finished exactly once: a second finish (a retry, a second
    // tab) gets the first one's answer back with replayed: true and pays nothing. A missing, foreign or closed run pays
    // nothing; an expired one is RUN_EXPIRED.
    const runId = readRunId(body?.runId);
    if (!runId) return send(await refuse(userId, mode, 'RUN_MISSING', 400));
    const run = await findRun(prisma, runId);
    if (!run || run.userId !== userId) return send(await refuse(userId, mode, 'RUN_UNKNOWN', 404));
    if (run.status !== RUN_STATUS.open) {
      const stored = storedResult(run);
      if (stored) return send(replayOf(stored));
      // swept to expired before anyone finished it (lib/sessions/sessionRuns.ts startRun)
      return send({ status: 422, body: { ok: false, paid: false, replayed: true, reason: run.status === RUN_STATUS.expired ? 'RUN_EXPIRED' : 'RUN_CLOSED', runId } });
    }
    if (canonicalModeKey(mode) !== run.mode) return send(await refuse(userId, mode, 'RUN_MODE_MISMATCH', 422, { runMode: run.mode }, { id: run.id, close: 'rejected' }));
    const now = new Date();
    if (now.getTime() > run.expiresAt.getTime()) return send(await refuse(userId, mode, 'RUN_EXPIRED', 422, {}, { id: run.id, close: 'expired' }));
    const durationMs = Math.max(0, now.getTime() - run.startedAt.getTime());
    const duration = Math.floor(durationMs / 1000);
    // FIX 1: the mode's rules (MODE_SCORE_RULES) — a finite integer >= 0, within maxScore and maxScorePerSecond, a
    // duration inside the believable window, a known and enabled mode. Broken = SCORE_INVALID: rejected, never clamped.
    const check = checkRunScore({ mode: run.mode, score: body?.score, durationMs });
    // OWNER DECISION (2026-09-28, after land): a catalogue mode with no rules row yet is RECORDED unpaid (NO_RULES), not
    // refused — refused, it also skipped the shell's Arena submit, carnival relay and challenge join (they follow only an
    // ok answer). It still has to be a storable whole number, and it still meets its own per-run cap below.
    const unruled = !check.ok && check.detail === 'no_rules' ? checkUnruledScore(body?.score) : null;
    if (!check.ok && !unruled?.ok) {
      const bad = unruled && !unruled.ok ? unruled : check;
      const rawScore = typeof body?.score === 'number' && Number.isInteger(body.score) ? body.score : null;
      return send(await refuse(userId, mode, bad.reason, 422, { detail: bad.detail, limit: bad.limit }, { id: run.id, close: 'rejected', score: rawScore, durationMs }));
    }
    const score = check.ok ? check.score : (unruled as { ok: true; score: number }).score;
    const noRules = !check.ok;
    // OWNER DECISION: a floor-only mode (Prove It) pays as a score of 0 and no win — the played floor — and keeps its
    // validated score on the history row (modeScoreRules.ts payFloorOnly)
    const floorOnly = check.ok && check.rule.payFloorOnly === true;

    // MUSIC-SUITE P2 FIX PASS (2026-09-25): until the shell forwards `stats` (ROOM_STATS_FORWARDED, a held file), a
    // session without them is an old-contract client and keeps its own music win (the room applies the rule itself) —
    // this refused every honest win while the card said "set won". A mode the catalogue does not know wins nothing.
    const won = floorOnly ? false : sessionWon(rulesMode, claimedWon, stats, duration, { score });
    if (claimedWon && !won && !floorOnly) {
      const read = readMusicSet(stats, duration);
      console.info('session win refused:', mode, !isCatalogueMode(mode) ? 'not a catalogue mode' : read ? `accuracy ${read.accuracy.toFixed(3)} over ${read.bars} bars${read.issues.length ? ` (${read.issues.slice(0, 3).join('; ')})` : ''}` : 'no set counts');
    }

    // Movement play (phase 10): the body's form read, optional. Bounded here — finite, inside what a body produces,
    // a height that agrees with its flight (g·t²/8), capped attempts — and a broken one is dropped, never the session.
    const { form, issues: formIssues } = boundFormSummary(body?.form, { mode });
    if (formIssues.length) console.warn('form read bounded:', formIssues.slice(0, 5).join('; '));
    // TEEN-WRITE-BLOCK (FE PM 23:05 PT): the form write is movement data (verified 18+ AND opted in); asked once, outside the run's transaction.
    const formAllowed = form ? await canSaveScanNumbers(prisma, userId) : false;

    const profile = await getOrCreateProfile(userId);
    const before = prqScore(profile as any);

    // FEATURES-UX-SHOP (2026-09-08): a run with no evidence of play (no points, no win, no tally, no combo, and the shell saw
    // no input) is a mode left idle until its own clock ended it. It records no session and grants nothing — no XP, no
    // profile shards, no streak credits, no PRQ, no season XP, no mastery sample — and returns sessionId null so the shell's
    // "Session completed" coin earn has nothing to key on (lib/session-evidence.ts has the measured drift).
    // a form read with anything read in it is the body having played (phase 3: body input counts as play), so a body
    // run that scored 0 still keeps its reads ("every form read is saved to history")
    // ECONOMY-SESSIONS-HARDEN: the run closes as 'recorded' with this answer, so a retry gets the same NO PLAY back.
    if (!sessionHasPlay({ score, won, hits, misses, dodges, combos, maxCombo, played: body?.played === true || formHasReads(form) })) {
      await recordServerEvent({ name: 'session_noplay', userId, props: { mode, duration } });
      return send(await closeRun(prisma, run.id, {
        status: RUN_STATUS.recorded, score, durationMs, now,
        result: { status: 200, body: {
          ok: true, noPlay: true, paid: false, replayed: false, reason: 'NO_PLAY', runId: run.id, sessionId: null,
          xp: 0, shards: 0, credits: 0, coins: 0, streakDays: profile?.streakDays ?? 0, streakBonus: 0,
          prqDelta: 0, prqBefore: before, prqAfter: before, grade: prqGrade(before),
          labCredits: (profile as any)?.labCredits ?? 0, season: null, mastery: null,
        } },
      }));
    }

    // MUSIC-SUITE P2 FIX PASS: an Arena music set is one whose match this route has found (arenaMatchId), never the claim.
    // MUSIC-SUITE P6 FIX PASS: …with a finished attempt, capped at its rejudge, paid once per duel (verifiedMusicDuel).
    // (Read with the SERVER's duration: readMusicSet's arena claim is judged on the run's own clock.)
    const arena = rulesMode === 'music' && !!readMusicSet(stats, duration)?.arena
      ? await verifiedMusicDuel(userId, body?.arenaMatchId) : null;
    // MUSIC-SUITE P2 FIX PASS: a score no honest run can reach — above a music set's own hits, above a finite rules game's
    // derived maximum (arena-score-integrity). Real play is never above it. ECONOMY-SESSIONS-HARDEN (2026-09-28): such a
    // score is REJECTED as SCORE_INVALID now; it used to be clamped to the cap and paid as the most one can.
    // (A verified Arena set is held to the Arena's music ceiling as well — the tighter of the two caps.)
    const cap = sessionScoreCap(rulesMode, stats, duration, { arenaVerified: arena !== null });
    if (cap !== null && score > cap) {
      return send(await refuse(userId, mode, 'SCORE_INVALID', 422, { detail: 'above_run_cap', limit: cap }, { id: run.id, close: 'rejected', score, durationMs }));
    }
    // MUSIC-SUITE P6 FIX PASS, inside the hardening (merge 2026-09-28): a verified Arena set is paid on no more than the
    // server's REJUDGE of its recorded taps, never the posted number. The room posts exactly that number (StudioMode.tsx
    // sendArenaFinishRef: the score the Arena has on file), so a score above it is no honest set — SCORE_INVALID
    // above_rejudge, rejected like every other impossible score (P6 clamped it to the rejudge and paid; the hardening clamps
    // nothing). Rejected here, before any write, the duel's one Arena pay is not claimed: the honest post still gets it.
    if (arena && score > arena.rejudged) {
      return send(await refuse(userId, mode, 'SCORE_INVALID', 422, { detail: 'above_rejudge', limit: arena.rejudged }, { id: run.id, close: 'rejected', score, durationMs }));
    }
    const paidScore = score;
    const payScore = floorOnly ? 0 : paidScore;   // what the payout formulas read (the row keeps paidScore)

    // FIX 3: a run that does not pay (AGENT / PLAYTEST / TEST_ACCOUNT — decided at start, stored on the run, never re-read
    // from this request) is validated above like any other and RECORDED on its run with its score, and nothing else: no
    // GameSession row (the card, the share funnel, the Arena's rival draw and season XP all read those), no XP, shards,
    // Lab Credits, wallet coins, PRQ, streak, season XP or mastery, and no ledger row. (MUSIC-SUITE P6: nor does it make an
    // Arena music duel's pay-once claim — that is made only in the paying transaction below — so an agent or playtest run
    // of a staked set never spends the player's one Arena pay for that duel.)
    // OWNER DECISION: a mode with no rules row yet (NO_RULES) is recorded the same way — and, returning here, it never
    // reaches the paying transaction either, so it never makes the pay-once claim (verifiedMusicDuel above only reads).
    if (!run.payoutEligible || noRules || run.agentRun) {
      const reason = run.agentRun ? 'AGENT' : !run.payoutEligible ? run.ineligibleReason ?? 'UNPAID' : 'NO_RULES';
      await recordServerEvent({ name: 'session_unpaid', userId, props: { mode, score, won, duration, reason } });
      return send(await closeRun(prisma, run.id, {
        status: RUN_STATUS.recorded, score, durationMs, now,
        result: { status: 200, body: {
          ok: true, paid: false, replayed: false, reason, runId: run.id, sessionId: null,
          score, won, capped: false, xp: 0, shards: 0, credits: 0, coins: 0, streakDays: profile?.streakDays ?? 0, streakBonus: 0,
          prqDelta: 0, prqBefore: before, prqAfter: before, grade: prqGrade(before),
          labCredits: (profile as any)?.labCredits ?? 0, season: null, mastery: null,
        } },
      }));
    }

    // Credits: hero-mode win +15 LC, daily streak +5*day (cap day 7).
    // MUSIC-SUITE P3 (2026-09-25): the streak rule moved to lib/session-payout.ts streakStep, unchanged — plus `owed`: the
    // first play inside a streak day a creation session opened pays that day's streak LC (the creation paid none), so
    // making music first never costs a player the day's streak Lab Credits. lastStreakAt and lastActiveAt are written
    // from ONE stamp below — streakStep's debt test (lastActiveAt < lastStreakAt) relies on a play never leaving them apart.
    const stamp = new Date();
    const streak = streakStep(profile as any, stamp.getTime(), 'play');
    const { streakDays, streakBonus } = streak;
    const attrs = MODE_ATTRS?.[rulesMode] ?? ['mental'];

    // MUSIC-SUITE P6 FIX PASS: the payout is planned both ways — as a verified Arena set and as free play — and the session
    // transaction takes the Arena plan only if it wins the pay-once claim (a second post for the duel is free play).
    // (Merge with ECONOMY-SESSIONS-HARDEN: both plans pay the validated score as sent. It already passed the mode's rules,
    // the run cap and — for an Arena set — the rejudge above, and the free-play cap is never below the Arena one, so a plan
    // clamps nothing; they differ only in the endless ceiling and what that makes of XP, shards and PRQ.)
    // (OWNER DECISION 2026-09-28: the formulas read payScore — a floor-only run's 0, the played floor — while the history
    // row, the run and the Arena rejudge keep paidScore.)
    const planFor = (arenaVerified: boolean) => {
      // MUSIC-SUITE P2: dance and music train by the run's ACCURACY (lib/prq.ts ACCURACY_PRQ_MODES), read from their counts
      // (P2 FIX PASS: and by the old score path while the shell sends no counts at all — ROOM_STATS_FORWARDED).
      const prqDelta = computePrqDelta({
        mode: rulesMode, score: payScore, won, duration, accuracy: sessionAccuracy(rulesMode, stats, duration),
        whenNoAccuracy: !stats && !ROOM_STATS_FORWARDED ? 'score' : 'none',
      });
      // MUSIC-SUITE P2: XP = 1.5 × score and shards = score / 20 had no ceiling, and an endless run (music free play, The
      // Hundred — lib/session-payout.ts ENDLESS_MODES) paid ~51M XP for a perfect 5-minute set. An endless run now pays at
      // most what a flawless finite game does (ENDLESS_SESSION_CEILING); every game with an end of its own is paid as before.
      // (P2 FIX PASS: prorated by the session's length, so back-to-back 5 s sets no longer pay ~12× the ceiling's minute.)
      const endless = isEndlessSession(rulesMode, stats, duration, { arenaVerified });
      // (FOLLOW-UP 2026-09-29: skateboarding and surfing are paid at most what 4 × their best run seen would pay —
      // session-payout finitePayCapScore; the score itself is recorded as sent)
      const payout = sessionPayout({ score: payScore, won, endless, durationSec: duration, payCapScore: finitePayCapScore(rulesMode) });
      // Distribute PRQ delta to mode-relevant attributes
      const attrData: Record<string, any> = {};
      for (const a of attrs) {
        const cur = Number((profile as any)?.[a] ?? 0);
        attrData[a] = Math.min(100, Math.round((cur + prqDelta) * 100) / 100);
      }
      return { prqDelta, payout, xp: payout.xp, shards: payout.shards, credits: payout.winCredits + streakBonus, attrData };
    };
    type Plan = ReturnType<typeof planFor>;
    const freePlan: Plan = planFor(false);
    const arenaPlan: Plan | null = arena ? planFor(true) : null;   // the transaction settles on one (the claim decides)

    // ECONOMY-SESSIONS-HARDEN (2026-09-28): the wallet's session earns — the completed coins and, on the server's win, the
    // won shards — are paid HERE, inside the run's transaction, priced by the same reward rules and caps
    // (wallet-service.sessionWalletGrant). The shell used to report them to POST /v1/wallet/earn under keys built from
    // the new GameSession id, so a retried session paid them again; that route now refuses both events. Dunk keeps the
    // shell's old exception (its host reports richer per-attempt earns).
    // A floor-only run (Prove It, owner decision) pays neither: the played floor is XP, a shard and the streak day.
    const walletCoins = mode !== 'dunk' && !floorOnly;

    const at = new Date();
    let committed: { payload: Record<string, unknown>; season: Awaited<ReturnType<typeof addSeasonXp>>; mastery: Awaited<ReturnType<typeof recordMastery>> | null; plan: Plan };
    try {
      committed = await prisma.$transaction(async (tx) => {
        // 1. Claim the run: 'open' → 'paid', conditional. A second finish of this run waits here and matches nothing.
        await claimRun(tx, run.id, { score: paidScore, durationMs, now });
        // 1b. MUSIC-SUITE P6 FIX PASS: an Arena set's ONE uncapped pay per player per duel, claimed under the duel's row lock
        //    (claimMusicSessionPay: a MUSIC_SESSION_PAID event) — the Arena plan only for the session that makes the claim;
        //    one that finds it made (a second post for the duel, the loser of a race past the early check) is free play.
        //    After the run's claim and before the ledger, so the ledger files what this run is actually paid, and inside
        //    the run's transaction, so a run that rolls back (a replay, a ledger conflict) releases the duel's claim with it.
        const plan: Plan = arena && arenaPlan && (await claimMusicSessionPay(tx as never, arena.matchId, userId)) ? arenaPlan : freePlan;
        let { payout, xp, shards, credits, attrData } = plan;
        let economyCapNote: string | null = null;
        try {
          // SECURITY (ECONOMY-CAPS review, daily-cap TOCTOU): lock the user's PlayerProfile row before summing
          // today's earnings, so two concurrent finishes of the same user on different runs cannot both read the
          // same stale sum and each collect the full remaining headroom. The second finish's sum now waits on the
          // first's commit. The lock is released with the transaction.
          await lockPlayerForDailyCap(tx, userId);
          const earnedToday = await sumEarnedToday(tx, userId, now);
          const caps = applyEconomyCaps({ xp, shards }, earnedToday);
          xp = caps.xp;
          shards = caps.shards;
          if (caps.dailyXpCapHit) economyCapNote = dailyCapMessage('xp', now);
          else if (caps.dailyShardCapHit) economyCapNote = dailyCapMessage('shards', now);
          if (caps.perRunCapped || caps.xpCapped || caps.shardsCapped) payout = { ...payout, capped: true };
        } catch (capErr) {
          console.warn('[sessions] CAP_CHECK_FAILED', 'user', userId, 'run', run.id, (capErr as Error)?.message ?? capErr);
          xp = 0;
          shards = 0;
        }
        // 2. The ledger, before any balance moves (FIX 2): one row per payout, unique on (user, run, grant). The wallet
        //    and season amounts are decided further down (their caps, the first-of-day bonus) and settled into their rows.
        // PRQ delta filed after profile attrs are known (below); placeholder 0 here.
        await fileGrants(tx, {
          userId, runId: run.id,
          amounts: {
            xp, shards, prq: 0,
            ...(floorOnly ? {} : { season_xp: 0, mastery: 1 }),
            ...(credits > 0 ? { wallet_lc: credits } : {}),
            ...(walletCoins ? { wallet_coins: 0 } : {}),
            ...(walletCoins && won ? { wallet_shards: 0 } : {}),
          },
        });
        // MUSIC-SUITE P6 × the ledger: the xp row of the run that took the duel's Arena pay names the duel and the rejudge
        // it was held to, so the ledger alone says which run was paid as the Arena set (the claim is the MatchEvent)
        if (arena && plan === arenaPlan) {
          await settleGrant(tx, { userId, runId: run.id, grantType: 'xp', amount: xp, metadata: { arenaSet: true, arenaMatchId: arena.matchId, rejudged: arena.rejudged } });
        }

        // labCredits/xp/shards are pure counters — atomic increments so two
        // concurrent session submissions can't both read the same stale value
        // and drop one grant (the lost-update race a literal computed write allows).
        const updated = await tx.playerProfile.update({
          where: { userId },
          data: {
            ...attrData,
            xp: { increment: xp },
            shards: { increment: shards },
            streakDays,
            lastStreakAt: streak.due ? stamp : profile?.lastStreakAt,
            lastActiveAt: stamp,
          },
        });
        const prqDeltaRounded = Math.round((prqScore(updated as any) - before) * 100) / 100;
        await settleGrant(tx, { userId, runId: run.id, grantType: 'prq', amount: prqDeltaRounded });
        const createdSession = await tx.gameSession.create({
          data: { userId, mode, score: paidScore, opponentScore, won, xp, shards, prqDelta: prqDeltaRounded, credits, duration, hits, misses, dodges, combos, maxCombo, runId: run.id },
        });
        // LC lives in the wallet (2026-09-04): the session's credits move through the one mover, keyed by the RUN.
        let newBalance = Number(updated.labCredits ?? 0);
        if (credits > 0) {
          const r = await applyLc(tx, { playerId: userId, delta: credits, reasonCode: 'SESSION_CREDITS', source: 'gameplay', idempotencyKey: sessionLcKey(run.id), metadata: { mode, won, runId: run.id, streakDays, streakBonus: !!streakBonus, ...(streak.owed ? { streakOwed: true } : {}) } });
          newBalance = r.balanceAfter;
        }
        // the wallet's session earns, keyed by the run (see walletCoins above)
        let coins = 0, walletShards = 0, coinsCapped = false;
        if (walletCoins) {
          const c = await sessionWalletGrant(tx, { playerId: userId, reasonCode: REASON.MODE_SESSION_COMPLETED, payload: { mode, run_id: run.id, score: paidScore }, idempotencyKey: runWalletKey(run.id, 'coins'), metadata: { eventType: 'mode_session_completed', runId: run.id, mode } });
          coins = c.granted; coinsCapped = c.capped;
          await settleGrant(tx, { userId, runId: run.id, grantType: 'wallet_coins', amount: c.granted, metadata: { capped: c.capped, entryId: c.entryId } });
          if (won) {
            const w = await sessionWalletGrant(tx, { playerId: userId, reasonCode: REASON.MODE_SESSION_WON, payload: { mode, run_id: run.id }, idempotencyKey: runWalletKey(run.id, 'won'), metadata: { eventType: 'mode_session_won', runId: run.id, mode } });
            walletShards = w.granted;
            await settleGrant(tx, { userId, runId: run.id, grantType: 'wallet_shards', amount: w.granted, metadata: { capped: w.capped, entryId: w.entryId } });
          }
        }
        // The form read is planned FIRST (pure: planFormWrite), stamped at the session's one moment `at`.
        // REVIEW (2026-09-24, D2): ONE POWER READING. The game's power counter and a camera jump are on different scales
        // and every latest-wins reader takes the newest row, so a measured jump replaces the session's drillResult power
        // row rather than sitting 1 ms after it, and once a camera reading is on file no game session writes drillResult
        // power again (formSummary.gameRowAttrs has the numbers).
        const sid = (createdSession as any)?.id;
        // TEEN-WRITE-BLOCK (FE PM 23:05 PT): refused → no plan, so no form rows and no camera PRQ; the rest settles as a no-form session.
        const formPlan = form && sid && formAllowed ? planFormWrite(form, { userId, sessionId: sid, measuredAt: at }) : null;

        // Task 3: emit drillResult PrqEntries for mode-relevant attributes.
        // prqDelta is the per-attribute gain; source = drillResult, linked to this session.
        if (prqDeltaRounded > 0) {
          const measuredNow = !!formPlan?.power;
          // asked only when it decides something: the mode trains power and this session measured no jump
          const onFile = !measuredNow && (attrs as readonly string[]).includes(CAMERA_POWER_ATTR)
            ? (await tx.prqEntry.findFirst({
                where: { userId, attribute: CAMERA_POWER_ATTR, source: PRQ_CAMERA_SOURCE },
                select: { id: true },
              })) !== null
            : false;
          for (const attr of gameRowAttrs(attrs, { measuredNow, onFile })) {
            const newVal = Number((updated as any)?.[attr] ?? 0);
            await createPrqEntry(tx, {
              userId,
              attribute: attr as any,
              value: Math.round(newVal * 100) / 100,
              unit: 'score',
              source: 'drillResult',
              measuredAt: at,
              sessionId: sid ?? null,
            }).catch((err: any) => {
              console.warn('PrqEntry drillResult write skipped:', err?.message);
            });
          }
        }

        // The form read: every attempt to history, and the best measured jump to PRQ power as a camera estimate, at
        // the same moment as the rows above (one session, one snapshot).
        let formWrite: FormWriteResult | null = null;
        if (formPlan) formWrite = await writeFormPlan(tx, formPlan);

        // --- M13: season pass + mastery. ECONOMY-SESSIONS-HARDEN: inside the run's transaction now, each filed in the
        // ledger above, so a retried run adds neither twice (they ran after the commit, unkeyed). Tier rewards and the
        // announcements go out after the commit (bookSeasonTierUps / emitMasteryUps). ---
        // (a floor-only run adds neither — the owner's played floor is XP, a shard and the streak day)
        const season = floorOnly ? null : await addSeasonXp({ userId, mode, score: paidScore, won }, { db: tx, deferTierRewards: true });
        if (!floorOnly) await settleGrant(tx, { userId, runId: run.id, grantType: 'season_xp', amount: season?.gained ?? 0, ...(season ? {} : { metadata: { noActiveSeason: true } }) });
        const mastery = floorOnly ? null : await recordMastery(userId, { mode, score: paidScore, won, hits, misses, maxCombo }, { db: tx, emit: false });

        const after = prqScore(updated as any);
        const payload: Record<string, unknown> = {
          ok: true,
          paid: true,
          replayed: false,
          runId: run.id,
          sessionId: sid ?? null,
          // MUSIC-SUITE P2: the server's verdict (a music set's win is decided here), and whether the endless ceiling applied
          won,
          capped: payout.capped,
          ...(economyCapNote ? { capMessage: economyCapNote } : {}),
          xp,
          shards,
          credits,
          // the wallet coins (and won shards) this run paid — the only coin figure the end card shows
          coins,
          coinsCapped,
          walletShards,
          streakDays,
          streakBonus,
          prqDelta: prqDeltaRounded,
          prqBefore: before,
          prqAfter: after,
          grade: prqGrade(after),
          labCredits: (updated as any).labCredits,
          season: season
            ? {
                name: season.season.name,
                gained: season.gained,
                tier: season.tier,
                into: season.into,
                need: season.need,
                hasPro: season.hasPro,
                tierUps: season.events.map((e) => ({ tier: e.tier, rewards: e.rewards })),
              }
            : null,
          mastery: mastery
            ? { mode: mastery.mode, tier: mastery.tier, tierIndex: mastery.tierIndex, ups: mastery.events }
            : null,
          // null when no form was sent; `power` is the camera ESTIMATE (the end card says so), null when no jump was measured
          // TEEN-WRITE-BLOCK (FE PM 23:05 PT): a refused form says so (saved: false, reason); nothing of it was written
          form: !form ? null
            : formAllowed ? { attempts: form.attempts.length, stored: formWrite?.stored ?? 0, power: formWrite?.power ?? null, dropped: formIssues.length }
            : { attempts: form.attempts.length, stored: 0, power: null, dropped: formIssues.length, saved: false, reason: SCAN_SAVE_REFUSED.error },
        };
        // 3. The answer is stored with the payout it describes, so a retry after the commit always gets it back.
        await storePaidResult(tx, run.id, { result: { status: 200, body: payload }, sessionId: sid ?? null });
        return { payload, season, mastery, plan };
      }, { maxWait: 10_000, timeout: 30_000 });
    } catch (e) {
      // a second finish of the same run (RunClosedError after the first committed), or any unique-key conflict on its
      // ledger: nothing of this request was applied — answer with what the first finish stored
      if (e instanceof RunClosedError || (e as { code?: string })?.code === 'P2002') {
        const stored = storedResult(await findRun(prisma, run.id));
        if (stored) return send(replayOf(stored));
        return NextResponse.json({ ok: false, paid: false, replayed: true, reason: 'RUN_IN_FLIGHT', runId: run.id }, { status: 409 });
      }
      throw e;
    }

    // MUSIC-SUITE P2: the endless ceiling, said in the log — for the plan the transaction settled on (MUSIC-SUITE P6 FIX
    // PASS: an Arena plan that lost the pay-once claim was paid as free play)
    {
      const { payout, xp, shards } = committed.plan;
      if (payout.capped && finitePayCapScore(rulesMode) !== null) console.info('session payout capped (finite pay cap):', mode, `score ${paidScore} → ${xp} XP / ${shards} shards (paid as at most ${finitePayCapScore(rulesMode)})`);
      else if (payout.capped) console.info('session payout capped (endless):', mode, `score ${paidScore} over ${duration} s → ${xp} XP / ${shards} shards (ceiling ${ENDLESS_SESSION_CEILING.xp} / ${ENDLESS_SESSION_CEILING.shards} a minute)`);
    }

    // after the commit: idempotent tier rewards, announcements, telemetry (best-effort — the run is paid either way)
    try {
      if (committed.season) await bookSeasonTierUps(userId, mode, committed.season);
    } catch (err) {
      console.warn('season tier rewards skipped:', (err as any)?.message);
    }
    try {
      if (committed.mastery) await emitMasteryUps(userId, committed.mastery);
    } catch (err) {
      console.warn('mastery events skipped:', (err as any)?.message);
    }

    // Telemetry: one row per completed session drives DAU / retention rollups.
    await recordServerEvent({
      name: 'session_complete',
      userId,
      props: { mode, score: paidScore, won, duration },
    });

    return NextResponse.json(committed.payload);
  } catch (e) {
    console.error('session error', e);
    return NextResponse.json({ error: 'Failed to record session' }, { status: 500 });
  }
}
