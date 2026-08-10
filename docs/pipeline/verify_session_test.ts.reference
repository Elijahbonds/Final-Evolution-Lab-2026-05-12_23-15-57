// node --experimental-strip-types --import ./tools/ts_resolve.mjs \
//   --import ./tools/fel_batch_alias.mjs tests/verify_session_test.ts
//
// PHASE 9'S GATE: a real match, re-simulated and matched end to end.
//
// This plays an actual dunk contest through `DunkSim`, records it the way a
// client would, serialises it the way a request body would, parses it the way
// a server would, re-simulates it, and checks the answer. Then it tampers with
// each part in turn.
//
// It is the real sim. Not a fixture, not a mock — the same `DunkSim` M94
// migrated and M101 measured as the one deployed mode making no gameplay
// random calls.

import {
  verifySession, cashPayable, progressPayable, CLAIM_TOLERANCE,
  type SessionSubmission,
} from '../server/verifySession.ts';
import { DunkSim, DEFAULT_CONFIG } from '../../../m94-pass2-dunk-migration/files/modes/dunk/DunkSim.ts';
import { ReplayRecorder, serialiseReplay, IDLE_INTENT } from '../../../m83-determinism-and-ghosts/files/core/Replay.ts';
import { asRecorded } from '../../../m91-phase8-multiplayer/files/core/HeadlessSim.ts';
import { Rng } from '../../../m83-determinism-and-ghosts/files/core/Rng.ts';
import { FIXED_DT, stateHash } from '../../../m83-determinism-and-ghosts/files/core/FixedStep.ts';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n} ${x}`)); };

const SEED = 20260728;
const CEILING = 120;   // M100's scoreScale for dunkContest, exact from the rules

/**
 * Play a real contest and return what a client would submit.
 *
 * The intents are deliberately varied — charging, releasing, style taps, a rim
 * hang — so the replay is not a run of identical frames that would verify
 * trivially.
 */
function playAMatch(seed = SEED): { submission: SessionSubmission; realScore: number; ticks: number } {
  const rng = new Rng(seed);
  const rec = new ReplayRecorder(DunkSim.modeId, seed, 50, FIXED_DT);
  let state = DunkSim.init(new Rng(seed), {});
  let ticks = 0;
  // Per-tick fingerprints. A client that skips these produces a replay that
  // parses, re-simulates, and is then REFUSED for having no final hash — which
  // is exactly what M94's DunkMode did until this test caught it.
  let finalHash: number | undefined;

  for (let t = 0; t < 60 * 90 && !state.ended; t++) {
    const sec = t * FIXED_DT;
    const phase = Math.floor(sec) % 9;
    const intent = asRecorded({
      ...IDLE_INTENT,
      actionHeld: phase < 2 ? 0.9 : 0,
      action: phase === 2 || phase === 5,
      pass: phase === 3,
      steal: phase === 7,
    });
    rec.record(intent);
    state = DunkSim.tick(state, intent, rng, FIXED_DT);
    finalHash = stateHash(DunkSim.fingerprint(state));
    ticks++;
  }

  const data = rec.finish(DunkSim.score(state), state.outcome, finalHash);
  return {
    submission: {
      modeId: DunkSim.modeId,
      claimedScore: DunkSim.score(state),
      replay: serialiseReplay(data),
      duration: Math.round(ticks * FIXED_DT),
    },
    realScore: DunkSim.score(state),
    ticks,
  };
}

const OPTS = { mode: DunkSim, ceiling: CEILING };

// ══ THE GATE: A REAL MATCH, END TO END ═══════════════════════════════════
{
  const { submission, realScore, ticks } = playAMatch();
  ok('the match actually played to a conclusion', ticks > 60 && realScore > 0,
    `${ticks} ticks, score ${realScore}`);

  const d = verifySession(submission, OPTS);
  ok('PHASE 9 GATE: a real dunk match re-simulates and MATCHES', d.eligibility === 'verified',
    `${d.eligibility}: ${d.reason}`);
  ok('and the server awards its OWN score', d.awardedScore === realScore);
  ok('and cash is payable on it', cashPayable(d));
  ok('and the reason names how much was re-simulated', /re-simulated \d+ ticks/.test(d.reason));
  ok('and it is fast enough to run per session', d.elapsedMs < 2000, `${d.elapsedMs}ms`);
}

// ══ TODAY'S SUBMISSION SHAPE ═════════════════════════════════════════════
{
  // Verbatim from the deployed build: no replay, no seed, no hash.
  const today: SessionSubmission = { modeId: 'dunk', claimedScore: 25, duration: 40 };
  const d = verifySession(today, OPTS);

  ok('TODAY\'S PAYLOAD IS UNVERIFIED, not verified', d.eligibility === 'unverified');
  ok('and it is NOT eligible for cash — which is the change', !cashPayable(d));
  ok('but it KEEPS its progress, so rolling this out takes nothing away',
    progressPayable(d) && d.awardedScore === 25);
  ok('and the reason says which of the two it was',
    /no replay/.test(d.reason) && /not eligible for cash/.test(d.reason));
}

// ══ THE CEILING CATCHES WHAT NO REPLAY CAN ═══════════════════════════════
{
  // An unverified session still earns XP, shards and season tier — all worth
  // real money here. Without a ceiling, `score: 999999` keeps all of it.
  const inflated: SessionSubmission = { modeId: 'dunk', claimedScore: 999999 };
  const d = verifySession(inflated, OPTS);
  ok('AN IMPOSSIBLE CLAIM IS REJECTED EVEN WITH NO REPLAY TO CHECK',
    d.eligibility === 'rejected' && d.awardedScore === 0);
  ok('and it earns no progress either', !progressPayable(d));
  ok('and the reason names the ceiling', /ceiling of 120/.test(d.reason));

  ok('a perfect game is NOT rejected by the ceiling',
    verifySession({ modeId: 'dunk', claimedScore: 120 }, OPTS).eligibility === 'unverified');
  ok('and the tolerance leaves room for a rounding difference',
    verifySession({ modeId: 'dunk', claimedScore: 121 }, OPTS).eligibility === 'unverified'
    && CLAIM_TOLERANCE > 1);
  ok('a negative claim is rejected',
    verifySession({ modeId: 'dunk', claimedScore: -1 }, OPTS).eligibility === 'rejected');
  ok('and so is NaN', verifySession({ modeId: 'dunk', claimedScore: NaN }, OPTS).eligibility === 'rejected');
}

// ══ TAMPERING WITH A REAL REPLAY ═════════════════════════════════════════
{
  const { submission, realScore } = playAMatch();

  // Same replay, better score claimed.
  const inflated = { ...submission, claimedScore: realScore + 30 };
  const d1 = verifySession(inflated, OPTS);
  ok('THE SAME REPLAY WITH AN INFLATED SCORE IS REJECTED', d1.eligibility === 'rejected');
  ok('and the reason names the SCORE, not a desync',
    /score/i.test(d1.reason) && !/diverge/i.test(d1.reason), d1.reason);
  ok('and nothing is awarded', d1.awardedScore === 0 && !cashPayable(d1) && !progressPayable(d1));

  // A replay from a different mode.
  const wrongMode = { ...submission, modeId: 'karate' };
  ok('a replay for the wrong mode is rejected',
    verifySession(wrongMode, { ...OPTS, ceiling: 4000 }).eligibility === 'rejected');
  ok('and it says which two disagreed',
    /replay is for "dunk"/.test(verifySession(wrongMode, { ...OPTS, ceiling: 4000 }).reason));

  // Garbage in the replay field.
  ok('an unparseable replay is rejected',
    verifySession({ ...submission, replay: '{not json' }, OPTS).eligibility === 'rejected');

  // Length limit: a cheap guard before any simulation runs.
  const d2 = verifySession(submission, { ...OPTS, maxTicks: 10 });
  ok('an over-long replay is refused BEFORE it is simulated', d2.eligibility === 'rejected');
  ok('and it is refused on ticks, so the cost is bounded', /ticks, above the/.test(d2.reason));
  ok('and refusing costs almost nothing', d2.elapsedMs < 50, `${d2.elapsedMs}ms`);
}

// ══ TWO DIFFERENT MATCHES ════════════════════════════════════════════════
{
  // A verifier that passed everything would pass all of these too. Different
  // seeds must produce different, individually verifiable matches.
  const a = playAMatch(11111);
  const b = playAMatch(22222);
  ok('two seeds produce two different matches', a.realScore !== b.realScore
    || a.submission.replay !== b.submission.replay);
  ok('and BOTH verify on their own terms',
    verifySession(a.submission, OPTS).eligibility === 'verified'
    && verifySession(b.submission, OPTS).eligibility === 'verified');

  // The decisive negative: one match's replay with the other's score.
  const swapped = { ...a.submission, claimedScore: b.realScore };
  const d = verifySession(swapped, OPTS);
  ok('BUT A\'S REPLAY WITH B\'S SCORE IS REJECTED — unless they happened to tie',
    d.eligibility === 'rejected' || a.realScore === b.realScore,
    `${a.realScore} vs ${b.realScore}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
