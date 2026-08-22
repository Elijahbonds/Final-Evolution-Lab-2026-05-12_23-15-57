/**
 * scripts/rally-outcome-tests.ts
 *
 * Headless invariants for lib/feel/rally-outcome.ts (Phase 8 / Handoff Part 7).
 * Run via: yarn tsx scripts/rally-outcome-tests.ts
 * Registered as a suite in scripts/standing-suite.ts.
 */

import {
  RALLY, classifyContact, resolveShot,
  GHOST_LEAD_S, ghostVisible, ghostOpacity, predictLandingX,
  GK_COMMIT_S, gkGuess, resolvePenalty, zoneToSide, gkLean,
  type ContactQuality, type Side,
} from '../lib/feel/rally-outcome';

let passed = 0;
let failed = 0;
const fails: string[] = [];

function ok(name: string, cond: boolean) {
  if (cond) { passed++; }
  else { failed++; fails.push(name); }
}
function approx(a: number, b: number, eps = 1e-6) { return Math.abs(a - b) <= eps; }

// ── Fix 1: classification ─────────────────────────────────────────────────
ok('perfect at 0ms', classifyContact(0) === 'perfect');
ok('perfect at +PERFECT_MS', classifyContact(RALLY.PERFECT_MS) === 'perfect');
ok('perfect symmetric (early side)', classifyContact(-RALLY.PERFECT_MS) === 'perfect');
ok('good just past perfect', classifyContact(RALLY.PERFECT_MS + 1) === 'good');
ok('good at GOOD_MS', classifyContact(RALLY.GOOD_MS) === 'good');
ok('early: swung early inside window', classifyContact(-(RALLY.GOOD_MS + 1)) === 'early');
ok('late: swung late inside window', classifyContact(RALLY.GOOD_MS + 1) === 'late');
ok('early at -WINDOW_MS', classifyContact(-RALLY.WINDOW_MS) === 'early');
ok('late at +WINDOW_MS', classifyContact(RALLY.WINDOW_MS) === 'late');
ok('miss just past window (late)', classifyContact(RALLY.WINDOW_MS + 1) === 'miss');
ok('miss just past window (early)', classifyContact(-(RALLY.WINDOW_MS + 1)) === 'miss');

// ── Fix 1: DISTINCT outcomes (the whole point — not binary) ───────────────
const qs: ContactQuality[] = ['perfect', 'good', 'early', 'late', 'miss'];
const outs = qs.map(resolveShot);
// every quality maps to itself
ok('resolveShot preserves quality', outs.every((o, i) => o.quality === qs[i]));
// labels all distinct
ok('all 5 labels distinct', new Set(outs.map((o) => o.label)).size === 5);
// perfect: fist-pump, strong, no net, no recovery, not lost
const P = resolveShot('perfect');
ok('perfect fistPump', P.fistPump && P.ballSpeedMult > 1 && !P.netBall && P.recoveryMs === 0 && !P.pointLost);
// early: lunge -> net + 1s recovery, no return
const E = resolveShot('early');
ok('early nets ball', E.netBall && E.ballSpeedMult === 0);
ok('early 1s recovery', E.recoveryMs === RALLY.EARLY_RECOVERY_MS && E.recoveryMs === 1000);
ok('early not fistPump/weak', !E.fistPump && !E.weak);
// late: weak floaty return, NO recovery penalty
const L = resolveShot('late');
ok('late weak', L.weak && L.ballSpeedMult > 0 && L.ballSpeedMult < 1);
ok('late no recovery penalty', L.recoveryMs === 0);
ok('late returns ball (not net, not lost)', !L.netBall && !L.pointLost);
// good: playable, no FX
const G = resolveShot('good');
ok('good neutral', G.ballSpeedMult === 1 && !G.fistPump && !G.weak && !G.netBall && !G.pointLost);
// miss: point lost, no return
const M = resolveShot('miss');
ok('miss point lost', M.pointLost && M.ballSpeedMult === 0);
// early vs late are genuinely different (the binary-killer invariant)
ok('early != late outcome', E.netBall !== L.netBall && E.recoveryMs !== L.recoveryMs);

