/**
 * scripts/irl-session-tests.ts
 * ============================
 * M9 Step 18 verification harness for the IRL session core (IrlSessionCore)
 * and the IRL Dunk skin.
 *
 * Deterministic checks (no RNG; timestamps via an injected fake clock):
 *   - Mirror Triumph rules match the app's /api/mirror-triumph route EXACTLY:
 *       first play sets best (streak 0); beating the ghost bumps streak +
 *       longest + totalBeats; failing to beat resets the streak to 0
 *   - phase walk: idle -> run -> result on a single run
 *   - couch H2H: alternates players, resolves the highest score as winner;
 *       a tie yields the tuning's tieGoesTo (null draw here)
 *   - review bridge: buildSubmission() returns null until submissionConfigured,
 *       then a METADATA-ONLY payload (mode/score/beatBest/players/winner/ts)
 *   - determinism: same inputs + same clock => identical Mirror state
 *
 * Run: yarn tsx scripts/irl-session-tests.ts
 */

import assert from 'node:assert';
import { IrlSessionCore } from '../lib/feel/cores/irl-session-core';
import { makeIrlDunkSkin, makeIrlDunkSession, IRL_DUNK_MODE } from '../lib/feel/cores/irl-dunk-skin';

/** Widening helper — keep phase comparisons from narrowing across mutations. */
function phaseOf(c: IrlSessionCore): string {
  return c.phase as string;
}

/** Monotonic fake clock (ms) for reproducible timestamps. */
function fakeClock(start = 1_000): () => number {
  let t = start;
  return () => (t += 1000);
}

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log('  ✓ ' + name);
}

// 1. Mirror Triumph: first play sets best, streak 0
check('first run sets best score with streak 0 (firstPlay)', () => {
  const c = makeIrlDunkSession({ now: fakeClock() });
  assert.strictEqual(phaseOf(c), 'idle');
  c.beginRun();
  assert.strictEqual(phaseOf(c), 'run');
  const r = c.submitRun(50);
  assert.strictEqual(r.firstPlay, true, 'firstPlay flagged');
  assert.strictEqual(r.beatBest, false, 'no ghost to beat on first play');
  assert.strictEqual(c.state.mirror.bestScore, 50, 'best = first score');
  assert.strictEqual(c.state.mirror.currentStreak, 0, 'streak 0 on first play');
  assert.strictEqual(phaseOf(c), 'result');
});

// 2. Beating the ghost bumps streak/longest/totalBeats
check('beating the ghost bumps streak, longest, and totalBeats', () => {
  const c = makeIrlDunkSession({ now: fakeClock() });
  c.beginRun();
  c.submitRun(50); // first
  c.beginRun();
  const r1 = c.submitRun(70); // beat
  assert.strictEqual(r1.beatBest, true);
  assert.strictEqual(c.state.mirror.bestScore, 70);
  assert.strictEqual(c.state.mirror.currentStreak, 1);
  assert.strictEqual(c.state.mirror.longestStreak, 1);
  assert.strictEqual(c.state.mirror.totalBeats, 1);
  c.beginRun();
  const r2 = c.submitRun(90); // beat again
  assert.strictEqual(r2.beatBest, true);
  assert.strictEqual(c.state.mirror.currentStreak, 2);
  assert.strictEqual(c.state.mirror.longestStreak, 2);
  assert.strictEqual(c.state.mirror.totalBeats, 2);
  assert.ok(c.state.mirror.lastBeatAt !== null, 'lastBeatAt stamped');
});

// 3. Failing to beat resets the streak (best unchanged)
check('failing to beat the ghost resets the streak, keeps best', () => {
  const c = makeIrlDunkSession({ now: fakeClock() });
  c.beginRun(); c.submitRun(50);
  c.beginRun(); c.submitRun(70); // streak 1
  assert.strictEqual(c.state.mirror.currentStreak, 1);
  c.beginRun();
  const r = c.submitRun(60); // does NOT beat 70
  assert.strictEqual(r.beatBest, false);
  assert.strictEqual(c.state.mirror.bestScore, 70, 'best unchanged');
  assert.strictEqual(c.state.mirror.currentStreak, 0, 'streak reset');
  assert.strictEqual(c.state.mirror.longestStreak, 1, 'longest preserved');
});

