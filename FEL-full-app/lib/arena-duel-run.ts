// ARENA-SETTLE-SERVER (QA top-5 #1, 2026-10-15): an Arena duel settles only on a score the server recorded.
//
// /api/arena/submit-score took `{ matchId, score }` from the body and, for every mode but music, only checked that the
// number was a whole number under the mode's ceiling: a player could POST the ceiling without playing and take the
// opponent's stake. A duel score must now be the score of ONE server run (SessionRun, started by /api/sessions/start and
// finished by /api/sessions, which times it and checks it against the mode's rules) that:
//   · belongs to the caller, in the duel's mode,
//   · was finished (paid or recorded) with a score,
//   · started after the duel was created (a run played before the duel existed is not a run FOR it),
//   · has not already been submitted to another duel (its runId rides in the SCORE_SUBMITTED event),
// and the posted score must equal that run's score. Nothing here writes (it only locks the run row); a refusal is thrown before the route writes.
// No schema change: the run is read from SessionRun as it is, and the binding is the MatchEvent payload that already exists.
import { arenaModeKey } from '@/lib/arena';
import { RUN_STATUS } from '@/lib/sessions/sessionRuns';
import { runTierOf, STAKED_TIER } from '@/lib/sessions/runTier';

export type DuelRunVerdict =
  | { ok: true; runId: string; score: number }
  | { ok: false; code: 'NO_RUN' | 'RUN_NOT_YOURS' | 'RUN_NOT_FINISHED' | 'RUN_WRONG_MODE' | 'RUN_BEFORE_DUEL' | 'RUN_ALREADY_USED' | 'SCORE_MISMATCH' | 'RUN_NOT_STAKED'; detail: string; status: number };

const FINISHED: readonly string[] = [RUN_STATUS.paid, RUN_STATUS.recorded];

export async function readDuelRun(
  tx: any,
  a: { runId: unknown; userId: string; match: { id: string; mode: string; createdAt?: Date | string | null }; postedScore: number },
): Promise<DuelRunVerdict> {
  const runId = typeof a.runId === 'string' && a.runId.length > 0 && a.runId.length <= 64 ? a.runId : null;
  if (!runId) return { ok: false, code: 'NO_RUN', detail: 'A duel score has to come from a run you played: play the duel from its link and it submits itself.', status: 409 };
  // The run row is locked for the rest of the settle transaction (SELECT … FOR UPDATE): a second submit of the same run,
  // to another duel at the same instant, waits here until this one commits, and then its "already used" read below sees
  // this one's SCORE_SUBMITTED. Without the lock both reads ran before either write and one run paid two duels.
  await tx.$queryRaw`SELECT id FROM "SessionRun" WHERE id = ${runId} FOR UPDATE`;
  const run = await tx.sessionRun.findUnique({ where: { id: runId } });
  if (!run) return { ok: false, code: 'NO_RUN', detail: 'That run was not found.', status: 409 };
  if (run.userId !== a.userId) return { ok: false, code: 'RUN_NOT_YOURS', detail: 'That run is not yours.', status: 403 };
  if (arenaModeKey(run.mode) !== arenaModeKey(a.match.mode)) {
    return { ok: false, code: 'RUN_WRONG_MODE', detail: 'That run was played in a different mode from this duel.', status: 422 };
  }
  // TIER-SERVER: a duel settles only on a run the server started as a head-to-head, at the staked tier (its own copy)
  const t = runTierOf(run);
  if (!t.staked || t.tier !== STAKED_TIER) {
    return { ok: false, code: 'RUN_NOT_STAKED', detail: 'That run was not started as a duel run at the duel tier (PRO).', status: 422 };
  }
  if (!FINISHED.includes(run.status) || !Number.isInteger(run.score)) {
    return { ok: false, code: 'RUN_NOT_FINISHED', detail: 'That run has not been finished and recorded yet.', status: 409 };
  }
  const opened = a.match.createdAt ? new Date(a.match.createdAt).getTime() : NaN;
  const started = new Date(run.startedAt).getTime();
  if (Number.isFinite(opened) && !(started >= opened)) {
    return { ok: false, code: 'RUN_BEFORE_DUEL', detail: 'That run was played before this duel was opened.', status: 422 };
  }
  const used = await tx.matchEvent.findFirst({
    where: { userId: a.userId, eventType: 'SCORE_SUBMITTED', matchId: { not: a.match.id }, payload: { contains: `"runId":${JSON.stringify(runId)}` } },
  });
  if (used) return { ok: false, code: 'RUN_ALREADY_USED', detail: 'That run already counted in another duel.', status: 409 };
  if (run.score !== a.postedScore) {
    return { ok: false, code: 'SCORE_MISMATCH', detail: `The score sent (${a.postedScore}) is not the score the run recorded (${run.score}).`, status: 422 };
  }
  return { ok: true, runId, score: run.score };
}
