import { NextResponse } from 'next/server';
import { applyLc } from '@/lib/wallet/wallet-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/profile-service';
import { computePrqDelta, MODE_ATTRS, PRQ_CAMERA_SOURCE, prqScore, prqGrade } from '@/lib/prq';
import { sanitizeTallies } from '@/lib/game-systems';
import { createPrqEntry } from '@/lib/prq-entries';
import { addSeasonXp } from '@/lib/season/season-service';
import { recordMastery } from '@/lib/mastery/mastery-service';
import { recordServerEvent } from '@/lib/analytics-server';
import { sessionHasPlay } from '@/lib/session-evidence';
import { boundFormSummary, formHasReads, planFormWrite, gameRowAttrs, CAMERA_POWER_ATTR } from '@/lib/move/formSummary';
import { writeFormPlan, type FormWriteResult } from '@/lib/move/formWrite';
import {
  roomStats, sessionWon, sessionAccuracy, isEndlessSession, sessionPayout, readMusicSet, sessionScoreCap, isCatalogueMode,
  ENDLESS_SESSION_CEILING, ROOM_STATS_FORWARDED, isCreationSession, streakStep, creationNextDueAt,
} from '@/lib/session-payout';
import { canonicalModeKey } from '@/lib/game-data';
import { isExpired } from '@/lib/arena-reclaim';
import { readMusicAttempt, musicAttemptScore, claimMusicSessionPay, MUSIC_SESSION_PAID } from '@/lib/arena-music';