// 4. Couch H2H resolves the highest score
check('couch H2H alternates players and crowns the top score', () => {
  const c = makeIrlDunkSession({ now: fakeClock() });
  assert.ok(c.beginH2H(2), 'H2H started');
  assert.strictEqual(phaseOf(c), 'h2h');
  c.submitH2HScore(40); // player 0
  assert.strictEqual(phaseOf(c), 'h2h', 'still going after p0');
  c.submitH2HScore(75); // player 1
  assert.strictEqual(phaseOf(c), 'complete', 'resolved after all players');
  assert.strictEqual(c.state.h2h.winner, 1, 'higher score wins');
});

// 5. H2H tie yields the tuning's tieGoesTo (null draw)
check('a tied couch H2H is a draw (tieGoesTo=null)', () => {
  const c = makeIrlDunkSession({ now: fakeClock() });
  c.beginH2H(2);
  c.submitH2HScore(60);
  c.submitH2HScore(60);
  assert.strictEqual(c.state.h2h.winner, null, 'tie is a draw');
});

// 6. Review bridge gating + metadata-only payload
check('review bridge is null until configured, then metadata-only', () => {
  const off = makeIrlDunkSession({ now: fakeClock() });
  off.beginRun(); off.submitRun(50);
  assert.strictEqual(off.buildSubmission(), null, 'no payload when unconfigured');

  const on = makeIrlDunkSession({ submissionConfigured: true, now: fakeClock() });
  on.beginRun(); on.submitRun(50);
  on.beginRun(); const r = on.submitRun(80); // beat -> beatBest true
  assert.strictEqual(r.beatBest, true);
  const payload = on.buildSubmission();
  assert.ok(payload, 'payload built when configured');
  assert.strictEqual(payload!.mode, IRL_DUNK_MODE, 'mode key carried');
  assert.strictEqual(payload!.score, 80, 'score carried');
  assert.strictEqual(payload!.beatBest, true, 'beatBest carried');
  assert.strictEqual(payload!.players, 1, 'single-player run');
  // metadata only: exactly these keys, no media/PII
  assert.deepStrictEqual(
    Object.keys(payload!).sort(),
    ['beatBest', 'h2hWinner', 'mode', 'players', 'score', 'ts'],
    'payload is metadata-only',
  );
});

// 7. H2H submission carries the winner's score + player count
check('review bridge after H2H carries winner score and player count', () => {
  const c = makeIrlDunkSession({ submissionConfigured: true, now: fakeClock() });
  c.beginH2H(3);
  c.submitH2HScore(30);
  c.submitH2HScore(90); // winner
  c.submitH2HScore(55);
  const payload = c.buildSubmission();
  assert.ok(payload);
  assert.strictEqual(payload!.h2hWinner, 1, 'winner index');
  assert.strictEqual(payload!.score, 90, 'winner score');
  assert.strictEqual(payload!.players, 3, 'three couch players');
});

// 8. Determinism: same inputs + same clock => identical Mirror state
check('same inputs and clock yield identical Mirror state', () => {
  function run(): string {
    const c = new IrlSessionCore(makeIrlDunkSkin(), { now: fakeClock() });
    const scores = [40, 55, 55, 80, 20, 95];
    for (const s of scores) {
      c.beginRun();
      c.submitRun(s);
    }
    return JSON.stringify(c.state.mirror);
  }
  assert.strictEqual(run(), run(), 'deterministic Mirror state');
});

console.log(`\nirl-session: ${passed}/${passed} checks passed`);