// ── Fix 2: ghost landing marker ───────────────────────────────────────────
ok('ghost hidden when far', ghostVisible(GHOST_LEAD_S + 0.1) === false);
ok('ghost visible at lead edge', ghostVisible(GHOST_LEAD_S) === true);
ok('ghost visible mid-flight', ghostVisible(GHOST_LEAD_S / 2) === true);
ok('ghost hidden after landing', ghostVisible(0) === false);
ok('ghost hidden negative', ghostVisible(-0.2) === false);
ok('ghost opacity 0 when far', ghostOpacity(GHOST_LEAD_S) === 0);
ok('ghost opacity 1 at land', ghostOpacity(0) === 1);
ok('ghost opacity ramps', ghostOpacity(GHOST_LEAD_S / 2) > 0 && ghostOpacity(GHOST_LEAD_S / 2) < 1);
ok('ghost opacity monotonic', ghostOpacity(0.1) > ghostOpacity(0.3));

// predictLandingX: straight ball (no spin) — linear
// by=500 moving up (vy=-500) to targetY=60 over t=(60-500)/-500=0.88s; vx=100 -> x=bx+88
ok('predict straight', approx(predictLandingX(480, 500, 100, -500, 60, 0), 480 + 100 * ((60 - 500) / -500)));
ok('predict vy=0 -> bx', predictLandingX(300, 500, 100, 0, 60, 0) === 300);
ok('predict backward time -> bx', predictLandingX(300, 60, 100, -500, 500, 0) === 300);
// spin curves the landing spot away from the straight estimate
const straight = predictLandingX(480, 500, 100, -500, 60, 0);
const spun = predictLandingX(480, 500, 100, -500, 60, 2);
ok('spin bends landing', spun !== straight && spun > straight);

// ── Fix 4: goalkeeper dive commitment ─────────────────────────────────────
// reads the shot when roll < readChance
ok('gk reads shot', gkGuess(0.1, 0.4, 1, 0.9) === 1);
ok('gk reads shot left', gkGuess(0.1, 0.4, -1, 0.9) === -1);
// guesses random side when not reading
ok('gk random left', gkGuess(0.9, 0.4, 1, 0.2) === -1);
ok('gk random right', gkGuess(0.9, 0.4, 1, 0.8) === 1);
// never commits center even if actualSide is center
ok('gk never center', gkGuess(0.0, 1.0, 0, 0.8) === 1 || gkGuess(0.0, 1.0, 0, 0.2) === -1);
ok('gk read center falls through to random', gkGuess(0.0, 1.0, 0, 0.2) === -1);
// resolvePenalty: opposite -> goal, same -> save, no commit -> goal
ok('opposite side scores', resolvePenalty(-1, 1) === 'goal');
ok('same side saved', resolvePenalty(1, 1) === 'save');
ok('same side saved left', resolvePenalty(-1, -1) === 'save');
ok('no commit open net', resolvePenalty(1, 0) === 'goal');
// zoneToSide
ok('zone -2 -> left', zoneToSide(-2) === -1);
ok('zone -1 -> left', zoneToSide(-1) === -1);
ok('zone 0 -> center', zoneToSide(0) === 0);
ok('zone 2 -> right', zoneToSide(2) === 1);
// gkLean: 0 before commit, ramps after, visible before land
ok('gk no lean before commit', gkLean(GK_COMMIT_S) === 0);
ok('gk no lean at 0', gkLean(0) === 0);
ok('gk leans after commit', gkLean(GK_COMMIT_S + 0.2) > 0);
ok('gk full lean eventually', gkLean(GK_COMMIT_S + 1) === 1);
ok('gk lean monotonic', gkLean(GK_COMMIT_S + 0.1) < gkLean(GK_COMMIT_S + 0.3));
ok('gk commit is 0.3s', GK_COMMIT_S === 0.3);

// ── report ────────────────────────────────────────────────────────────────
const total = passed + failed;
if (failed === 0) {
  console.log(`\u2713 rally-outcome: all ${total} invariants passed`);
} else {
  console.error(`\u2717 rally-outcome: ${failed}/${total} FAILED`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
