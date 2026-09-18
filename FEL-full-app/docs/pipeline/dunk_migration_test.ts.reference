// node --experimental-strip-types --import ./tools/ts_resolve.mjs \
//   --import ./tools/fel_batch_alias.mjs tests/dunk_migration_test.ts
//
// Pass 2, Phase 1. The gate is not "does it work" — it is:
//
//   1. Does the ModeKit / SimulatableMode shape actually hold on a real mode?
//   2. Is scoring IDENTICAL to M63, so the migration changed structure and
//      nothing else?
//   3. Is it deterministic, so a dunk run can be verified for money?
//
// Question 2 matters more than it looks. A migration that also changes balance
// is two changes wearing one commit, and when the scores come out different
// nobody can tell which half did it.

import {
  DunkSim, initialState, DEFAULT_CONFIG, judgeDunk, cannedLine, freshnessFactor,
  attemptDifficulty, attemptExecution, attemptStyle, qteWindow, qteAccuracyAt,
  rivalScore, scoreNeeded, selectableDunks,
  JUDGES, STYLE_TIER, PROP_BONUS, CHAIN_THRESHOLD, DUNKS_PER_ROUND, TOTAL_ROUNDS,
  MAX_STYLE_TAPS, BUDGET_SEC,
  type DunkState, type DunkConfig,
} from '../modes/dunk/DunkSim.ts';
import { proveDeterministic, verifyMatch, asRecorded } from '../../../m91-phase8-multiplayer/files/core/HeadlessSim.ts';
import { Rng } from '../../../m83-determinism-and-ghosts/files/core/Rng.ts';
import { FIXED_DT, stateHash } from '../../../m83-determinism-and-ghosts/files/core/FixedStep.ts';
import { ReplayRecorder, IDLE_INTENT } from '../../../m83-determinism-and-ghosts/files/core/Replay.ts';
import { MIGRATION_MARKERS } from '../../../m84-phase1-integration-kit/files/core/ModeKit.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n} ${x}`)); };

type Intent = typeof IDLE_INTENT;
const intent = (o: Partial<Intent> = {}): Intent => ({ ...IDLE_INTENT, ...o });
const cfg = (o: Partial<DunkConfig> = {}): DunkConfig => ({ ...DEFAULT_CONFIG, ...o });

// ══ PARITY WITH M63 — the migration changed structure, not balance ═══════
ok('parity: three judges', JUDGES.length === 3);
ok('parity: Silk weights style highest', JUDGES[0].w.style === 0.5);
ok('parity: Doc weights execution highest', JUDGES[1].w.execution === 0.5);
ok('parity: Prime weights difficulty highest', JUDGES[2].w.difficulty === 0.5);
ok('parity: every judge\'s weights sum to 1',
  JUDGES.every((j) => Math.abs(j.w.difficulty + j.w.execution + j.w.style - 1) < 1e-9));
ok('parity: style tiers are 3 / 5.5 / 8',
  STYLE_TIER.power === 3 && STYLE_TIER.flashy === 5.5 && STYLE_TIER.sig === 8);
ok('parity: props are worth 2', PROP_BONUS.alleyoop === 2 && PROP_BONUS.obstacle === 2);
ok('parity: the chain threshold is 24', CHAIN_THRESHOLD === 24);
ok('parity: 2 dunks per round, 2 rounds', DUNKS_PER_ROUND === 2 && TOTAL_ROUNDS === 2);

