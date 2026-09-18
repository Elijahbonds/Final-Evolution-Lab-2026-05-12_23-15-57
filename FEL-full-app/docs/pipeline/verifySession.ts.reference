// verifySession — the decision the server does not currently make.
//
// WHAT THE SERVER RECEIVES TODAY, captured from the deployed build (M100):
//
//   POST /api/sessions        {"mode":"dunkContest","score":25,"won":false,"duration":40}
//   POST /api/v1/wallet/earn  {"payload":{"score":25}}   ->  granted 53 coins
//
// **There is no replay, no seed, and no hash.** The server is not failing to
// verify — it has nothing to verify against. A client states a number and
// currency is minted from it.
//
// M91 built `verifyMatch`. M94 made `dunk` simulatable. M101 measured that the
// DEPLOYED dunk makes no gameplay random calls, so it is the one mode that
// could actually be re-simulated. This is the missing piece between them: what
// a submission must carry, and what the server decides when it does not.
//
// THE POLICY, AND WHY "UNVERIFIED" IS NOT "REJECTED"
// A submission with no replay is not evidence of cheating — the overwhelming
// majority are an old client, a dropped connection, or a mode that has not been
// migrated yet. Treating them as fraud would ban most of the player base.
// Treating them as verified is what happens now.
//
// So there are three outcomes, not two. Unverified sessions keep their XP and
// their progress and are **not eligible for cash**. That distinction is the
// whole design: it lets verification roll out one mode at a time without
// taking anything away from anyone.
//
// RUN THIS ON NODE, IMPORTING THE SAME FILES THE CLIENT BUNDLES.
// Not a port. M91 recorded why: this project has already paid four times for
// re-implementing a rule in a second language — PRQ tables drifting up to 57%
// between Swift and Python, MRI existing in Python with no producer, DDA
// stranded in Swift. A ported simulation would be that same failure with money
// attached.

import { parseReplay, type ReplayData } from '../core/Replay';
import { verifyMatch, type SimulatableMode } from '../core/HeadlessSim';

/** What a client must send for a match to be checkable. */
export interface SessionSubmission {
  modeId: string;
  claimedScore: number;
  /** Serialised `ReplayData`. Absent on every submission the app makes today. */
  replay?: string;
  /** Mode config the run was played under — PRQ strictness, assist window. */
  config?: Record<string, number>;
  /** Seconds of wall time the client claims. Sanity only; never trusted. */
  duration?: number;
}

export type Eligibility =
  /** Re-simulated and matched. Cash may be paid. */
  | 'verified'
  /** Nothing to check against. Progress is kept; cash is not paid. */
  | 'unverified'
  /** Checked and contradicted. Pay nothing and record it. */
  | 'rejected';

export interface Decision {
  eligibility: Eligibility;
  /** The score the SERVER computed. Never the claimed one, when it has a choice. */
  awardedScore: number;
  reason: string;
  /** Tick where the replay diverged, when it did. */
  divergedAt?: number | null;
  elapsedMs: number;
}

/**
 * How far above a mode's ceiling a claim may sit before it is refused outright.
 *
 * Exactly 1.0 would reject a legitimate perfect game on a rounding difference.
 * Anything much above it makes the ceiling decorative.
 */
export const CLAIM_TOLERANCE = 1.02;

export interface VerifyOptions<S> {
  mode: SimulatableMode<S>;
  /** The mode's maximum plausible score — M100's `scoreScale`. */
  ceiling?: number;
  /** Refuse replays longer than this. A cheap denial-of-service guard. */
  maxTicks?: number;
}

export const DEFAULT_MAX_TICKS = 60 * 60 * 30;   // thirty minutes at 60Hz

/**
 * Decide what a session has earned.
 *
 * Pure and synchronous: no database, no clock, no network. Everything it needs
 * is in the submission, which is what makes it testable and what makes it
 * runnable in a queue worker rather than in the request path.
 */
export function verifySession<S>(
  sub: SessionSubmission,
  opts: VerifyOptions<S>,
): Decision {
  const started = Date.now();
  const done = (d: Omit<Decision, 'elapsedMs'>): Decision =>
    ({ ...d, elapsedMs: Date.now() - started });

  if (!Number.isFinite(sub.claimedScore) || sub.claimedScore < 0) {
    return done({
      eligibility: 'rejected', awardedScore: 0,
      reason: 'claimed score is not a non-negative number',
    });
  }

  // The ceiling is checked BEFORE re-simulation, because it is free and it is
  // the only guard that applies to the unverified majority. Without it, an
  // unverified submission of 999999 keeps its "progress" — and progress is XP,
  // shards and season tier, which are worth real money in this economy.
  if (opts.ceiling !== undefined && sub.claimedScore > opts.ceiling * CLAIM_TOLERANCE) {
    return done({
      eligibility: 'rejected', awardedScore: 0,
      reason: `claimed ${sub.claimedScore} against a ceiling of ${opts.ceiling} for ${sub.modeId}`,
    });
  }

  if (!sub.replay) {
    // Today's shape. Keep the progress, refuse the cash, say which it was.
    return done({
      eligibility: 'unverified', awardedScore: sub.claimedScore,
      reason: 'no replay was submitted — progress kept, not eligible for cash',
    });
  }

  const replay = parseReplay(sub.replay);
  if (!replay) {
    return done({
      eligibility: 'rejected', awardedScore: 0,
      reason: 'replay did not parse',
    });
  }
  if (replay.header.modeId !== sub.modeId) {
    return done({
      eligibility: 'rejected', awardedScore: 0,
      reason: `replay is for "${replay.header.modeId}" but the session claims "${sub.modeId}"`,
    });
  }
  const maxTicks = opts.maxTicks ?? DEFAULT_MAX_TICKS;
  if (replay.header.totalTicks > maxTicks) {
    return done({
      eligibility: 'rejected', awardedScore: 0,
      reason: `replay is ${replay.header.totalTicks} ticks, above the ${maxTicks} limit`,
    });
  }

  const v = verifyMatch(opts.mode, replay, sub.claimedScore, sub.config ?? {});
  if (!v.verified) {
    return done({
      eligibility: 'rejected', awardedScore: 0,
      divergedAt: v.divergedAt,
      reason: v.reason,
    });
  }

  // The SERVER's score, not the client's. They agree here by definition — but
  // taking the server's is what makes that true rather than assumed, and it is
  // one line.
  return done({
    eligibility: 'verified', awardedScore: v.serverScore,
    divergedAt: null,
    reason: `re-simulated ${replay.header.totalTicks} ticks and matched`,
  });
}

/** Cash may only be paid on a verified session. Stated once, so it is testable. */
export function cashPayable(d: Decision): boolean {
  return d.eligibility === 'verified';
}

/**
 * Progress — XP, shards, season tier — survives an unverified session.
 *
 * A rejected one earns nothing: it was checked and contradicted, or it claimed
 * something impossible.
 */
export function progressPayable(d: Decision): boolean {
  return d.eligibility !== 'rejected';
}
