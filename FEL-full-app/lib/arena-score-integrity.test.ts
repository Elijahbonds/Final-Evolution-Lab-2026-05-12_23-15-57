// HOTFIX (2026-09-24): the staked-score checks, proven. Four layers:
//   1. BEHAVIOUR of the checks themselves (ceilings, the refusal's words, the dunk card adding up, the kill switch).
//   2. A PERFECT RUN OF MAXIMUM LENGTH for EVERY stakeable mode, played through the mode's real scoring core where one is
//      pure enough to run here (the judge panel, big air, the quiz, the dance judge, the PERFORM set, ComboChain, the
//      TrickMachine, Freeflow, TennisScore), and through its formula — held to its file by the drift guards — where the
//      core lives inside a Babylon mode. Every one stays at or under its ceiling; a 'rules' ceiling is met exactly.
//   3. DRIFT GUARDS for the numbers mirrored out of mode files a server route must not import.
//   4. SERVER SAFETY: nothing the module pulls in, however deep, touches Babylon or a window.
// The routes are exercised with auth and the database mocked in lib/arenaSubmitRoute.test.ts.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  SCORE_CEILINGS, MIRRORED, BOUND_MARGIN, UNTIMED_RUN_SEC, MAX_FRAME_HZ, SKATE_LINK_SEC, BOARD_EVENT_SEC, FREERUN_LINK_SEC,
  KARATE_SWING_SEC, FOOTBALL_EVENT_SEC, DUNK_ATTEMPT_MAX, DUNK_CONTEST_ATTEMPTS, DUNK_MAX_SCALE, BIG_AIR_MAX_TURNS,
  checkStakeScore, checkDunkCard, scoreCeilingFor, canonicalStakeMode, killSwitchOn, dunkAttemptCeiling, aboveCeilingDetail,
  whoSceneItCeiling, danceCeiling, brainBrawlCeiling, bigAirCeiling, skateLinkMax, chainRunBound, frameRoundedRate,
  carnivalEventBounds, STAKE_MODE_ALIASES, type ScoreCeiling,
} from './arena-score-integrity';
import { ARENA_MODES } from './arena';
import { ARENA_SCORE_BASELINES } from './arena-rivals';
import { MODE_INFO } from './game-data';
import { emptyCard, addAttempt, forWire, type DunkAttempt } from './mp/dunkCard';
import { judgeDunk, JUDGE_COUNT, PERFECT_TOTAL } from './babylon/core/JudgePanel';
import { stakesScale, spendAttempt, call, FRESH_STAKES } from './babylon/core/DunkStakes';
import { makeBigAirSession, BIG_AIR_TUNING } from './feel/cores/big-air-skin';
import { challengeScore } from './babylon/core/BrainBrawlCore';
import { WHO_SCENE_IT } from './babylon/core/QuizCore';
import { buildRounds, BuzzMatch, SCENE_CATEGORIES } from './babylon/core/SceneBuzz';
import { DancePerformance, DANCE_LIBRARY, type DanceStep } from './babylon/core/DanceCore';
import { exportSongToDance } from './babylon/music/DanceExport';
import { MAX_SONG_BARS, MAX_CHAIN_ENTRIES } from './babylon/music/Song';
import { PerformSet, performHitPoints, PERFORM_SET_NOTES, PERFORM_SET_BARS, PERFORM_STEPS_PER_BAR } from './babylon/music/performSet';
import { TennisScore } from './babylon/core/RallyCore';
import { buildResult } from './babylon/core/sessionResult';
import { RINGS, BANK } from './babylon/core/ParkourGolf';
import { TOKEN, TARGETS } from './babylon/core/ParkourDerby';
import { REGULATION_KICKS } from './babylon/core/ShootoutCore';
import { BREAK } from './babylon/core/Breakaway';
import { RUN } from './babylon/core/RushRun';
import { ComboChain, REPEAT_DECAY, REPEAT_NO_MULT } from './babylon/core/ComboChain';
import { TRICKS, TrickMachine, type BoardRig, type TrickDef } from './babylon/modes/boardCore';
import { SKATE_TRICKS, SNOW_TRICKS, SURF_TRICKS, asTrickDef, basePts } from './babylon/core/BoardTricks';
import { WALL_RIDE, LIP, LIP_TRICKS } from './babylon/core/WallRide';
import { Freeflow, FREEFLOW } from './babylon/core/Freeflow';
import { GUNSLING, SLINGSHOT, STIFF, BLOCK, LANES } from './babylon/core/KickoffReturn';
import { FREERUN_TRICKS, LAUNCH_MULT, TIERS } from './babylon/core/FreeRunCore';
import { EVENTS_PER_NIGHT } from './babylon/core/CarnivalNight';
import type { GrindLine } from './babylon/core/GroundRide';
import { SNOW_SLOPE } from './babylon/modes/snowSlope';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const num = (text: string, re: RegExp, what: string): number => {
  const m = re.exec(text);
  if (!m) throw new Error(`drift guard could not find ${what}`);
  return Number(m[1]);
};
/** The largest Postgres int4 — CompetitionMatch.player1Score / player2Score and LadderEntry.score are Int columns. */
const INT4_MAX = 2_147_483_647;

// ── helpers: a Flight Night card built the way DunkMode builds one ─────────────────────────────────────────────────
function realAttempt(round: number, d: number, e: number, s: number, opts: { called?: string | null; landed?: string[]; made?: boolean; tries?: number } = {}): DunkAttempt {
  const made = opts.made ?? true;
  const scores = judgeDunk(d, e, s, 0.5);
  let stakes = call(FRESH_STAKES, opts.called ?? null);
  for (let i = 0; i < (opts.tries ?? 1); i++) stakes = spendAttempt(stakes);
  const total = Math.round(scores.reduce((a, j) => a + j.score, 0) * stakesScale(stakes, opts.landed ?? [], made));
  return { round, style: 'POWER', prop: 'NO PROP', finish: made ? 'dunk_finish' : 'dunk_blown', label: made ? 'TOMAHAWK' : 'BLOWN', judges: scores.map((j) => j.score), total, made };
}
function nightCard(attempts: DunkAttempt[]) {
  return forWire(attempts.reduce((c, a) => addAttempt(c, a), emptyCard()));
}

// ── helpers: perfect runs through the real cores ────────────────────────────────────────────────────────────────────

/** A TrickMachine on a fake rig (boardCore.combo.test.ts's harness), flown by a player who never bails. Each landing is
 *  the trick that pays most right now (its decayed points × the multiplier it leaves), given exactly the air it needs
 *  to land clean and never less than BOARD_EVENT_SEC; a rail (when there is one) is ridden whenever it pays more. When
 *  nothing pays, the combo banks and a fresh one starts. Returns everything banked plus the combo open at the horn. */
function trickMachineRun(defs: readonly TrickDef[], sec: number, grindBonus = 0): number {
  const info = console.info;
  console.info = () => undefined;                                                 // the machine logs every landing
  try { return trickMachineRunQuiet(defs, sec, grindBonus); } finally { console.info = info; }
}
function trickMachineRunQuiet(defs: readonly TrickDef[], sec: number, grindBonus: number): number {
  const hz = 60, dt = 1 / hz;
  const rider = { grounded: true, vel: { scaleInPlace: () => undefined }, jump: () => undefined };
  const rig = { char: { root: { rotation: { y: 0, z: 0 } }, animator: { play: () => undefined } }, rider } as unknown as BoardRig;
  const tm = new TrickMachine(rig, () => undefined, { anim: 'external' });
  const reps = new Map<string, number>();
  let multLinks = 0, t = 0;
  const repOf = (k: string) => reps.get(k) ?? 0;
  const value = (k: string, pts: number, decays: boolean) => {
    const rep = repOf(k);
    const paid = decays ? Math.round(pts * REPEAT_DECAY[Math.min(rep, REPEAT_DECAY.length - 1)]) : pts;
    return paid * Math.max(1, multLinks + (rep < REPEAT_NO_MULT ? 1 : 0));
  };
  const airFor = (d: TrickDef) => {
    if (d.turns === 0) return 1 / 4 + 2 * dt;                                     // a grab: spun += 4 a second, 0.95 is clean
    const turnsPerSec = d.sec ? Math.abs(d.turns) / d.sec : 2.2;
    return (0.95 * Math.abs(d.turns)) / turnsPerSec + 2 * dt;
  };
  const note = (k: string) => { if (repOf(k) < REPEAT_NO_MULT) multLinks++; reps.set(k, repOf(k) + 1); };
  while (t < sec) {
    // raise the multiplier first (a move not yet repeated REPEAT_NO_MULT times), the best-paying such move; then cash in
    let best: TrickDef | null = null, bestV = 0, bestRaises = false;
    for (const d of defs) {
      const v = value(d.name, d.pts, true), raises = repOf(d.name) < REPEAT_NO_MULT && v > 0;
      if ((raises && !bestRaises) || (raises === bestRaises && v > bestV)) { bestV = v; best = v > 0 ? d : best; bestRaises = raises; }
    }
    const grindV = grindBonus ? value('GRIND', grindBonus, false) : 0;
    const grindRaises = repOf('GRIND') < REPEAT_NO_MULT;
    if (grindV > 0 && ((grindRaises && !bestRaises) || (grindRaises === bestRaises && grindV >= bestV))) {
      tm.bankGrind({ bonus: grindBonus } as unknown as GrindLine);
      note('GRIND');
      for (let i = 0; i < BOARD_EVENT_SEC * hz; i++) tm.update(dt);
      t += BOARD_EVENT_SEC;
      continue;
    }
    if (!best) {                                                                    // nothing left pays: bank and go again
      for (let i = 0; i < (TrickMachine.LINK_GRACE_SEC + 0.1) * hz; i++) tm.update(dt);
      t += TrickMachine.LINK_GRACE_SEC + 0.1; reps.clear(); multLinks = 0;
      continue;
    }
    const air = Math.max(BOARD_EVENT_SEC, airFor(best));
    rider.grounded = false; tm.start(best);
    for (let i = 0; i < Math.ceil(air * hz); i++) tm.update(dt);
    rider.grounded = true; tm.update(dt);
    note(best.name);
    t += Math.ceil(air * hz) * dt + dt;
  }
  return tm.score + tm.comboPts;
}