{
  // The exact M63 formula, recomputed here independently.
  const m63 = (d: number, e: number, st: number) => JUDGES.map((j) => {
    const raw = d * j.w.difficulty + e * j.w.execution + st * j.w.style;
    return Math.max(6, Math.min(10, Math.round(6 + raw * 0.4)));
  });
  for (const [d, e, st] of [[8, 7, 6], [10, 10, 10], [0, 0, 0], [3, 9, 4], [5.5, 5.5, 5.5]] as const) {
    const mine = judgeDunk(d, e, st, 1).map((j) => j.score);
    ok(`PARITY: judging (${d},${e},${st}) matches M63 exactly`,
      mine.join() === m63(d, e, st).join(), `${mine.join()} vs ${m63(d, e, st).join()}`);
  }
  ok('parity: scores are always clamped to 6-10',
    judgeDunk(99, 99, 99, 1).every((j) => j.score === 10)
    && judgeDunk(-99, -99, -99, 1).every((j) => j.score === 6));
}
ok('parity: judge lines are the M63 lines', /THAT'S A TEN/.test(cannedLine('Silk', 10)));
ok('parity: repeating a combo costs 20% difficulty',
  freshnessFactor(['power_none'], 'power', 'none') === 0.8);
ok('parity: a fresh combo is full value',
  freshnessFactor(['power_none'], 'flashy', 'none') === 1);

// ── the ONE deliberate change: PRQ strictness ────────────────────────────
{
  const easy = judgeDunk(8, 8, 8, 1);
  const strict = judgeDunk(8, 8, 8, 1.4);
  ok('THE ONE ADDITION: a high-PRQ player faces stricter judges',
    strict.reduce((n, j) => n + j.score, 0) < easy.reduce((n, j) => n + j.score, 0));
  ok('and strictness at 1.0 is EXACTLY M63 — the default changes nothing',
    judgeDunk(8, 8, 8, 1).map((j) => j.score).join() === judgeDunk(8, 8, 8).map((j) => j.score).join());
  ok('the 6-10 band survives strictness',
    judgeDunk(10, 10, 10, 2).every((j) => j.score >= 6 && j.score <= 10));
}

// ══ THE REAL VERTICAL REACHES THE SCORE ══════════════════════════════════
{
  const elite = cfg({ profile: { heightCm: 196, verticalCm: 96, hangTimeMs: 820 } });
  const average = cfg({ profile: { heightCm: 178, verticalCm: 45, hangTimeMs: 420 } });
  const s: DunkState = { ...initialState(elite), style: 'sig', prop: 'obstacle', dunkId: 'dunk_windmill' };

  ok('M85 CONNECTED: the same windmill scores higher for a body that supports it',
    attemptDifficulty(s, elite) > attemptDifficulty(s, average),
    `${attemptDifficulty(s, elite).toFixed(2)} vs ${attemptDifficulty(s, average).toFixed(2)}`);
  ok('but an average player is not locked out — they still score',
    attemptDifficulty(s, average) > 0);
  ok('difficulty stays in 0-10', attemptDifficulty(s, elite) <= 10);
}
{
  const arcade = cfg({ gate: 'arcade', profile: { heightCm: 178, verticalCm: 45, hangTimeMs: 420 } });
  const strict = cfg({ gate: 'true', profile: { heightCm: 178, verticalCm: 45, hangTimeMs: 420 } });
  ok('arcade offers the whole library', selectableDunks(arcade).length > selectableDunks(strict).length);
  ok('and true vertical narrows it honestly', selectableDunks(strict).length > 0);
}

// ══ EXECUTION AND THE QTE ════════════════════════════════════════════════
{
  const base = initialState(cfg());
  ok('a perfect charge scores best',
    attemptExecution({ ...base, charge: 0.85 }) > attemptExecution({ ...base, charge: 0.2 }));
  ok('overcharging costs as much as undercharging',
    Math.abs(attemptExecution({ ...base, charge: 1.0 }) - attemptExecution({ ...base, charge: 0.7 })) < 1.5);
  ok('hitting the QTE matters',
    attemptExecution({ ...base, charge: 0.85, qteHit: true, qteAccuracy: 1 })
    > attemptExecution({ ...base, charge: 0.85 }));
  ok('rim hang adds', attemptExecution({ ...base, hangSec: 0.8 }) > attemptExecution({ ...base, hangSec: 0 }));
  ok('execution is bounded 0-10',
    attemptExecution({ ...base, charge: 0.85, qteHit: true, qteAccuracy: 1, hangSec: 5 }) <= 10);
}
{
  ok('the QTE window is centred', Math.abs((qteWindow(0).from + qteWindow(0).to) / 2 - 0.55) < 1e-9);
  ok('EACH STYLE TAP NARROWS IT 25% — the risk the phase exists to offer',
    qteWindow(1).to - qteWindow(1).from < qteWindow(0).to - qteWindow(0).from);
  ok('two taps narrow it further',
    qteWindow(2).to - qteWindow(2).from < qteWindow(1).to - qteWindow(1).from);
  ok('dead centre is full accuracy', Math.abs(qteAccuracyAt(0.55, 0) - 1) < 1e-9);
  ok('outside the window scores nothing', qteAccuracyAt(0.1, 0) === 0);
  ok('a tap that lands at 0 taps can MISS at 2 taps — the same input, a '
    + 'different decision', qteAccuracyAt(0.66, 0) > 0 && qteAccuracyAt(0.66, 2) === 0);
}

// ══ THE PHASE MACHINE ════════════════════════════════════════════════════
const run = (script: (t: number, s: DunkState) => Intent, ticks: number, c = cfg()) => {
  const rng = new Rng(4242);
  let s = initialState(c);
  const seen = new Set<string>();
  for (let t = 0; t < ticks; t++) {
    s = DunkSim.step(s, asRecorded(script(t, s)), rng, FIXED_DT, c);
    seen.add(s.phase);
  }
  return { state: s, phases: seen };
};
{
  const { state, phases } = run((t, s) => {
    if (s.phase === 'approach') return intent({ actionHeld: 1 });
    if (s.phase === 'charge') return t % 120 < 60 ? intent({ actionHeld: 1 }) : intent();
    if (s.phase === 'cinematic') return intent({ action: t % 7 === 0 });
    if (s.phase === 'resolve') return intent({ actionHeld: 1 });
    return intent();
  }, 60 * 90);

  ok('a full contest reaches every phase', phases.size >= 6, [...phases].join());
  ok('and ends', state.ended && state.phase === 'contestOver');
  ok('with an outcome', ['WIN', 'DRAW', 'LOSS'].includes(state.outcome));
  ok('the player scored', state.playerTotal > 0);
  ok('so did the rival', state.rivalTotal > 0);
  ok('and it ran the right number of rounds', state.round > TOTAL_ROUNDS);
}
{
  // Style taps are capped.
  const { state } = run((t, s) => (s.phase === 'cinematic' ? intent({ pass: true }) : intent({ actionHeld: 1 })), 60 * 20);
  ok('style taps are capped at 2', state.styleTaps <= MAX_STYLE_TAPS);
}
{
  const s = initialState(cfg());
  const cycled = DunkSim.step(s, intent({ pass: true }), new Rng(1), FIXED_DT, cfg());
  ok('style cycles in approach', cycled.style !== s.style);
  const propped = DunkSim.step(s, intent({ steal: true }), new Rng(1), FIXED_DT, cfg());
  ok('and so does the prop', propped.prop !== s.prop);
}
{
  const ended: DunkState = { ...initialState(cfg()), ended: true };
  ok('an ended contest ignores further input',
    DunkSim.step(ended, intent({ action: true }), new Rng(1), FIXED_DT, cfg()) === ended);
}
{
  const s: DunkState = { ...initialState(cfg()), round: TOTAL_ROUNDS, playerTotal: 40, rivalTotal: 52 };
  ok('THE NEED is shown when behind on the last round', scoreNeeded(s) === 13);
  ok('and not when ahead', scoreNeeded({ ...s, playerTotal: 99 }) === null);
  ok('nor in an early round', scoreNeeded({ ...s, round: 1 }) === null);
}

// ══ THE GATE: DETERMINISM ════════════════════════════════════════════════
{
  const script = (t: number, s: DunkState): Intent => {
    if (s.phase === 'approach') return intent({ actionHeld: 1 });
    if (s.phase === 'charge') return t % 100 < 55 ? intent({ actionHeld: 1 }) : intent();
    if (s.phase === 'cinematic') return intent({ action: t % 11 === 0, pass: t % 29 === 0 });
    return intent({ actionHeld: t % 3 === 0 ? 1 : 0 });
  };

  // Record a real run exactly as SimLoop would.
  const rng = new Rng(31337);
  const rec = new ReplayRecorder('dunk', 31337, 75, FIXED_DT);
  let s = DunkSim.init(new Rng(31337), {});
  const hashes: number[] = [];
  const TICKS = 60 * 80;
  for (let t = 0; t < TICKS; t++) {
    const i = asRecorded(script(t, s));
    rec.record(i);
    s = DunkSim.tick(s, i, rng, FIXED_DT);
    hashes.push(stateHash(DunkSim.fingerprint(s)));
  }
  const replay = rec.finish(DunkSim.score(s), s.outcome || 'WIN', hashes[hashes.length - 1]);

  const proof = proveDeterministic(DunkSim, replay, 3);
  ok('THE PASS-2 GATE: the dunk contest is DETERMINISTIC across runs',
    proof.deterministic, proof.message);
  ok('and it says how much it verified', /ticks/.test(proof.message));

  const v = verifyMatch(DunkSim, replay, DunkSim.score(s));
  ok('A REAL DUNK RUN VERIFIES SERVER-SIDE — the thing M90 and M91 were built '
    + 'for, on an actual mode', v.verified, v.reason);
  ok('fast enough to be affordable', v.elapsedMs < 1000, `${v.elapsedMs}ms`);

  const lie = verifyMatch(DunkSim, replay, DunkSim.score(s) + 40);
  ok('and an inflated score on the same replay is caught', !lie.verified);
  ok('with the reason naming the score, not a desync', /SCORE did not/.test(lie.reason));
}
{
  // The phase must be part of the fingerprint, or a desync is invisible.
  const a: DunkState = { ...initialState(cfg()), phase: 'charge' };
  const b: DunkState = { ...initialState(cfg()), phase: 'judging' };
  ok('PHASE IS FINGERPRINTED — two states can share every number and still be '
    + 'in different phases', stateHash(DunkSim.fingerprint(a)) !== stateHash(DunkSim.fingerprint(b)));
}
{
  // The rival must be seeded, not random. M63 used Math.random() here, which
  // is exactly why no dunk contest could ever be verified.
  const a = new Rng(7);
  const b = new Rng(7);
  ok('THE M63 FIX: the rival is seeded, so a contest replays identically',
    rivalScore(a, 0.6, 1) === rivalScore(b, 0.6, 1));
  ok('and a better rival scores higher on average', (() => {
    const r1 = new Rng(1); const r2 = new Rng(1);
    let weak = 0; let strong = 0;
    for (let i = 0; i < 200; i++) { weak += rivalScore(r1, 0.1, 1); strong += rivalScore(r2, 1, 1); }
    return strong > weak;
  })());
  ok('rival scores stay in a plausible 18-30 band', (() => {
    const r = new Rng(3);
    return Array.from({ length: 300 }, () => rivalScore(r, 0.6, 2)).every((v) => v >= 18 && v <= 30);
  })());
}

// ══ NO BABYLON, NO CLOCK, NO RANDOM ══════════════════════════════════════
{
  // The contract check. If any of these leak back in, everything above stops
  // being true — so this is asserted rather than trusted.
  ok('the sim declares the SimulatableMode shape',
    typeof DunkSim.init === 'function' && typeof DunkSim.tick === 'function'
    && typeof DunkSim.fingerprint === 'function' && typeof DunkSim.score === 'function');
  ok('and identifies itself as the dunk mode', DunkSim.modeId === 'dunk');
  ok('init is pure — two calls give the same state',
    JSON.stringify(DunkSim.init(new Rng(1), {})) === JSON.stringify(DunkSim.init(new Rng(2), {})));
  ok('config reaches the state', (() => {
    const s = DunkSim.init(new Rng(1), { verticalCm: 96, hangTimeMs: 820, heightCm: 196 });
    return s.dunkId.length > 0;
  })());
  ok('BUDGET_SEC covers every phase',
    (['approach', 'charge', 'cinematic', 'resolve', 'judging', 'rivalTurn', 'contestOver'] as const)
      .every((p) => BUDGET_SEC[p] > 0));
}

// ══ THE ASSIST REACHES THE MECHANIC ══════════════════════════════════════
{
  // Not "is the number bigger" — is a tap that MISSED now a hit. That is what
  // an accessibility setting is for, and a widening too small to change an
  // outcome is a setting that does nothing.
  const t = 0.55 + 0.14 * 0.75 * 0.75 * 1.4;   // just outside the 2-tap window
  ok('ASSIST: a tap that misses at scale 1 lands with the window widened',
    qteAccuracyAt(t, 2, 1) === 0 && qteAccuracyAt(t, 2, 1.8) > 0);
  ok('and the window stays CENTRED — the assist must not move where "on time" is',
    (() => { const w = qteWindow(1, 1.8); return Math.abs((w.from + w.to) / 2 - 0.55) < 1e-12; })());
  ok('a narrower scale is still possible, so this is a dial and not a freebie',
    qteAccuracyAt(0.55 + 0.13, 0, 1) > 0 && qteAccuracyAt(0.55 + 0.13, 0, 0.5) === 0);

  // The determinism half. `SimulatableMode.tick` takes no config, so a config
  // held anywhere but the state is invisible to a server re-simulating the run.
  const assisted = DunkSim.init(new Rng(7), { qteWindowScale: 1.8 });
  ok('CONFIG SURVIVES INTO THE STATE — a server re-simulating sees the assist',
    assisted.cfg.qteWindowScale === 1.8);
  ok('and tick() honours it rather than falling back to defaults', (() => {
    const air = { ...assisted, phase: 'cinematic' as const, phaseSec: BUDGET_SEC.cinematic * t, styleTaps: 2 };
    const hit = DunkSim.tick(air, intent({ action: true }), new Rng(7), FIXED_DT);
    const plain = DunkSim.tick({ ...air, cfg: { ...assisted.cfg, qteWindowScale: 1 } },
      intent({ action: true }), new Rng(7), FIXED_DT);
    return hit.qteHit && !plain.qteHit;
  })());
}

// ══ THE SPLIT ITSELF ═════════════════════════════════════════════════════
//
// `DunkMode.ts` imports Babylon, so it cannot be executed here. Its properties
// are asserted against its SOURCE instead — which is exactly what
// `tools/integration_audit.mjs` does against the deployed build, and it is the
// only kind of check available for the render half until the app source lands
// in this repo.
//
// Reading source is a weaker test than running code. It is not a weak test of
// THIS property: "the sim contains no Babylon, no clock and no Math.random" is
// a statement about the text of the file, and the text is what makes a match
// verifiable.
{
  const here = new URL('.', import.meta.url).pathname;
  const read = (p: string) => readFileSync(join(here, p), 'utf8');
  const sim = read('../modes/dunk/DunkSim.ts');
  const render = read('../modes/dunk/DunkMode.ts');
  // Both comment forms. The first run of this check failed on the sim's own
  // header — the line promising "no Math.random" read as a call to it.
  const code = (s: string) => s.split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/**'))
    .join('\n');

  // The boundary. Every one of these in the sim would make a dunk run
  // unverifiable, and none of them would fail a unit test.
  ok('THE BOUNDARY: the sim imports no Babylon', !code(sim).includes('@babylonjs'));
  ok('the sim calls no Math.random — M63 did, which is why no contest could be verified',
    !code(sim).includes('Math.random'));
  ok('the sim reads no wall clock',
    !code(sim).includes('Date.now') && !code(sim).includes('performance.now'));
  ok('the sim touches no DOM', !code(sim).includes('document.') && !code(sim).includes('window.'));
  ok('and the render half DOES import Babylon — otherwise nothing is drawn',
    code(render).includes('@babylonjs'));

  // M84's claim was a line count, so the line count is measured. The number
  // is read out of the file rather than imported, because importing it would
  // pull Babylon in — and taken from the file it also catches the mode
  // declaring one figure while carrying another.
  const ADOPTION_LINES = Number(render.match(/export const ADOPTION_LINES = (\d+)/)![1]);
  const markers = (render.match(/\[kit \d+\]/g) ?? []).length;
  ok(`THE M84 GATE: adopting ModeKit costs ${markers} lines, and M84 promised ~20`,
    markers === ADOPTION_LINES && markers <= 20, `${markers} markers vs ADOPTION_LINES ${ADOPTION_LINES}`);
  ok('the markers are numbered without gaps or repeats', (() => {
    const ns = (render.match(/\[kit (\d+)\]/g) ?? []).map((m) => Number(m.match(/\d+/)![0]));
    return ns.join() === Array.from({ length: ns.length }, (_, i) => i + 1).join();
  })());

  // M84 published five markers an integrated mode must show. This is the first
  // mode that has had to satisfy them, and one of the five turns out not to
  // apply: a dunk contest has no locomotion, so there is nothing for
  // `kit.move` to do. Calling it anyway to make a checklist go green is
  // precisely the `CameraStandoff` failure — a marker in the source doing
  // nothing — so the exemption is declared here, in the open, with a reason.
  const NOT_APPLICABLE: Record<string, string> = {
    'kit.move': 'the dunk contest has no locomotion; the approach phase selects a style',
  };
  for (const m of MIGRATION_MARKERS) {
    if (NOT_APPLICABLE[m]) {
      ok(`marker N/A and declared: ${m} — ${NOT_APPLICABLE[m]}`, !render.includes(`${m}(`));
    } else {
      ok(`migration marker present: ${m}`, render.includes(m));
    }
  }
  ok('THE M84 FINDING: MIGRATION_MARKERS is a flat list and needs per-mode applicability',
    Object.keys(NOT_APPLICABLE).length > 0);

  // The QTE is the one timing window in the mode, and it must reach the player
  // through PRQ and the assist — otherwise M82's accessibility work stops at
  // the mode boundary and an assist player gets the same 4-frame window.
  ok('the QTE window goes through kit.window(), not a raw constant',
    code(render).includes('kit.window(') && code(render).includes('qteWindowScale'));
  ok('and the DRAWN window uses the same scale the sim SCORES with',
    code(render).includes('qteWindow(state.styleTaps, cfg.qteWindowScale)'));

  // The bug this file was one edit away from shipping: stepping the sim from a
  // second `intent()` call while `SimLoop` records the first. Same shape as the
  // M91 quantisation bug — simulate one thing, record another.
  ok('THE M91 SHAPE: the tick steps from the SAME intent SimLoop records',
    code(render).includes('ticked = intent()') && code(render).includes('DunkSim.step(state, ticked'));

  // The render half must hold no rules. Any of these would mean balance lives
  // in two files and the parity tests above stop covering the real game.
  for (const rule of ['CHAIN_THRESHOLD =', 'w: {', '* 0.4', 'Math.max(6,']) {
    ok(`no scoring rule leaked into the render half: ${rule}`, !code(render).includes(rule));
  }

  // Legibility is a gate in M93: a mode with zero tells drawn is not shippable
  // however green its tests are.
  for (const t of ['dunk_tier_reach', 'prq_effect']) {
    ok(`tell drawn: ${t}`, code(render).includes(t));
  }

  // Both halves together against M63's 521 interleaved lines.
  const lines = (s: string) => s.split('\n').length;
  console.log(`\n  M63 DunkMode.ts .......... 521 lines, untestable`);
  console.log(`  DunkSim.ts ............... ${lines(sim)} lines, ${pass} assertions cover it`);
  console.log(`  DunkMode.ts .............. ${lines(render)} lines, render only`);
  console.log(`  total .................... ${lines(sim) + lines(render)} lines\n`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