export const dynamic = 'force-dynamic';

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
    const score = Math.max(0, Math.floor(Number(body?.score ?? 0)));
    const opponentScore = Math.max(0, Math.floor(Number(body?.opponentScore ?? 0)));
    const claimedWon = Boolean(body?.won);
    const duration = Math.max(0, Math.floor(Number(body?.duration ?? 0)));

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
    if (isCreationSession(rulesMode, score, body)) {
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
      if (counted) await recordServerEvent({ name: 'session_creation', userId, props: { mode, duration, streakDays: step.streakDays } });
      const payout = sessionPayout({ score: 0, won: false, endless: true, durationSec: duration, kind: 'creation' });
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

    // MUSIC-SUITE P2 FIX PASS (2026-09-25): until the shell forwards `stats` (ROOM_STATS_FORWARDED, a held file), a
    // session without them is an old-contract client and keeps its own music win (the room applies the rule itself) —
    // this refused every honest win while the card said "set won". A mode the catalogue does not know wins nothing.
    const won = sessionWon(rulesMode, claimedWon, stats, duration, { score });
    if (claimedWon && !won) {
      const read = readMusicSet(stats, duration);
      console.info('session win refused:', mode, !isCatalogueMode(mode) ? 'not a catalogue mode' : read ? `accuracy ${read.accuracy.toFixed(3)} over ${read.bars} bars${read.issues.length ? ` (${read.issues.slice(0, 3).join('; ')})` : ''}` : 'no set counts');
    }

    // Movement play (phase 10): the body's form read, optional. Bounded here — finite, inside what a body produces,
    // a height that agrees with its flight (g·t²/8), capped attempts — and a broken one is dropped, never the session.
    const { form, issues: formIssues } = boundFormSummary(body?.form, { mode });
    if (formIssues.length) console.warn('form read bounded:', formIssues.slice(0, 5).join('; '));

    const profile = await getOrCreateProfile(userId);
    const before = prqScore(profile as any);

    // FEATURES-UX-SHOP (2026-09-08): a run with no evidence of play (no points, no win, no tally, no combo, and the shell saw
    // no input) is a mode left idle until its own clock ended it. It records no session and grants nothing — no XP, no
    // profile shards, no streak credits, no PRQ, no season XP, no mastery sample — and returns sessionId null so the shell's
    // "Session completed" coin earn has nothing to key on (lib/session-evidence.ts has the measured drift).
    // a form read with anything read in it is the body having played (phase 3: body input counts as play), so a body
    // run that scored 0 still keeps its reads ("every form read is saved to history")
    if (!sessionHasPlay({ score, won, hits, misses, dodges, combos, maxCombo, played: body?.played === true || formHasReads(form) })) {
      await recordServerEvent({ name: 'session_noplay', userId, props: { mode, duration } });
      return NextResponse.json({
        ok: true, noPlay: true, sessionId: null,
        xp: 0, shards: 0, credits: 0, streakDays: profile?.streakDays ?? 0, streakBonus: 0,
        prqDelta: 0, prqBefore: before, prqAfter: before, grade: prqGrade(before),
        labCredits: (profile as any)?.labCredits ?? 0, season: null, mastery: null,
      });
    }

    // MUSIC-SUITE P2 FIX PASS: an Arena music set is one whose match this route has found (arenaMatchId), never the claim.
    // MUSIC-SUITE P6 FIX PASS: …with a finished attempt, capped at its rejudge, paid once per duel (verifiedMusicDuel).
    const arena = rulesMode === 'music' && !!readMusicSet(stats, duration)?.arena
      ? await verifiedMusicDuel(userId, body?.arenaMatchId) : null;

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
    const planFor = (arenaVerified: boolean) => {
      // MUSIC-SUITE P2 FIX PASS: a score no honest run can reach is paid (and recorded) as the most one can — a music set by
      // its own hits, a finite rules game by its derived maximum (arena-score-integrity). Real play is never above it.
      // MUSIC-SUITE P6 FIX PASS: a verified Arena set, no more than the server's rejudge of its recorded taps.
      const own = sessionScoreCap(rulesMode, stats, duration, { arenaVerified });
      const cap = arenaVerified && arena ? Math.min(own ?? Infinity, arena.rejudged) : own;
      const paidScore = cap === null ? score : Math.min(score, cap);
      // MUSIC-SUITE P2: dance and music train by the run's ACCURACY (lib/prq.ts ACCURACY_PRQ_MODES), read from their counts
      // (P2 FIX PASS: and by the old score path while the shell sends no counts at all — ROOM_STATS_FORWARDED).
      const prqDelta = computePrqDelta({
        mode: rulesMode, score: paidScore, won, duration, accuracy: sessionAccuracy(rulesMode, stats, duration),
        whenNoAccuracy: !stats && !ROOM_STATS_FORWARDED ? 'score' : 'none',
      });
      // MUSIC-SUITE P2: XP = 1.5 × score and shards = score / 20 had no ceiling, and an endless run (music free play, The
      // Hundred — lib/session-payout.ts ENDLESS_MODES) paid ~51M XP for a perfect 5-minute set. An endless run now pays at
      // most what a flawless finite game does (ENDLESS_SESSION_CEILING); every game with an end of its own is paid as before.
      // (P2 FIX PASS: prorated by the session's length, so back-to-back 5 s sets no longer pay ~12× the ceiling's minute.)
      const endless = isEndlessSession(rulesMode, stats, duration, { arenaVerified });
      const payout = sessionPayout({ score: paidScore, won, endless, durationSec: duration });
      // Distribute PRQ delta to mode-relevant attributes
      const attrData: Record<string, any> = {};
      for (const a of attrs) {
        const cur = Number((profile as any)?.[a] ?? 0);
        attrData[a] = Math.min(100, Math.round((cur + prqDelta) * 100) / 100);
      }
      return { paidScore, prqDelta, payout, xp: payout.xp, shards: payout.shards, credits: payout.winCredits + streakBonus, attrData };
    };
    type Plan = ReturnType<typeof planFor>;
    const freePlan: Plan = planFor(false);
    const arenaPlan: Plan | null = arena ? planFor(true) : null;
    let plan: Plan = arenaPlan ?? freePlan;   // what the transaction settles on (the claim may take it back to free play)

    const at = new Date();
    const { updated, createdSession, formWrite } = await prisma.$transaction(async (tx) => {
      // MUSIC-SUITE P6 FIX PASS: the Arena plan only for the ONE session that claims the duel's pay (under its row lock)
      if (arena && arenaPlan) plan = (await claimMusicSessionPay(tx as never, arena.matchId, userId)) ? arenaPlan : freePlan;
      const { paidScore, prqDelta, xp, shards, credits, attrData } = plan;
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
      const createdSession = await tx.gameSession.create({
        data: { userId, mode, score: paidScore, opponentScore, won, xp, shards, prqDelta, credits, duration, hits, misses, dodges, combos, maxCombo },
      });
      // LC lives in the wallet (2026-09-04): the session's credits move through the one mover, keyed by the session row.
      let newBalance = Number(updated.labCredits ?? 0);
      if (credits > 0) {
        const r = await applyLc(tx, { playerId: userId, delta: credits, reasonCode: 'SESSION_CREDITS', source: 'gameplay', idempotencyKey: `session-lc:${(createdSession as any).id}`, metadata: { mode, won, streakDays, streakBonus: !!streakBonus, ...(streak.owed ? { streakOwed: true } : {}) } });
        newBalance = r.balanceAfter;
      }
      // The form read is planned FIRST (pure: planFormWrite), stamped at the session's one moment `at`.
      // REVIEW (2026-09-24, D2): ONE POWER READING. The game's power counter and a camera jump are on different scales
      // and every latest-wins reader takes the newest row, so a measured jump replaces the session's drillResult power
      // row rather than sitting 1 ms after it, and once a camera reading is on file no game session writes drillResult
      // power again (formSummary.gameRowAttrs has the numbers).
      const sid = (createdSession as any)?.id;
      const formPlan = form && sid ? planFormWrite(form, { userId, sessionId: sid, measuredAt: at }) : null;

      // Task 3: emit drillResult PrqEntries for mode-relevant attributes.
      // prqDelta is the per-attribute gain; source = drillResult, linked to this session.
      if (prqDelta > 0) {
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

      return { updated, createdSession, formWrite };
    });

    const after = prqScore(updated as any);
    // MUSIC-SUITE P6 FIX PASS: what the transaction settled on (an Arena plan that lost the pay-once claim is free play)
    const { paidScore, payout, xp, shards, credits } = plan;
    if (paidScore < score) console.info('session score bounded:', mode, `${score} → ${paidScore} (the most this run can score)`);
    if (payout.capped) console.info('session payout capped (endless):', mode, `score ${paidScore} over ${duration} s → ${xp} XP / ${shards} shards (ceiling ${ENDLESS_SESSION_CEILING.xp} / ${ENDLESS_SESSION_CEILING.shards} a minute)`);

    // --- M13: season pass + mastery are additive and best-effort. A failure
    // here must never break the core session write above (they run after the
    // transaction and swallow their own errors). Server owns all grants. ---
    let season: Awaited<ReturnType<typeof addSeasonXp>> = null;
    try {
      season = await addSeasonXp({ userId, mode, score: paidScore, won });
    } catch (err) {
      console.warn('season xp skipped:', (err as any)?.message);
    }

    let mastery: Awaited<ReturnType<typeof recordMastery>> | null = null;
    try {
      mastery = await recordMastery(userId, { mode, score: paidScore, won, hits, misses, maxCombo });
    } catch (err) {
      console.warn('mastery record skipped:', (err as any)?.message);
    }

    // Telemetry: one row per completed session drives DAU / retention rollups.
    await recordServerEvent({
      name: 'session_complete',
      userId,
      props: { mode, score: paidScore, won, duration },
    });

    return NextResponse.json({
      ok: true,
      sessionId: (createdSession as any)?.id ?? null,
      // MUSIC-SUITE P2: the server's verdict (a music set's win is decided here), and whether the endless ceiling applied
      won,
      capped: payout.capped,
      xp,
      shards,
      credits,
      streakDays,
      streakBonus,
      prqDelta: Math.round((after - before) * 100) / 100,
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
      form: form ? { attempts: form.attempts.length, stored: formWrite?.stored ?? 0, power: formWrite?.power ?? null, dropped: formIssues.length } : null,
    });
  } catch (e) {
    console.error('session error', e);
    return NextResponse.json({ error: 'Failed to record session' }, { status: 500 });
  }
}