/** Venice Lines through the real ComboChain('air'): one unbroken combo, a new link every SKATE_LINK_SEC paying the
 *  plaza's biggest award (no link in the game pays more), the open GRIND / MANUAL link accruing each frame at its real
 *  rate with the game's own per-frame rounding, banked at the horn, plus every coin. No player can beat this run. */
function skateRun(hz: number): number {
  const combo = new ComboChain(undefined, 'air');
  const dt = 1 / hz, every = Math.ceil(SKATE_LINK_SEC * hz - 1e-9);
  const links: [string, number, 'grind' | 'manual'][] = [['GRIND', MIRRORED.grindPtsPerSec, 'grind'], ['MANUAL', MIRRORED.manualPtsPerSec, 'manual'], ['NOSE MANUAL', MIRRORED.noseManualPtsPerSec, 'manual']];
  let cur = links[0], n = 0;
  for (let f = 0; f < MIRRORED.skateRunSec * hz; f++) {
    if (f % every === 0) { cur = links[n++ % links.length]; combo.add(cur[0], skateLinkMax(), cur[2]); }
    else combo.accrue(cur[0], Math.round(cur[1] * dt), cur[2]);
  }
  combo.bank();
  return combo.banked + MIRRORED.coinRunCap * MIRRORED.skateCoinPts;
}

/** The reviewer's probe (h2 review, medium): alternating GRIND / MANUAL links of `linkSec`, accrued frame by frame with
 *  the game's rounding, for the whole 90 s — the honest expert line that passed the old 75,000 limit at 49.5 s. */
function skateExpertLine(hz: number, linkSec: number): number {
  const combo = new ComboChain(undefined, 'air');
  const dt = 1 / hz, every = Math.round(linkSec * hz);
  let grind = true;
  for (let f = 0; f < MIRRORED.skateRunSec * hz; f++) {
    if (f % every === 0) grind = !grind;
    combo.accrue(grind ? 'GRIND' : 'MANUAL', Math.round((grind ? MIRRORED.grindPtsPerSec : MIRRORED.manualPtsPerSec) * dt), grind ? 'grind' : 'manual');
  }
  combo.bank();
  return combo.banked;
}

/** Free Run through the real ComboChain('all') to the time cap: a link every FREERUN_LINK_SEC, each move key in turn
 *  (every one paying the biggest award, the flip off a wall kick), banked whenever nothing pays any more; plus the whole
 *  time bonus and the biggest route bonus. */
function freerunRun(): number {
  const verbs = [...src('lib/babylon/modes/FreeRunMode.ts').matchAll(/combo\.add\('([A-Z -]+)'/g)].map((m) => m[1]);
  const keys = [...new Set(verbs), ...Object.values(FREERUN_TRICKS).map((t) => `${t.name} OFF WALLKICK`)];
  const award = Math.round(Math.max(...Object.values(FREERUN_TRICKS).map((t) => t.pts)) * Math.max(...Object.values(LAUNCH_MULT)));
  const combo = new ComboChain(undefined, 'all');
  const cap = MIRRORED.freerunParSecMax * MIRRORED.freerunRunCapPar;
  let k = 0;
  for (let t = 0; t <= cap + 1e-9; t += FREERUN_LINK_SEC) {
    if (combo.add(keys[k++ % keys.length], award, 'air') === 0) { combo.bank(); combo.add(keys[k++ % keys.length], award, 'air'); }
  }
  combo.bank();
  return combo.banked + Math.max(...TIERS.map((t) => t.parSec * MIRRORED.freerunTimeBonusPerSec)) + Math.max(...TIERS.map((t) => t.routeBonus));
}

/** The Hundred through the real Freeflow: UNTIMED_RUN_SEC of a swing every KARATE_SWING_SEC, each flooring a whole wave
 *  (the flow never drops), a new wave of the full budget every time one is down. The mode's end card: kos × 100 +
 *  wave × 50 + the flow's points. */
function karateRun(): number {
  const flow = new Freeflow();
  let kos = 0, wave = 1;
  for (let t = 0; t <= UNTIMED_RUN_SEC + 1e-9; t += KARATE_SWING_SEC) {
    flow.hit(MIRRORED.karateWaveMax, 'finisher', t);
    kos += MIRRORED.karateWaveMax; wave++;
  }
  return kos * MIRRORED.karateKoPts + wave * MIRRORED.karateWavePts + Math.round(flow.points);
}

/** Breakaway: UNTIMED_RUN_SEC of an evade every FOOTBALL_EVENT_SEC — each a truck in a breakaway (TRUCK_PTS × 2, the
 *  biggest award) — every style chain on every drive, and all three touchdowns at the end in a breakaway, when the evade
 *  count (which each touchdown pays 10 a head for) is highest. FootballRushMode's formulas, held by the drift guards. */
function footballRun(): number {
  const m = MIRRORED;
  let score = 0, evades = 0;
  for (let t = 0; t <= UNTIMED_RUN_SEC + 1e-9; t += FOOTBALL_EVENT_SEC) { score += 30 * 2; evades++; }
  for (let d = 0; d < m.footballDrives; d++) {
    for (let types = 2; types <= m.footballStyleTypes; types++) score += m.footballStylePts * (types - 1);
    score += Math.round((100 + evades * 10) * 1.5);
  }
  return score;
}

/** Game Night: every event played flawlessly to its clock (carnivalEvents' own rules, held by the drift guards), and a
 *  named night of the biggest one four times over (CourtCarnivalMode caps a named night at EVENTS_PER_NIGHT). */
function carnivalEventRuns(): Record<string, number> {
  const m = MIRRORED;
  // SLAM RUSH: a make on every release, released the moment the 0.5 s cooldown is out (ticked at 240 Hz)
  let makes = 0, cooldown = 0;
  for (let f = 0; f <= m.slamRushSec * 240; f++) { if (cooldown <= 0) { makes++; cooldown = m.slamRushCooldownSec; } cooldown -= 1 / 240; }
  const gauntletRaw = trickMachineRun([TRICKS.flipA, TRICKS.flipB, TRICKS.spin], m.trickGauntletSec);
  return {
    slam_rush: makes * m.slamRushPpu,
    strike_storm: m.strikeStormSec * MAX_FRAME_HZ * m.strikeStormPpu,                         // the bag hit every frame
    trick_gauntlet: Math.round(gauntletRaw * m.trickGauntletPpu),
    hot_shot: Math.floor(m.hotShotSec / (m.hotShotGoalZ / m.hotShotMaxSpeed)) * m.hotShotPpu,  // full-power goals back to back
    coin_storm: (14 + 10 + 14) * m.coinStormPpu,                                               // three patterns cleared at the stick's top speed
    counter_strike: Math.ceil(m.counterStrikeSec / m.counterStrikeCycleSec) * m.counterStrikePpu,
  };
}

/** An Arena PERFORM set through the real PerformSet at the fastest tempo, tapped dead on every note, well past its end. */
function performRun(bpm: number, arena = true): { score: number; notes: number; overAt: number } {
  const set = new PerformSet({ arena });
  const stepSec = 60 / bpm / 4;
  let overAt = -1;
  for (let i = 0; i < (PERFORM_SET_BARS + 8) * PERFORM_STEPS_PER_BAR; i++) {
    const t = i * stepSec;
    set.note(i % PERFORM_STEPS_PER_BAR, t, t);
    set.tap(t);
    if (overAt < 0 && set.over(t)) overAt = i;
  }
  return { score: set.score, notes: set.notes, overAt };
}

/** Big Air through the real AirSessionCore at full boost: the spin started at take-off, planted the moment it reaches
 *  `plantAt` turns (a whole half turn: clean), the landing stuck (tapped all the way down). `plantAt` null = never
 *  planted, to measure how far the air lets a spin turn. */
function bigAirRun(plantAt: number | null): { score: number; maxTurns: number } {
  const core = makeBigAirSession(undefined, {});
  let started = false, planted = false, maxTurns = 0;
  for (let i = 0; i < 120 * 60 && !core.state.finished; i++) {
    core.boostK = 1;
    const st = core.step(1 / 120);
    if (st.phase !== 'Air') { started = false; planted = false; continue; }
    if (!started) { core.trick(); started = true; }
    else if (plantAt !== null && !planted && Math.abs(st.spinTurns) >= plantAt) { core.trick(); planted = true; }
    if (st.vy < 0) core.stick();
    maxTurns = Math.max(maxTurns, Math.abs(core.state.spinTurns));
  }
  return { score: core.state.score, maxTurns };
}

/** First to `target` on buckets of 2 or 3 — every reachable final score, searched. */
function firstToMax(target: number): number {
  let best = 0;
  const walk = (s: number): void => { if (s >= target) { best = Math.max(best, s); return; } walk(s + 2); walk(s + 3); };
  walk(0);
  return best;
}

/** A perfect run of maximum length for every stakeable mode. */
const PERFECT_RUNS: Record<string, () => number> = {
  dunkContest: () => {
    const perfect = judgeDunk(10, 10, 10, 1).reduce((a, j) => a + j.score, 0);
    return DUNK_CONTEST_ATTEMPTS * Math.round(perfect * stakesScale(spendAttempt(call(FRESH_STAKES, 'windmill')), ['windmill'], true));
  },
  hoops1v1: () => firstToMax(MIRRORED.onevoneTarget),
  hoops3v3: () => firstToMax(MIRRORED.threevthreeTarget),
  threePoint: () => {
    let s = 0;
    for (let r = 0; r < MIRRORED.threePointRacks; r++) for (let b = 0; b < MIRRORED.threePointBallsPerRack; b++) s += b === MIRRORED.threePointBallsPerRack - 1 ? MIRRORED.threePointMoneyWorth : 1;
    return s;
  },
  bigAir: () => bigAirRun(Math.floor(bigAirRun(null).maxTurns * 2) / 2).score,
  golf: () => {
    let s = 0;
    MIRRORED.golfPar.forEach((par, h) => {
      s += Math.round(Math.max(20, 120 - (1 - par) * 40) * (h === MIRRORED.golfHoles - 1 ? MIRRORED.clutchMult : 1));
      let ringPts = 0;
      RINGS.at.forEach((_, i) => { ringPts += RINGS.pts * (i === 0 ? 1 : RINGS.chainMult); });
      s += ringPts + BANK.pts;
    });
    return s;
  },
  baseball: () => {
    const perPitch = Math.max(Math.round((80 + 0.9 * 60) * MIRRORED.clutchMult), ...TARGETS.map((t) => t.pts));
    let s = 0, tokens = TARGETS.filter((t) => t.kind === 'glass').length;
    for (let p = 0; p < MIRRORED.derbyPitches; p++) { const mult = tokens > 0 ? TOKEN.mult : 1; if (tokens > 0) tokens--; s += perPitch * mult; }
    return s;
  },
  soccer: () => {
    const wallRuns = Math.ceil(BREAK.clockSec / (2 / RUN.lateralAccel)) + 1;
    return (REGULATION_KICKS + MIRRORED.penaltySdCap) * (20 + MIRRORED.maxFeints * MIRRORED.feintStylePts + 15 + 5 + wallRuns * 5);
  },
  tennis: () => { const t = new TennisScore(MIRRORED.tennisGames); for (let i = 0; i < 200 && t.award(0) !== 'match';); return t.games[0]; },
  tiebreak: () => {
    let rally = 1;
    while (0.16 + rally * 0.05 < 1) rally++;                                                    // the AI cannot return this one
    return MIRRORED.tiebreakTarget * 120 + rally * 30;
  },
  brainBrawl: () => {
    let best = 0;
    for (const tier of [1, 2, 3] as const) for (const left of [0, 1, 3, 10, 30]) best = Math.max(best, challengeScore(true, left, 10, tier));
    return MIRRORED.brainBrawlMaxRounds * best;
  },
  whoSceneIt: () => {
    const venues = SCENE_CATEGORIES.flatMap((c) => c.venueIds);
    const questions = venues.flatMap((v, i) => Array.from({ length: 5 }, (_, k) => ({
      id: `q${i}_${k}`, prompt: 'where?', sceneVenueId: v, difficulty: 3 as const, answer: 'a',
      options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }],
    })));
    const match = new BuzzMatch(buildRounds({ id: 'p', title: 'P', questions }, 7, MIRRORED.whoSceneItPerCategory), WHO_SCENE_IT, 1);
    while (!match.finished) {
      const q = match.question!;
      match.answer(0, q.options.findIndex((o) => o.id === q.answer), WHO_SCENE_IT.timeLimit);
      match.advance();
    }
    return match.players[0].score;
  },
  karateVersus: () => MIRRORED.versusRoundsToWin * 100 - 0 * 40,
  mixedcombat: () => MIRRORED.versusRoundsToWin * 100 - 0 * 40,
  dance: () => {
    const minBeats = Math.min(...DANCE_LIBRARY.map((c) => c.beats));
    const steps = Math.floor((MAX_SONG_BARS * 4) / minBeats);
    const bd = 60 / 120;
    const chart: DanceStep[] = Array.from({ length: steps }, (_, i) => ({ clipId: 'dance_trans_spin', beat: i * minBeats, holdBeats: minBeats, mirrored: false }));
    const perf = new DancePerformance(120);
    perf.setRoutine(chart);
    perf.start(0);
    for (const s of chart) { const t = s.beat * bd; perf.update(t); perf.hit(t); }
    return perf.result().score;
  },
  training: () => {
    // training-game's loop at 1 ms: the lowest zone the draw allows, released dead centre (PERFECT), four reps an exercise
    const speeds = MIRRORED.trainingSpeeds, sizes = [0.2, 0.16, 0.13, 0.11];
    let t = 0, score = 0, streak = 0, ex = 0, reps = 0;
    while (true) {
      const mid = 0.45 + sizes[ex] / 2;
      const repSec = mid / (0.55 * speeds[ex]);
      if (t + repSec > MIRRORED.trainingSec) break;
      t += repSec; streak++; reps++;
      score += 80 + (streak >= 3 ? 20 : 0);
      if (reps >= 4 && ex < speeds.length - 1) { ex++; reps = 0; }
    }
    return score;
  },
  music: () => performRun(160).score,
  skateboarding: () => Math.max(...[60, 120, 144, 180, 240].map(skateRun)),
  surfing: () => {
    const m = MIRRORED;
    const airs = trickMachineRun([...SURF_TRICKS.filter((t) => t.kind === 'air').map(asTrickDef), TRICKS.grab], m.surfRunSec);
    const waveMoves = (Math.floor(m.surfRunSec / m.surfWaveMoveLockSec) + 1) * (Math.max(...SURF_TRICKS.filter((t) => t.kind !== 'air').map(basePts)) + m.surfFlowMax / 4);
    const barrels = Math.floor(m.surfRunSec / m.surfBarrelHoldSec) * m.surfBarrelBonus;
    return airs + waveMoves + barrels;
  },
  snowboarding: () => {
    const m = MIRRORED;
    const run = trickMachineRun([...SNOW_TRICKS.filter((t) => t.kind === 'air').map(asTrickDef), ...Object.values(TRICKS)], UNTIMED_RUN_SEC, m.boardRailMax);
    return run + m.slalomGates * m.slalomGatePts + m.yetiClearPts + m.snowTimeBonusMax;
  },
  freerun: freerunRun,
  karateEndless: karateRun,
  carnival: () => EVENTS_PER_NIGHT * Math.max(...Object.values(carnivalEventRuns())),
  football: footballRun,
};

describe('the ceiling table', () => {
  it('has a cited, positive ceiling for every stakeable arena mode, and every one fits the Int column it is stored in', () => {
    for (const mode of ARENA_MODES) {
      const c = scoreCeilingFor(mode);
      expect(c, mode).not.toBeNull();
      expect(Number.isInteger(c!.max) && c!.max > 0, mode).toBe(true);
      expect(c!.max, mode).toBeLessThan(INT4_MAX);
      expect(c!.basis.length, mode).toBeGreaterThan(20);
      expect(c!.why.length, mode).toBeGreaterThan(5);
    }
  });

  it('sets the rules ceilings at what the rules can award', () => {
    const want: Record<string, number> = {
      dunkContest: 240, hoops1v1: 13, hoops3v3: 23, threePoint: 30, bigAir: 4800, golf: 1310, baseball: 4422,
      soccer: 5560, tennis: 4, tiebreak: 1350, brainBrawl: 4500, whoSceneIt: 3540, karateVersus: 200, mixedcombat: 200,
      dance: 79680, training: 9400, music: 2_647_100,
    };
    for (const [mode, max] of Object.entries(want)) {
      expect(SCORE_CEILINGS[mode].kind, mode).toBe('rules');
      expect(SCORE_CEILINGS[mode].max, mode).toBe(max);
    }
  });

  it('bounds exactly the modes whose rules set no maximum, each at BOUND_MARGIN × its modelled flawless run', () => {
    const bound = Object.entries(SCORE_CEILINGS).filter(([, c]) => c.kind === 'bound').map(([k]) => k).sort();
    expect(bound).toEqual(['carnival', 'football', 'freerun', 'karateEndless', 'skateboarding', 'snowboarding', 'surfing']);
    expect(BOUND_MARGIN).toBe(2);
    expect(UNTIMED_RUN_SEC).toBe(1800);
    // a bound ceiling is never near a good night: at least 10x the arena's own mid-band run for the mode
    for (const mode of bound) expect(SCORE_CEILINGS[mode].max, mode).toBeGreaterThanOrEqual(10 * ARENA_SCORE_BASELINES[mode]);
  });

  it('chainRunBound is a true maximum: fewer events, smaller awards or a lower cap never score more', () => {
    const base = { sec: 10, eventSec: 0.5, perEvent: 100, multCap: 6, accrualPerSec: 20, flat: 7 };
    const top = chainRunBound(base);
    // 21 events: 100 × (1+2+…+6 + 6 × 15) + 20 × 10 × 6 + 7
    expect(top).toBe(100 * (21 + 6 * 15) + 1200 + 7);
    for (const o of [{ eventSec: 0.6 }, { perEvent: 99 }, { multCap: 5 }, { accrualPerSec: 19 }, { sec: 9.9 }]) expect(chainRunBound({ ...base, ...o })).toBeLessThan(top);
    expect(frameRoundedRate(90)).toBe(180);
    // …and the per-frame rounding really never beats 2 × rate, at any display rate
    for (let hz = 20; hz <= 1000; hz++) expect(Math.round(90 / hz) * hz).toBeLessThanOrEqual(frameRoundedRate(90));
  });

  it('flags exactly the modes whose arena route swaps to a fallback game under NEXT_PUBLIC_DISABLE_3D', () => {
    for (const mode of ARENA_MODES) {
      const href = MODE_INFO[mode]?.href;
      expect(href, `${mode} has a play route`).toMatch(/^\/play\//);
      const dir = join('app', href!.slice(1), '_components');
      const loader = readdirSync(join(process.cwd(), dir)).filter((f) => f.endsWith('.tsx')).map((f) => src(join(dir, f))).join('\n');
      const swaps = /\bisBabylon\(|\bis3D\(/.test(loader);
      expect(SCORE_CEILINGS[mode].swapsUnderKillSwitch, `${mode} (${dir})`).toBe(swaps);
    }
  });

  it('maps the registry keys the competition engine carries onto the table', () => {
    expect(canonicalStakeMode('skateboard')).toBe('skateboarding');
    expect(canonicalStakeMode('snowboard_slalom')).toBe('snowboarding');
    expect(canonicalStakeMode('surf')).toBe('surfing');
    for (const [alias, key] of Object.entries(STAKE_MODE_ALIASES)) expect(SCORE_CEILINGS[key], alias).toBeDefined();
    expect(scoreCeilingFor('dunk')).toBe(SCORE_CEILINGS.dunkContest);
    // HOTFIX (2026-09-24): the music row is keyed 'music'; a duel stored as 'musicAcademy' reads through the catalogue's
    // alias for the old spelling.
    expect(SCORE_CEILINGS.musicAcademy).toBeUndefined();
    expect(scoreCeilingFor('music')).toBe(SCORE_CEILINGS.music);
    expect(canonicalStakeMode('musicAcademy')).toBe('music');
    expect(scoreCeilingFor('musicAcademy')).toBe(SCORE_CEILINGS.music);
    expect(scoreCeilingFor('not-a-mode')).toBeNull();
    expect(scoreCeilingFor('')).toBeNull();
    expect(scoreCeilingFor('__proto__')).toBeNull();
    expect(canonicalStakeMode('__proto__')).toBe('__proto__');
    expect(canonicalStakeMode('constructor')).toBe('constructor');
  });
});

describe('a perfect run of maximum length stays under its ceiling — every stakeable mode', () => {
  it('has a perfect-run driver for every ARENA_MODES key, and none outscores its ceiling', () => {
    for (const mode of ARENA_MODES) {
      expect(PERFECT_RUNS[mode], `${mode} has a perfect-run driver`).toBeTypeOf('function');
      const run = PERFECT_RUNS[mode]();
      const c = SCORE_CEILINGS[mode];
      expect(run, `${mode}: perfect run ${run} vs ceiling ${c.max}`).toBeLessThanOrEqual(c.max);
      expect(run, mode).toBeGreaterThan(0);
      expect(checkStakeScore({ mode, score: Math.round(run) }).ok, mode).toBe(true);
    }
  });

  it('meets every exact rules ceiling exactly (big air and training sit just under: their ceilings round the rules up)', () => {
    for (const [mode, c] of Object.entries(SCORE_CEILINGS)) {
      if (c.kind !== 'rules' || mode === 'bigAir' || mode === 'training') continue;
      expect(PERFECT_RUNS[mode](), mode).toBe(c.max);
    }
  });

  it('keeps every bound ceiling at least BOUND_MARGIN × the best run the real cores produce', () => {
    for (const [mode, c] of Object.entries(SCORE_CEILINGS)) {
      if (c.kind !== 'bound') continue;
      expect(PERFECT_RUNS[mode]() * BOUND_MARGIN, mode).toBeLessThanOrEqual(c.max);
    }
  });

  it('music (HIGH): an Arena set is PERFORM_SET_BARS long, ends itself, and a perfect set at 160 BPM scores exactly the ceiling', () => {
    for (const bpm of [60, 92, 160]) {
      const r = performRun(bpm);
      expect(r.notes, `${bpm} BPM`).toBe(PERFORM_SET_NOTES);
      expect(r.score, `${bpm} BPM`).toBe(SCORE_CEILINGS.music.max);           // the tempo changes the time, not the notes
      expect(r.overAt, `${bpm} BPM`).toBeGreaterThanOrEqual(PERFORM_SET_NOTES);        // it ends after the last note, not before
    }
    // the reviewer's probe: 222 perfect hits in a row (504,000) was refused under the old 500,000 — it is accepted now
    let s = 0;
    for (let i = 0; i < 222; i++) s += performHitPoints(true, i);
    expect(s).toBe(504_000);
    expect(checkStakeScore({ mode: 'music', score: s }).ok).toBe(true);
    expect(checkStakeScore({ mode: 'musicAcademy', score: s }).ok).toBe(true);   // a duel stored under the old key
    // one note past the set pays nothing: the note is never offered
    const set = new PerformSet({ arena: true });
    for (let i = 0; i < PERFORM_SET_NOTES + 40; i++) { const t = i * 0.1; expect(set.note(0, t, t).offered).toBe(i < PERFORM_SET_NOTES); set.tap(t); }
    expect(set.score).toBe(SCORE_CEILINGS.music.max);
    expect(checkStakeScore({ mode: 'music', score: set.score }).ok).toBe(true);        // the staked maximum is accepted
    expect(checkStakeScore({ mode: 'music', score: set.score + 1 }).ok).toBe(false);   // and one point over it is not
  });

  // Owner, 2026-09-24: "Cap only Arena sets — staked Arena sets end after 32 bars; free play stays endless". The ceiling
  // is the Arena set's; a free set has no end, so its score has no ceiling, and that is why only the Arena set is staked.
  it('music: a free set is not what the ceiling describes — it never ends, and the same perfect play runs past the ceiling', () => {
    const free = performRun(160, false);
    expect(free.overAt).toBe(-1);                                                // it never ends itself
    expect(free.notes).toBe((PERFORM_SET_BARS + 8) * PERFORM_STEPS_PER_BAR);     // every step past bar 32 is still a note
    expect(free.score).toBeGreaterThan(SCORE_CEILINGS.music.max);
    expect(checkStakeScore({ mode: 'music', score: free.score }).ok).toBe(false);
    expect(SCORE_CEILINGS.music.why).toContain(`${PERFORM_SET_BARS}-bar Arena set`);
  });

  it('skate (MEDIUM): the reviewer\'s honest expert line — alternating 1.5 s grind / manual for the whole run — is accepted at any refresh rate', () => {
    for (const hz of [60, 120, 144]) {
      const line = skateExpertLine(hz, 1.5);
      expect(line, `${hz} Hz`).toBeGreaterThan(75_000);                                 // the old limit refused this
      expect(checkStakeScore({ mode: 'skateboarding', score: line }).ok, `${hz} Hz`).toBe(true);
    }
    // and a line four times as fast
    expect(checkStakeScore({ mode: 'skateboarding', score: skateExpertLine(120, 0.375) }).ok).toBe(true);
  });

  it('snow and surf (MEDIUM): a masher rotating every trick for the whole session is accepted', () => {
    const snowMash = trickMachineRun(SNOW_TRICKS.filter((t) => t.kind === 'air').map(asTrickDef), 90);
    const surfMash = trickMachineRun(SURF_TRICKS.filter((t) => t.kind === 'air').map(asTrickDef), 90);
    expect(snowMash).toBeGreaterThan(0);
    expect(checkStakeScore({ mode: 'snowboarding', score: snowMash }).ok).toBe(true);
    expect(checkStakeScore({ mode: 'surfing', score: surfMash }).ok).toBe(true);
  });

  it('Flight Night: a perfect panel on a called, landed first attempt is exactly DUNK_ATTEMPT_MAX, and nothing beats it', () => {
    const perfect = judgeDunk(10, 10, 10, 1);
    expect(perfect.every((j) => j.score === 10)).toBe(true);
    expect(perfect).toHaveLength(JUDGE_COUNT);
    const stakes = spendAttempt(call(FRESH_STAKES, 'windmill'));
    expect(Math.round(PERFECT_TOTAL * stakesScale(stakes, ['windmill'], true))).toBe(DUNK_ATTEMPT_MAX);
    expect(DUNK_ATTEMPT_MAX).toBe(60);
    expect(DUNK_MAX_SCALE).toBeCloseTo(1.2);
    for (const d of [-5, 0, 5, 10, 15]) for (const e of [-5, 0, 5, 10, 15]) for (const s of [-5, 0, 5, 10, 15]) for (const c of [0, 1]) {
      const scores = judgeDunk(d, e, s, c).map((j) => j.score);
      expect(Math.max(...scores)).toBeLessThanOrEqual(10);
      for (const tries of [1, 2, 3]) for (const called of [null, 'x']) for (const made of [true, false]) {
        let st = call(FRESH_STAKES, called);
        for (let i = 0; i < tries; i++) st = spendAttempt(st);
        const total = Math.round(scores.reduce((a, b) => a + b, 0) * stakesScale(st, made ? ['x'] : [], made));
        expect(total).toBeLessThanOrEqual(dunkAttemptCeiling(scores.slice(0, 3)));
      }
    }
    expect(DUNK_CONTEST_ATTEMPTS).toBe(4);
  });

  it('Big Air: the real core, boosted flat out with the spin started at take-off, turns fewer than BIG_AIR_MAX_TURNS', () => {
    let maxTurns = 0;
    const core = makeBigAirSession(undefined, {});
    let spun = false;
    for (let i = 0; i < 120 * 60 && !core.state.finished; i++) {
      core.boostK = 1;
      const st = core.step(1 / 120);
      if (st.phase === 'Air' && !spun) { core.trick(); spun = true; }
      if (st.phase !== 'Air') spun = false;
      maxTurns = Math.max(maxTurns, Math.abs(st.spinTurns ?? 0));
    }
    expect(core.state.attempt).toBe(BIG_AIR_TUNING.attemptsPerRound);
    expect(maxTurns).toBeGreaterThan(3);                    // the spin really ran (≈ 4.7 turns)
    expect(maxTurns).toBeLessThan(BIG_AIR_MAX_TURNS);
    expect(core.state.score).toBeLessThanOrEqual(bigAirCeiling());
  });

  it('Brain Brawl, Who Scene It, dance and tennis land exactly on their ceilings through their real cores', () => {
    expect(brainBrawlCeiling()).toBe(PERFECT_RUNS.brainBrawl());
    expect(whoSceneItCeiling()).toBe(PERFECT_RUNS.whoSceneIt());
    expect(danceCeiling()).toBe(PERFECT_RUNS.dance());
    expect(PERFECT_RUNS.tennis()).toBe(MIRRORED.tennisGames);
    // the longest song a player can export charts no more steps than the dance ceiling counts
    const sections = [{ id: 'hook', name: 'hook', tracks: [{ sampleId: 'kick', pattern: Array(16).fill(true), volume: 1, muted: false, pan: 0 }] }];
    const chain = Array.from({ length: MAX_CHAIN_ENTRIES }, () => ({ sectionId: 'hook', bars: 8 }));
    const exported = exportSongToDance({ id: 'max', name: 'max', bpm: 120, steps: 16, chain, sections });
    expect(exported!.track.bars).toBe(MAX_SONG_BARS);
    expect(exported!.steps.length).toBeLessThanOrEqual(Math.floor((MAX_SONG_BARS * 4) / Math.min(...DANCE_LIBRARY.map((c) => c.beats))));
  });

  it('Game Night: every event\'s flawless run is inside its bound, and a named night is capped at EVENTS_PER_NIGHT', () => {
    const bounds = carnivalEventBounds(), runs = carnivalEventRuns();
    expect(Object.keys(runs).sort()).toEqual(Object.keys(bounds).sort());
    for (const [id, pts] of Object.entries(runs)) expect(pts, id).toBeLessThanOrEqual(bounds[id]);
    const mode = src('lib/babylon/modes/CourtCarnivalMode.ts');
    expect(mode).toContain('.filter((e): e is CarnivalEvent => !!e).slice(0, EVENTS_PER_NIGHT)');
  });
});

describe('checkStakeScore', () => {
  it('accepts every ceiling and refuses one more, for every stakeable mode', () => {
    for (const mode of ARENA_MODES) {
      const max = SCORE_CEILINGS[mode].max;
      expect(checkStakeScore({ mode, score: max }).ok, `${mode} at ${max}`).toBe(true);
      const over = checkStakeScore({ mode, score: max + 1 });
      expect(over.ok, mode).toBe(false);
      if (!over.ok) {
        expect(over.code).toBe('SCORE_ABOVE_CEILING');
        expect(over.detail).toContain(String(max));
        expect(over.detail).toContain('not recorded');
      }
    }
  });

  it('words a refusal by the kind of ceiling: "more than this mode can award" only when the rules make it true', () => {
    const rules = checkStakeScore({ mode: 'hoops1v1', score: 14 });
    expect(rules.ok).toBe(false);
    if (!rules.ok) expect(rules.detail).toBe('14 is more than this mode can award: 13 (the game ends at 11 and no bucket is worth more than 3). The score was not recorded and nothing was settled.');
    for (const mode of ARENA_MODES) {
      const c = SCORE_CEILINGS[mode];
      const r = checkStakeScore({ mode, score: c.max + 1 });
      if (r.ok) throw new Error(mode);
      if (c.kind === 'bound') {
        expect(r.detail, mode).not.toContain('more than this mode can award');
        expect(r.detail, mode).toContain("above the Arena's limit for this mode");
        expect(r.detail, mode).toContain("can't be verified yet");
      } else expect(r.detail, mode).toContain('more than this mode can award');
    }
    const skate: ScoreCeiling = SCORE_CEILINGS.skateboarding;
    expect(aboveCeilingDetail(skate.max + 1, skate)).toBe(`${skate.max + 1} is above the Arena's limit for this mode, ${skate.max} (${skate.why}). A run past that limit can't be verified yet. The score was not recorded and nothing was settled.`);
  });

  it('pins the arena footnote to the same two kinds (the lobby promises what the server does)', () => {
    const view = src('components/arena-view.tsx');
    expect(view).toContain('A score above a mode&apos;s limit is refused, never');
    expect(view).toContain('the most its rules can award or, for an open-ended');
    expect(view).toContain(`twice a flawless run of the mode&apos;s`);
    expect(view).toContain(`(${UNTIMED_RUN_SEC / 60} minutes where it has no clock)`);
    expect(BOUND_MARGIN).toBe(2);                                 // "twice"
    expect(view).not.toContain('the most that mode can award');
  });

  it('refuses the numbers the old routes settled on', () => {
    for (const score of [INT4_MAX, Number.MAX_SAFE_INTEGER]) {
      for (const mode of ARENA_MODES) expect(checkStakeScore({ mode, score }).ok, `${mode} ${score}`).toBe(false);
    }
    for (const mode of ARENA_MODES.filter((m) => SCORE_CEILINGS[m].kind === 'rules' && m !== 'music')) {
      expect(checkStakeScore({ mode, score: 999_999 }).ok, mode).toBe(false);
    }
  });

  it('refuses a score that is not a non-negative integer, and a mode with no ceiling', () => {
    for (const score of [-1, 1.5, NaN, Infinity, '12', null, undefined]) {
      const r = checkStakeScore({ mode: 'hoops1v1', score });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('SCORE_INVALID');
    }
    const r = checkStakeScore({ mode: 'sprint', score: 10 });   // retired: its route redirects away
    expect(r).toMatchObject({ ok: false, code: 'NO_SCORE_CEILING' });
  });

  it('with the 3D kill switch on, holds a fallback-swapping mode to nothing but still holds a fixed one', () => {
    const swapped = checkStakeScore({ mode: 'hoops1v1', score: 1150, killSwitch: true });   // the 2D 1v1 scores myScore x 100 + steals x 50
    expect(swapped).toMatchObject({ ok: true, ceilingApplied: false });
    expect(checkStakeScore({ mode: 'hoops1v1', score: 1150 }).ok).toBe(false);
    expect(checkStakeScore({ mode: 'training', score: SCORE_CEILINGS.training.max + 1, killSwitch: true }).ok).toBe(false);
    expect(killSwitchOn({ NEXT_PUBLIC_DISABLE_3D: '1' })).toBe(true);
    expect(killSwitchOn({ NEXT_PUBLIC_DISABLE_3D: '0' })).toBe(false);
    expect(killSwitchOn({})).toBe(false);
  });

  it('reads the kill switch the way the client does — the literal process.env.NEXT_PUBLIC_DISABLE_3D the build inlines', () => {
    const own = src('lib/arena-score-integrity.ts');
    const fn = own.slice(own.indexOf('export function killSwitchOn'), own.indexOf('// The checks'));
    expect(fn).toContain('process.env.NEXT_PUBLIC_DISABLE_3D');
    expect(fn).not.toMatch(/env\s*=\s*process\.env/);          // no aliased default the build cannot inline
    expect(src('components/three/flags.ts')).toContain('process.env.NEXT_PUBLIC_DISABLE_3D');
    const before = process.env.NEXT_PUBLIC_DISABLE_3D;
    try {
      process.env.NEXT_PUBLIC_DISABLE_3D = '1'; expect(killSwitchOn()).toBe(true);
      delete process.env.NEXT_PUBLIC_DISABLE_3D; expect(killSwitchOn()).toBe(false);
    } finally { if (before === undefined) delete process.env.NEXT_PUBLIC_DISABLE_3D; else process.env.NEXT_PUBLIC_DISABLE_3D = before; }
  });

  it('ignores a card on a mode that is not Flight Night (it is never stored there)', () => {
    const card = nightCard([realAttempt(1, 9, 9, 9)]);
    const r = checkStakeScore({ mode: 'hoops1v1', score: 11, card });
    expect(r).toMatchObject({ ok: true, card: null });
  });
});

describe('the dunk card adds up', () => {
  const night = [
    realAttempt(1, 9, 9, 9, { called: 'spin_360', landed: ['spin_360'] }),
    realAttempt(1, 4, 5, 3, { made: false, tries: 3 }),
    realAttempt(2, 10, 10, 10, { called: 'windmill', landed: ['windmill'] }),
    realAttempt(2, 6, 7, 6, { tries: 2 }),
  ];
  const card = nightCard(night);
  const total = night.reduce((s, a) => s + a.total, 0);

  it('passes a card built the way DunkMode builds one, and hands it back for storage', () => {
    expect(card.total).toBe(total);
    const r = checkStakeScore({ mode: 'dunkContest', score: total, card });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.card?.total).toBe(total); expect(r.card?.attempts).toHaveLength(4); }
  });

  it('refuses a score that is not the card total', () => {
    const r = checkStakeScore({ mode: 'dunkContest', score: total + 1, card });
    expect(r).toMatchObject({ ok: false, code: 'SCORE_CARD_MISMATCH' });
    if (!r.ok) expect(r.detail).toContain(String(total));
  });

  it('recomputes the total from the attempts: a card whose own total was edited is refused', () => {
    const forged = { ...card, total: total + 40 };
    expect(checkStakeScore({ mode: 'dunkContest', score: total + 40, card: forged })).toMatchObject({ ok: false, code: 'CARD_TOTAL_MISMATCH' });
    expect(checkStakeScore({ mode: 'dunkContest', score: total, card: forged })).toMatchObject({ ok: false, code: 'CARD_TOTAL_MISMATCH' });
  });

  it('refuses an attempt its own judges could not have given, or above a perfect called dunk', () => {
    const lowJudges = { ...card, attempts: card.attempts.map((a, i) => (i === 0 ? { ...a, judges: [6, 6, 6], total: 50 } : a)) };
    const t1 = lowJudges.attempts.reduce((s, a) => s + a.total, 0);
    const r1 = checkDunkCard(t1, { ...lowJudges, total: t1 });
    expect(r1).toMatchObject({ ok: false, code: 'CARD_ATTEMPT_INVALID' });
    expect(dunkAttemptCeiling([6, 6, 6])).toBe(46);   // (18 + two unseen 10s) x 1.2
    const tooBig = { ...card, attempts: [{ ...card.attempts[0], judges: [], total: DUNK_ATTEMPT_MAX + 1 }] };
    expect(checkDunkCard(DUNK_ATTEMPT_MAX + 1, { ...tooBig, total: DUNK_ATTEMPT_MAX + 1 })).toMatchObject({ ok: false, code: 'CARD_ATTEMPT_INVALID' });
    const fractional = { ...card, attempts: [{ ...card.attempts[0], total: 30.5 }] };
    expect(checkDunkCard(30.5, fractional)).toMatchObject({ ok: false, code: 'CARD_ATTEMPT_INVALID' });
    const badJudge = { ...card, attempts: [{ ...card.attempts[0], judges: [11, 10, 10] }] };
    expect(checkDunkCard(card.attempts[0].total, badJudge)).toMatchObject({ ok: false, code: 'CARD_ATTEMPT_INVALID' });
    const junk = { ...card, attempts: [...card.attempts.slice(0, 3), 'a dunk'] };
    expect(checkDunkCard(0, junk)).toMatchObject({ ok: false, code: 'CARD_ATTEMPT_INVALID' });
  });

  it('refuses a card with more dunks than a night has', () => {
    const five = nightCard([...night, realAttempt(3, 9, 9, 9)]);
    expect(checkDunkCard(five.total, five)).toMatchObject({ ok: false, code: 'CARD_TOO_MANY_ATTEMPTS' });
  });

  it('settles on the ceiling alone when no card (or no parseable card) comes with the score', () => {
    for (const raw of [undefined, null, 'card', 42, { v: 99, attempts: [] }, { v: 1, attempts: [] }]) {
      const r = checkStakeScore({ mode: 'dunkContest', score: 200, card: raw });
      expect(r).toMatchObject({ ok: true, card: null });
    }
    expect(checkStakeScore({ mode: 'dunkContest', score: 241 }).ok).toBe(false);
  });
});

describe('the module a server route imports stays server-safe', () => {
  /** Every value import, followed file to file from the module itself: none may reach Babylon or a 'use client' file. */
  it('pulls in only pure modules, however deep — no Babylon, no mode files, nothing that touches a window', () => {
    const seen = new Set<string>();
    const resolve = (from: string, spec: string): string | null => {
      if (!spec.startsWith('.') && !spec.startsWith('@/')) return null;          // a package: checked by name below
      const base = spec.startsWith('@/') ? join(process.cwd(), spec.slice(2)) : join(dirname(from), spec);
      for (const f of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) if (existsSync(f)) return f;
      throw new Error(`cannot resolve ${spec} from ${from}`);
    };
    const walk = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/^['"]use client['"]/m);
      for (const m of text.matchAll(/^import\s+(type\s+)?[^'";]*?from\s+['"]([^'"]+)['"]/gm)) {
        if (m[1]) continue;                                                      // `import type` is erased
        const spec = m[2];
        expect(spec, `${file} imports ${spec}`).not.toMatch(/@babylonjs|\/modes\/|\/components\/|^react/);
        const next = resolve(file, spec);
        if (next) walk(next);
      }
    };
    walk(join(process.cwd(), 'lib/arena-score-integrity.ts'));
    expect(seen.size).toBeGreaterThan(15);
  });
});

describe('the card reaches the server', () => {
  it('rides from the mode (SessionResult.detail) through the dunk host into the arena submit', () => {
    const detail = { card: nightCard([realAttempt(1, 9, 9, 9)]) };
    expect(buildResult('dunk', 'CONTEST_WON', detail.card.total, {}, 0, detail).detail).toBe(detail);
    // the dunk host dropped `detail` when it built the shell's GameResult, so no card was ever sent (HOTFIX 2026-09-24)
    const host = src('components/games/dunk-babylon.tsx');
    const sink = host.slice(host.indexOf('const resultSink'), host.indexOf('const cardSink'));
    expect(sink).toContain('{ detail: r.detail }');
    // the shell already sends whatever card the result carries (unchanged here: game-shell.tsx is another session's file)
    const shell = src('components/games/game-shell.tsx');
    expect(shell).toContain("fetch('/api/arena/submit-score'");
    expect(shell).toMatch(/card: \(res as \{ detail\?: \{ card\?: unknown \} \}\)\.detail!\.card/);
  });
});

describe('drift guards — the numbers mirrored out of mode files still match them', () => {
  it('Flight Night rounds and dunks', () => {
    const t = src('lib/babylon/modes/DunkMode.ts');
    expect(num(t, /const TOTAL_ROUNDS = (\d+);/, 'TOTAL_ROUNDS')).toBe(MIRRORED.dunkRounds);
    expect(num(t, /const DUNKS_PER_ROUND = (\d+);/, 'DUNKS_PER_ROUND')).toBe(MIRRORED.dunksPerRound);
    expect(t).toMatch(/playerTotal \+= missTotal;[^\n]*\n\s*card = addAttempt/);   // every scored player attempt is on the card
    expect(t).toMatch(/playerTotal \+= dunkTotal;[\s\S]{0,400}if \(!rivalsDunk\) card = addAttempt/);
  });

  it('hoops targets and bucket values', () => {
    const one = src('lib/babylon/modes/OneVOneMode.ts'), three = src('lib/babylon/modes/ThreeVThreeMode.ts');
    expect(num(one, /const TARGET_SCORE = (\d+);/, '1v1 TARGET_SCORE')).toBe(MIRRORED.onevoneTarget);
    expect(num(three, /const TARGET_SCORE = (\d+);/, '3v3 TARGET_SCORE')).toBe(MIRRORED.threevthreeTarget);
    for (const t of [one, three]) {
      for (const m of t.matchAll(/myScore \+= (\w+);/g)) expect(['arcPoints', 'points', '2']).toContain(m[1]);
      expect(t).not.toMatch(/arcPoints = [^;]*\? 4/);
    }
  });

  it('three-point racks and the money ball', () => {
    const t = src('lib/babylon/modes/ThreePointMode.ts');
    expect(num(t, /const RACKS = (\d+);/, 'RACKS')).toBe(MIRRORED.threePointRacks);
    expect(num(t, /const BALLS_PER_RACK = (\d+);/, 'BALLS_PER_RACK')).toBe(MIRRORED.threePointBallsPerRack);
    expect(num(t, /const worth = isMoneyBall\(S\.ballIdx\) \? (\d+) : 1;/, 'money ball worth')).toBe(MIRRORED.threePointMoneyWorth);
  });

  it('golf, derby and penalties', () => {
    const t = src('lib/babylon/modes/precisionModes.ts');
    const golf = t.slice(t.indexOf('export const GolfMode'), t.indexOf('export const DerbyMode'));
    const derby = t.slice(t.indexOf('export const DerbyMode'), t.indexOf('export const PenaltyMode'));
    const pen = t.slice(t.indexOf('export const PenaltyMode'));
    expect(num(t, /const CLUTCH_MULT = ([\d.]+);/, 'CLUTCH_MULT')).toBe(MIRRORED.clutchMult);
    expect(/export const GOLF_PAR = \[([\d, ]+)\]/.exec(t)?.[1].split(',').map(Number)).toEqual([...MIRRORED.golfPar]);
    expect(num(golf, /const TOTAL = (\d+);/, 'golf TOTAL')).toBe(MIRRORED.golfHoles);
    expect(golf).toContain('Math.max(20, 120 - rel * 40)');
    expect(num(derby, /const TOTAL = (\d+);/, 'derby TOTAL')).toBe(MIRRORED.derbyPitches);
    expect(derby).toContain('q * (80 + launch * 60) * (clutch ? CLUTCH_MULT : 1)');
    expect(derby).toContain('Math.max(0.1, Math.min(0.9, 0.45 - meet * 1.1))');
    expect(derby).toContain('gained = tg.pts * mult');
    expect(num(pen, /const SD_CAP = (\d+);/, 'SD_CAP')).toBe(MIRRORED.penaltySdCap);
    expect(num(pen, /const MAX_FEINTS = (\d+);/, 'MAX_FEINTS')).toBe(MIRRORED.maxFeints);
    expect(num(pen, /const FEINT_STYLE_PTS = (\d+);/, 'FEINT_STYLE_PTS')).toBe(MIRRORED.feintStylePts);
    expect(pen).toContain('goals * 20 + stylePts');
    expect(pen).toContain("kind === 'rainbow' ? 15 : kind === 'overdrive' ? 15 : 10; if (kinetic) brk.stylePts += 5");
    expect(pen).toContain('brk.stylePts += 5; brkStats.wallRuns++');
    expect(pen).toContain('brk.run.vx = -w * 2');
  });

  it('tennis, tiebreak, Brain Brawl, Who Scene It and the fight modes', () => {
    expect(num(src('lib/babylon/modes/NetSportMode.ts'), /new TennisScore\((\d+)\)/, 'TennisScore')).toBe(MIRRORED.tennisGames);
    const tb = src('components/games/tiebreak-game.tsx');
    expect(num(tb, /const TARGET = (\d+);/, 'tiebreak TARGET')).toBe(MIRRORED.tiebreakTarget);
    expect(tb).toContain('score: myPts * 120 + bestRally * 30');
    expect(tb).toContain('Math.random() < 0.16 + rally * 0.05');
    expect(num(src('lib/babylon/modes/BrainBrawlMode.ts'), /const MAX_ROUNDS = (\d+);/, 'MAX_ROUNDS')).toBe(MIRRORED.brainBrawlMaxRounds);
    const wsi = src('lib/babylon/modes/WhoSceneItMode.ts');
    expect(num(wsi, /const QUESTIONS_PER_CATEGORY = (\d+);/, 'QUESTIONS_PER_CATEGORY')).toBe(MIRRORED.whoSceneItPerCategory);
    expect(wsi).toContain('ctx.end(outcome, p1?.score ?? 0');
    for (const f of ['lib/babylon/modes/KarateVSMode.ts', 'lib/babylon/modes/MixedCombatMode.ts']) {
      const t = src(f);
      expect(num(t, /const ROUNDS_TO_WIN = (\d+);/, `${f} ROUNDS_TO_WIN`)).toBe(MIRRORED.versusRoundsToWin);
      expect(t).toContain('myWins * 100 - foeWins * 40');
    }
  });

  it('dance and training', () => {
    const dance = src('lib/babylon/core/DanceCore.ts');
    expect(dance.split('this.score += points + this.combo * 5').length - 1).toBeGreaterThanOrEqual(1);
    expect(dance).not.toMatch(/this\.score \+= (?!points \+ this\.combo \* 5)/);
    const tr = src('components/games/training-game.tsx');
    expect(num(tr, /const GAME_LEN = (\d+);/, 'GAME_LEN')).toBe(MIRRORED.trainingSec);
    expect([...tr.matchAll(/speed: ([\d.]+) \}/g)].map((m) => Number(m[1]))).toEqual([...MIRRORED.trainingSpeeds]);
    expect([...tr.matchAll(/zoneSize: ([\d.]+),/g)].map((m) => Number(m[1]))).toEqual([0.2, 0.16, 0.13, 0.11]);
    expect(tr).toContain('const lo = 0.45 + Math.random()');
    expect(tr).toContain('power + dt * 0.55 * EXERCISES[exIdx].speed');
    expect(tr).toContain('repsThisEx >= 4');
    expect(tr).toContain('const pts = perfect ? 80 : 50');
    expect(tr).toContain('const bonus = streak >= 3 ? 20 : 0');
  });

  it('music: StudioMode scores PERFORM through PerformSet and nowhere else', () => {
    const studio = src('lib/babylon/music/StudioMode.tsx');
    expect(studio).toContain("import { PerformSet, PERFORM_STEPS_PER_BAR, ARENA_SET_NOTE, performStatusLine } from './performSet'");
    expect(studio).toContain('const STEPS = PERFORM_STEPS_PER_BAR;');
    expect(studio).toContain('set.note(s, t, now)');
    expect(studio).toContain('set.tap(eng.context.currentTime)');
    expect(studio).toContain('if (set.over(now)) endSetRef.current();');
    expect(studio).toContain('const { score, combo } = setRef.current;');
    expect(studio).toContain('setRef.current = new PerformSet({ arena: arenaSet });');   // an Arena set only on an Arena run
    expect(studio).not.toMatch(/new PerformSet\(\{ arena: true \}\)/);                  // never capped by default
    expect(studio).not.toMatch(/setScore\(\(s\) =>/);                            // no second tally beside the set's
    expect(src('lib/babylon/music/AudioEngine.ts')).toMatch(/this\.onStepAudible\?\.\(s\.step, s\.time\)/);   // one note per step
  });

  it('skate: the run, the held links, the coins and the plaza\'s awards', () => {
    const skate = src('lib/babylon/modes/SkateRunMode.ts');
    expect(num(skate, /const RUN_SEC = (\d+);/, 'skate RUN_SEC')).toBe(MIRRORED.skateRunSec);
    expect(skate).toContain('new ComboChain(undefined, \'air\')');
    expect(skate).toContain('const finalScore = combo.banked + coins.collected * 5;');
    expect(skate).toContain('const olliePower = (): number => 0.27 + ollieCharge() * 0.49;');
    // GroundRide: vel.y = 5 + p · 5.5 against −14 m/s² — full charge (p 0.76) hangs 1.31 s
    expect((2 * (5 + (0.27 + 0.49) * 5.5)) / 14).toBeCloseTo(MIRRORED.skateMaxHangSec, 2);
    expect(num(skate, /TRICK_CADENCE_SEC = ([\d.]+);/, 'TRICK_CADENCE_SEC')).toBeGreaterThanOrEqual(SKATE_LINK_SEC);
    const gm = src('lib/babylon/core/GrindManual.ts');
    expect(num(gm, /GRIND_PTS_PER_SEC = (\d+);/, 'GRIND')).toBe(MIRRORED.grindPtsPerSec);
    expect(num(gm, /export const MANUAL_PTS_PER_SEC = (\d+);/, 'MANUAL')).toBe(MIRRORED.manualPtsPerSec);
    expect(num(gm, /NOSEMANUAL_PTS_PER_SEC = (\d+);/, 'NOSEMANUAL')).toBe(MIRRORED.noseManualPtsPerSec);
    expect(num(src('lib/babylon/core/AirControl.ts'), /GRAB_PTS_PER_SEC = (\d+);/, 'GRAB')).toBe(MIRRORED.grabPtsPerSec);
    expect(num(src('lib/babylon/core/Pickups.ts'), /COIN_RUN_CAP = (\d+);/, 'COIN_RUN_CAP')).toBe(MIRRORED.coinRunCap);
    // every combo.add / accrue in the run pays a table award, a rail's bonus, or a per-second rate — nothing bigger
    const calls = [...skate.matchAll(/combo\.(add|accrue)\(([^;]*?), ([^,;]+), '(air|grind|manual|revert)'\)/g)];
    expect(calls.length).toBe(skate.match(/combo\.(add|accrue)\(/g)!.length);
    for (const m of calls) {
      expect(['pts', 'WALL_RIDE.pts', 'WALL_RIDE.plantPts', 'Math.round(WALL_RIDE.ptsPerSec * ridden)', 'gp', 'chainPts', 'Math.round(chainPts * SKETCHY_SCORE_MULT)', 'line.bonus', 'Math.round(r.pts)'], m[0]).toContain(m[3].trim());
    }
    expect(skateLinkMax()).toBe(Math.max(
      ...SKATE_TRICKS.filter((t) => t.kind === 'air').map(basePts), ...Object.values(LIP_TRICKS).map((t) => t.pts + LIP.ptsPerSec * LIP.maxSec),
      WALL_RIDE.pts, WALL_RIDE.plantPts, MIRRORED.boardRailMax,
    ));
  });

  it('no grind line in any board world pays more than boardRailMax', () => {
    // every file that builds a GrindLine (GroundRide's type, the worlds, the configs, the moving rail)
    const files = ['lib/babylon/modes/rideWorlds.ts', 'lib/babylon/modes/skatePlaza.ts', 'lib/babylon/modes/modeConfigs.ts', 'lib/babylon/modes/BoardRunMode.ts', 'lib/babylon/modes/AirSessionMode.ts', 'lib/babylon/core/ParkGoals.ts'];
    let seen = 0;
    for (const f of files) {
      const t = src(f);
      for (const m of t.matchAll(/bonus: (\d+)/g)) { seen++; expect(Number(m[1]), `${f}: ${m[0]}`).toBeLessThanOrEqual(MIRRORED.boardRailMax); }
      for (const m of t.matchAll(/makeRail\([^;]*?, (\d+)\);/g)) { seen++; expect(Number(m[1]), `${f}: ${m[0]}`).toBeLessThanOrEqual(MIRRORED.boardRailMax); }
    }
    // the snow ledges ([x, from, to, bonus] tuples) and the slope's rails (modes/snowSlope.ts, data)
    const ledges = /for \(const \[x, d1, d2, bonus\] of (\[[^;]*?\]) as const\)/.exec(src('lib/babylon/modes/rideWorlds.ts'));
    for (const [, , , bonus] of JSON.parse(ledges![1]) as number[][]) { seen++; expect(bonus).toBeLessThanOrEqual(MIRRORED.boardRailMax); }
    for (const f of SNOW_SLOPE) { seen++; expect(f.bonus, f.kind).toBeLessThanOrEqual(MIRRORED.boardRailMax); }
    expect(seen).toBeGreaterThan(25);
    // …and nothing else in the tree builds one
    const builders = readdirSync(join(process.cwd(), 'lib/babylon'), { recursive: true }).map(String)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f) && /grindLines\.push|lines\.push\(\{ a, b, bonus/.test(src(join('lib/babylon', f))));
    expect(builders.sort()).toEqual(['modes/BoardRunMode.ts', 'modes/SkateRunMode.ts', 'modes/rideWorlds.ts']);   // the lift cable, the patrol rail (ParkGoals), the worlds
    expect(src('lib/babylon/modes/SkateRunMode.ts')).toContain('world.grindLines.push(patrolRail.line);');
  });

  it('surf and snow: the TrickMachine table, the session, the wave, the barrel, the gates', () => {
    expect(Object.values(TRICKS).map((t) => t.pts)).toEqual([...MIRRORED.boardCoreTrickPts]);
    const surf = src('lib/babylon/modes/SurfBreakMode.ts');
    expect(num(surf, /const RUN_SEC = (\d+);/, 'surf RUN_SEC')).toBe(MIRRORED.surfRunSec);
    expect(num(surf, /WAVE_MOVE_LOCK_SEC = ([\d.]+);/, 'WAVE_MOVE_LOCK_SEC')).toBe(MIRRORED.surfWaveMoveLockSec);
    expect(num(surf, /export const FLOW_MAX = (\d+);/, 'FLOW_MAX')).toBe(MIRRORED.surfFlowMax);
    expect(num(surf, /export const BARREL_HOLD_SEC = ([\d.]+);/, 'BARREL_HOLD_SEC')).toBe(MIRRORED.surfBarrelHoldSec);
    expect(num(surf, /export const BARREL_BONUS = (\d+);/, 'BARREL_BONUS')).toBe(MIRRORED.surfBarrelBonus);
    expect(surf).toContain('(trickPts(wave) + Math.round(flow / 4))');
    expect(surf.match(/tricks\.score \+= /g)).toHaveLength(2);                   // a wave move and a barrel; the rest is the machine's
    expect(surf).toContain('rig.rider.jump(0.5 + flow / 200)');                  // a pop: v ≥ 7.75 m/s → ≥ 1.1 s of hang
    expect((2 * (5 + 0.5 * 5.5)) / 14).toBeGreaterThan(3 * BOARD_EVENT_SEC);
    const snow = src('lib/babylon/modes/SnowboardSlalomMode.ts');
    expect(num(src('lib/babylon/modes/rideWorlds.ts'), /export const SLALOM_GATES = (\d+);/, 'SLALOM_GATES')).toBe(MIRRORED.slalomGates);
    expect(num(snow, /tricks\.score \+= (\d+);/, 'gate points')).toBe(MIRRORED.slalomGatePts);
    expect(num(snow, /const YETI_CLEAR_PTS = (\d+);/, 'YETI_CLEAR_PTS')).toBe(MIRRORED.yetiClearPts);
    expect(snow).toContain('yetiDone = true;                       // one appearance per run');
    expect(snow).toContain('Math.max(0, Math.round((60 - elapsed) * 10))');
    expect(MIRRORED.snowTimeBonusMax).toBe(60 * 10);
    expect(snow.match(/tricks\.score \+= /g)).toHaveLength(2);                   // the yeti and a gate
    expect(snow).toContain('rig.rider.jump(0.5 + tuck * 0.5)');
    expect(src('lib/babylon/modes/boardCore.ts')).toContain('this.comboPts += line.bonus * this.combo;');
  });

  it('Free Run: the cap, the tricks, the verbs, the bonuses', () => {
    const fr = src('lib/babylon/modes/FreeRunMode.ts');
    expect(num(fr, /RUN_CAP_PAR = (\d+);/, 'RUN_CAP_PAR')).toBe(MIRRORED.freerunRunCapPar);
    expect(Math.max(...TIERS.map((t) => t.parSec))).toBe(MIRRORED.freerunParSecMax);
    expect(Math.max(...TIERS.map((t) => t.routeBonus))).toBe(MIRRORED.freerunRouteBonusMax);
    expect(Math.max(...Object.values(FREERUN_TRICKS).map((t) => t.pts))).toBe(MIRRORED.freerunTrickPtsMax);
    expect(Math.max(...Object.values(LAUNCH_MULT))).toBe(MIRRORED.freerunLaunchMultMax);
    expect(src('lib/babylon/core/FreeRunCore.ts')).toContain('Math.round((tier.parSec - timeSec) * 25)');
    expect(fr).toContain("combo: new ComboChain(undefined, 'all')");
    const verbs = [...fr.matchAll(/combo\.add\('([A-Z -]+)', (\d+)/g)];
    expect(new Set(verbs.map((m) => m[1])).size + Object.keys(FREERUN_TRICKS).length).toBe(MIRRORED.freerunMoveKeys);
    expect(Math.max(...verbs.map((m) => Number(m[2])))).toBe(MIRRORED.freerunVerbPtsMax);
    expect(fr.match(/combo\.add\(/g)!.length).toBe(verbs.length + 1);            // + the landed trick (label, pts, 'air')
  });

  it('The Hundred: the wave budget and the end card', () => {
    const k = src('lib/babylon/modes/KarateEndlessMode.ts');
    expect(k).toContain(`felTier === 'mobile' ? 12 : ${MIRRORED.karateWaveMax}`);
    expect(k.split('totalKos * 100 + wave * 50 + Math.round(flow.points)').length - 1).toBe(2);   // every ctx.end
    expect(k.match(/ctx\.end\(/g)).toHaveLength(2);
    expect(FREEFLOW.multMax).toBe(4);
  });

  it('Breakaway: every score write, the drives, the touchdown', () => {
    const f = src('lib/babylon/modes/FootballRushMode.ts');
    expect(num(f, /const DRIVES = (\d+);/, 'DRIVES')).toBe(MIRRORED.footballDrives);
    expect(num(f, /const STYLE_CHAIN_PTS = (\d+);/, 'STYLE_CHAIN_PTS')).toBe(MIRRORED.footballStylePts);
    expect(num(f, /const TRUCK_PTS = (\d+);/, 'TRUCK_PTS') * 2).toBe(MIRRORED.footballAwardMax);
    expect(f).toContain('score += Math.round((100 + evades * 10) * mult);');
    expect(f).toContain('const mult = breakawaySec > 0 ? 1.5 : 1;');
    // the score's writers, each named: a new one has to be looked at before it can pay
    const writes = [...f.matchAll(/score \+= ([^;]+);/g)].map((m) => m[1].trim());
    expect(writes).toEqual([
      'bonus', "grade === 'perfect' ? 40 : 15", 'GUNSLING.pts', 'LANES.railPts', 'LANES.rampPts', 'LANES.tunnelPts', 'SLINGSHOT.pts',
      'STIFF.pts', 'BLOCK.catapultPts', '25', 'gained * 5', '20', 'TRUCK_PTS * (breakawaySec > 0 ? 2 : 1)', '20 * mult',
      'Math.round((100 + evades * 10) * mult)',
    ]);
    for (const p of [GUNSLING.pts, SLINGSHOT.pts, STIFF.pts, BLOCK.catapultPts, LANES.railPts, LANES.rampPts, LANES.tunnelPts, 40, 25, 20 * 2, 8 * 5]) expect(p).toBeLessThanOrEqual(MIRRORED.footballAwardMax);
    const types = new Set([...f.matchAll(/styleCredit\(ctx, '(\w+)'\)/g)].map((m) => m[1]));
    for (const m of f.matchAll(/lastDodgeType = e\.btn === 'B' \? '(\w+)' : e\.btn === 'A' \? '(\w+)' : '(\w+)'/g)) [m[1], m[2], m[3]].forEach((t) => types.add(t));
    expect(types.size).toBe(MIRRORED.footballStyleTypes);
    expect(f).toContain("coins.line(new Vector3(-3, 0.4, fromZ + 4), new Vector3(3, 0.4, toZ), 8);");
  });

  it('Game Night: each event\'s clock, points and pace', () => {
    const c = src('lib/babylon/modes/carnivalEvents.ts');
    const ev = (id: string) => /durationSec: (\d+), pointsPerUnit: ([\d.]+)/.exec(c.slice(c.indexOf(`id: '${id}'`)))!;
    const m = MIRRORED;
    expect([Number(ev('slam_rush')[1]), Number(ev('slam_rush')[2])]).toEqual([m.slamRushSec, m.slamRushPpu]);
    expect([Number(ev('strike_storm')[1]), Number(ev('strike_storm')[2])]).toEqual([m.strikeStormSec, m.strikeStormPpu]);
    expect([Number(ev('trick_gauntlet')[1]), Number(ev('trick_gauntlet')[2])]).toEqual([m.trickGauntletSec, m.trickGauntletPpu]);
    expect([Number(ev('hot_shot')[1]), Number(ev('hot_shot')[2])]).toEqual([m.hotShotSec, m.hotShotPpu]);
    expect([Number(ev('coin_storm')[1]), Number(ev('coin_storm')[2])]).toEqual([m.coinStormSec, m.coinStormPpu]);
    expect([Number(ev('counter_strike')[1]), Number(ev('counter_strike')[2])]).toEqual([m.counterStrikeSec, m.counterStrikePpu]);
    expect(c).toContain('charge = 0; cooldown = 0.5;');
    expect(c).toContain("if (e.t === 'button' && e.pressed && !striking && (e.btn === 'A' || e.btn === 'B' || e.btn === 'Y')) {");
    expect(c).toContain('to.scale(13 + p * 7)');
    expect(c).toContain('if (ball.position.z >= 10.9) {');
    expect(c).toContain('.scaleInPlace(6);');
    expect(c).toContain('coins.line(new Vector3(-8, 0.4, -8), new Vector3(8, 0.4, 8), 7);');
    expect(Math.hypot(16, 16) / 6).toBeCloseTo(m.coinStormSpacing, 2);
    expect(src('lib/babylon/core/Pickups.ts')).toContain('magnetRadius = 1.1');
    expect(c).toContain("if (state === 'idle' && stateSec > 0.4 + Math.random() * 0.5) {");
    expect(c).toContain('const TELEGRAPH_SEC = 0.5;');
    expect(c).toContain("state === 'telegraph' && stateSec >= TELEGRAPH_SEC + 0.15");
    expect(c).toContain("state === 'cooldown' && stateSec > 0.6");
    expect(c).toContain("[slamRush(), strikeStorm(), trickGauntlet(), hotShot(), coinStorm(), counterStrike()]");
    expect(c).toContain('if (e.btn === \'X\') tricks.start(TRICKS.spin);');
    expect(src('lib/babylon/modes/CourtCarnivalMode.ts')).toContain('const points = Math.round(raw * S.current.pointsPerUnit);');
  });
});
