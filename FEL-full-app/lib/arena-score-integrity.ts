/**
 * lib/arena-score-integrity.ts — what a staked score may be, decided on the server. PURE: no DB, no network, no Babylon.
 *
 * HOTFIX (2026-09-24): the Arena and the (dark) competition engine settled a Lab Credit pot on ANY non-negative integer
 * the client sent. A duel against a real player was won by typing a bigger number. The dunk card that rides with a
 * Flight Night score was stored and shown to the other player, but its total was never compared with the score, so a
 * forged card could sit next to a forged number.
 *
 * Two checks, both before anything is written:
 *
 *   1. A CEILING PER STAKEABLE MODE, in the pattern of `chainScoreCeiling` (lib/wallet/validation.ts): a count times a
 *      per-unit maximum, from the mode's own rules. A score above it is refused, never settled. Two kinds:
 *        - 'rules' — the rules end the game and every term comes from them (first to 11, five racks of five, four dunks
 *                    of 60, a 32-bar set...). The ceiling is exactly the most the game can award.
 *        - 'bound' — the rules set no maximum (a THPS combo whose multiplier grows with every link, endless waves, a
 *                    drive that ends only on a tackle). The ceiling is a flawless run of the longest length the mode
 *                    allows — its own clock, or UNTIMED_RUN_SEC where it has none — scoring as fast as its cooldowns,
 *                    point tables and combo rule let it, times BOUND_MARGIN. It never refuses a run the game could
 *                    produce inside that length, and it cannot tell a cheat from an expert below it: only replaying the
 *                    run on the server can (queued in the audit ledger, N2-03). A refusal says "the Arena's limit",
 *                    never "the most this mode can award".
 *      lib/arena-score-integrity.test.ts plays a perfect run of maximum length through each mode's real scoring core
 *      (or, for a mode whose core lives in a Babylon file, its formula held to the file) and holds it under the ceiling.
 *
 *   2. THE DUNK CARD ADDS UP. When a Flight Night score arrives with its card, the server recomputes the card's total
 *      from its attempts, checks every attempt against what its own judges could have given it, and refuses a score
 *      that is not the card's total.
 *
 * Constants that live in pure modules are IMPORTED, so a tuning change moves the ceiling with it. Constants that live
 * inside a Babylon mode file (which a server route must not import) are MIRRORED below with the file they come from;
 * the test reads those files and fails the moment one drifts.
 */

import { PERFECT_TOTAL, JUDGE_COUNT } from '@/lib/babylon/core/JudgePanel';
import { ATTEMPT_SCALE, CALL_BONUS } from '@/lib/babylon/core/DunkStakes';
import { BIG_AIR_TUNING } from '@/lib/feel/cores/big-air-constants';
import { RINGS, BANK } from '@/lib/babylon/core/ParkourGolf';
import { TOKEN, TARGETS } from '@/lib/babylon/core/ParkourDerby';
import { REGULATION_KICKS } from '@/lib/babylon/core/ShootoutCore';
import { BREAK } from '@/lib/babylon/core/Breakaway';
import { RUN } from '@/lib/babylon/core/RushRun';
import { challengeScore } from '@/lib/babylon/core/BrainBrawlCore';
import { WHO_SCENE_IT, scoreAnswer } from '@/lib/babylon/core/QuizCore';
import { SCENE_CATEGORIES } from '@/lib/babylon/core/SceneBuzz';
import { JUDGE_WINDOWS, DANCE_LIBRARY } from '@/lib/babylon/core/DanceCore';
import { MAX_SONG_BARS } from '@/lib/babylon/music/Song';
import { performSetMax, PERFORM_SET_BARS, PERFORM_SET_NOTES } from '@/lib/babylon/music/performSet';
import { EVENTS_PER_NIGHT } from '@/lib/babylon/core/CarnivalNight';
import { REPEAT_NO_MULT } from '@/lib/babylon/core/ComboChain';
import { SKATE_TRICKS, SNOW_TRICKS, SURF_TRICKS, basePts } from '@/lib/babylon/core/BoardTricks';
import { WALL_RIDE, LIP, LIP_TRICKS } from '@/lib/babylon/core/WallRide';
import { FREEFLOW } from '@/lib/babylon/core/Freeflow';
import { GUNSLING, SLINGSHOT, STIFF, BLOCK, LANES } from '@/lib/babylon/core/KickoffReturn';
import { parseCard, type DunkCard } from '@/lib/mp/dunkCard';
import { canonicalModeKey } from '@/lib/game-data';

// ---------------------------------------------------------------------------
// Constants mirrored from Babylon mode files (the test holds each one to its source).
// ---------------------------------------------------------------------------

export const MIRRORED = {
  // ── rules modes ──
  /** lib/babylon/modes/DunkMode.ts — TOTAL_ROUNDS, DUNKS_PER_ROUND. A retried miss is not scored and never reaches the card. */
  dunkRounds: 2, dunksPerRound: 2,
  /** lib/babylon/modes/OneVOneMode.ts TARGET_SCORE; lib/babylon/modes/ThreeVThreeMode.ts TARGET_SCORE. */
  onevoneTarget: 11, threevthreeTarget: 21,
  /** Both hoops modes: a jumper is 2 or 3, a dunk 2 — no bucket is worth more than 3. */
  bucketMax: 3,
  /** lib/babylon/modes/ThreePointMode.ts — RACKS, BALLS_PER_RACK; the last ball of a rack is the money ball, worth 2. */
  threePointRacks: 5, threePointBallsPerRack: 5, threePointMoneyWorth: 2,
  /** lib/babylon/modes/precisionModes.ts GolfMode — TOTAL holes, GOLF_PAR, CLUTCH_MULT, a holed ball pays max(20, 120 − rel × 40). */
  golfHoles: 3, golfPar: [3, 4, 3] as readonly number[], clutchMult: 1.5, holeBasePts: 120, holePerStroke: 40,
  /** precisionModes.ts DerbyMode — TOTAL pitches; a homer pays round(q × (80 + launch × 60) × clutch), q ≤ 1, launch ≤ 0.9. */
  derbyPitches: 20, derbyHomerBase: 80, derbyLaunchPts: 60, derbyLaunchMax: 0.9,
  /** precisionModes.ts PenaltyMode — SD_CAP sudden-death kicks, MAX_FEINTS × FEINT_STYLE_PTS, a goal is 20; the
   *  breakaway pays a shot kind up to 15 (+5 kinetic) and +5 a wall run. */
  penaltySdCap: 5, maxFeints: 2, feintStylePts: 8, goalPts: 20, shotStyleMax: 15, kineticStylePts: 5, wallRunStylePts: 5,
  /** lib/babylon/modes/NetSportMode.ts — `new TennisScore(4)`: the match is the first to four games. */
  tennisGames: 4,
  /** components/games/tiebreak-game.tsx — TARGET 7; score = myPts × 120 + bestRally × 30; the AI misses with
   *  probability 0.16 + 0.05 × rally, which is certain from the rally where that reaches 1. */
  tiebreakTarget: 7, tiebreakPointPts: 120, tiebreakRallyPts: 30, tiebreakMissBase: 0.16, tiebreakMissPerRally: 0.05,
  /** lib/babylon/modes/BrainBrawlMode.ts MAX_ROUNDS. */
  brainBrawlMaxRounds: 15,
  /** lib/babylon/modes/WhoSceneItMode.ts QUESTIONS_PER_CATEGORY. */
  whoSceneItPerCategory: 2,
  /** KarateVSMode.ts / MixedCombatMode.ts — ROUNDS_TO_WIN; the result is myWins × 100 − foeWins × 40. */
  versusRoundsToWin: 2, versusWinPts: 100,
  /** lib/babylon/core/DanceCore.ts hit(): a caught step pays its window's points + combo × 5. */
  danceComboPts: 5,
  /** components/games/training-game.tsx — GAME_LEN, the zone floor (0.45), the power ramp (0.55 × speed per second), four
   *  reps an exercise, 80 a perfect rep + 20 on a streak of three. */
  trainingSec: 60, trainingZoneFloor: 0.45, trainingPowerRate: 0.55, trainingRepsPerExercise: 4,
  trainingRepPts: 80, trainingStreakPts: 20, trainingSpeeds: [0.85, 1.0, 1.2, 1.35] as readonly number[],

  // ── bound modes ──
  /** SkateRunMode RUN_SEC; the pop's longest hang (full charge, its own table); CoinField's COIN_RUN_CAP at 5 a coin. */
  skateRunSec: 90, skateMaxHangSec: 1.31, coinRunCap: 60, skateCoinPts: 5,
  /** GrindManual GRIND / MANUAL / NOSEMANUAL_PTS_PER_SEC and AirControl GRAB_PTS_PER_SEC: what a held link pays a second. */
  grindPtsPerSec: 90, manualPtsPerSec: 60, noseManualPtsPerSec: 72, grabPtsPerSec: 40,
  /** The biggest bonus any grind line in the board worlds pays (rideWorlds, skatePlaza, modeConfigs, BoardRunMode…). */
  boardRailMax: 500,
  /** boardCore TRICKS — the TrickMachine's own table (OLLIE, KICKFLIP, HEELFLIP, 360, GRAB). */
  boardCoreTrickPts: [50, 120, 120, 140, 90] as readonly number[],
  /** SurfBreakMode — RUN_SEC, WAVE_MOVE_LOCK_SEC, FLOW_MAX (a wave move pays + flow / 4), BARREL_HOLD_SEC, BARREL_BONUS. */
  surfRunSec: 90, surfWaveMoveLockSec: 0.55, surfFlowMax: 200, surfBarrelHoldSec: 1.5, surfBarrelBonus: 250,
  /** SnowboardSlalomMode — rideWorlds SLALOM_GATES at 100 a gate, YETI_CLEAR_PTS once a run, the time bonus (60 − t) × 10. */
  slalomGates: 30, slalomGatePts: 100, yetiClearPts: 150, snowTimeBonusMax: 600,
  /** FreeRunMode RUN_CAP_PAR × FreeRunCore's longest par (ROOKIE 55 s); FREERUN_TRICKS' best (SIDE FLIP 200) × the best
   *  LAUNCH_MULT (1.5); the biggest verb link (PARRY-VAULT 110); the move keys a combo can hold (17 verbs + 5 tricks);
   *  timeBonus 25 a second under par; the biggest routeBonus (TRACEUR 650). */
  freerunParSecMax: 55, freerunRunCapPar: 3, freerunTrickPtsMax: 200, freerunLaunchMultMax: 1.5, freerunVerbPtsMax: 110,
  freerunMoveKeys: 22, freerunTimeBonusPerSec: 25, freerunRouteBonusMax: 650,
  /** KarateEndlessMode — a wave's bodies (OnslaughtCore waveSpec, the desktop budget 20); the end card pays kos × 100 + wave × 50 + flow. */
  karateWaveMax: 20, karateKoPts: 100, karateWavePts: 50,
  /** FootballRushMode — DRIVES; the biggest single award (a truck in a breakaway, TRUCK_PTS 30 × 2); a TD pays
   *  (100 + evades × 10) × 1.5 in a breakaway; a style chain pays STYLE_CHAIN_PTS × (types − 1) for each of 7 evade types. */
  footballDrives: 3, footballAwardMax: 60, footballTdBase: 100, footballTdPerEvade: 10, footballTdMult: 1.5,
  footballStylePts: 25, footballStyleTypes: 7,
  /** carnivalEvents — each event's clock, its points per unit, and what paces it. */
  slamRushSec: 20, slamRushPpu: 12, slamRushCooldownSec: 0.5,
  strikeStormSec: 15, strikeStormPpu: 8,
  trickGauntletSec: 20, trickGauntletPpu: 0.4,
  hotShotSec: 15, hotShotPpu: 15, hotShotGoalZ: 10.9, hotShotMaxSpeed: 20,
  coinStormSec: 15, coinStormPpu: 6, coinStormSpeed: 6, coinStormMagnet: 1.1, coinStormSpacing: 3.77,
  counterStrikeSec: 15, counterStrikePpu: 14, counterStrikeCycleSec: 0.4 + 0.65 + 0.6,
} as const;

// ---------------------------------------------------------------------------
// The bound model's own numbers — the assumptions a 'bound' ceiling rests on, each stated once.
// ---------------------------------------------------------------------------

/** A bound ceiling is this many times its modelled flawless run: room for what the model rounds away (per-frame
 *  rounding past the frame rate below, an award the model did not list). */
export const BOUND_MARGIN = 2;
/** A mode with no clock — endless waves, a drive that ends only on a tackle, a slope a rider can stall on — is modelled
 *  as a flawless run this long. Nothing in those modes stops a longer run; that is why their refusal names the Arena's
 *  limit. TUNE(elijah). */
export const UNTIMED_RUN_SEC = 30 * 60;
/** The fastest display the model allows for (a per-frame award pays at most once a frame). */
export const MAX_FRAME_HZ = 240;
/** Skate: a new combo link every 0.1 s — faster than the plaza allows (the trick cadence alone is 0.18 s, and every other
 *  link needs a pop, a landing or a flick pair). An air chain lands as ONE link worth its tricks, which never beats a
 *  link per trick at this pace. */
export const SKATE_LINK_SEC = 0.1;
/** Snow, surf and the gauntlet: a landing or a rail every 0.3 s — a pop hangs 1.1 s or more on flat ground or water. */
export const BOARD_EVENT_SEC = 0.3;
/** Free Run: a new combo link every 0.1 s (a vault, a slide, a kick, a landed flip…). */
export const FREERUN_LINK_SEC = 0.1;
/** The Hundred: a swing every 0.1 s (a strike lands 0.24 s in; a queued press fires at the 0.4 s cancel point). */
export const KARATE_SWING_SEC = 0.1;
/** Breakaway: a scoring event every 0.1 s (an evade, a truck, a lane, a coin…). */
export const FOOTBALL_EVENT_SEC = 0.1;

// ---------------------------------------------------------------------------
// The dunk contest (chainScoreCeiling's own family: a count × a per-unit maximum)
// ---------------------------------------------------------------------------

/** The biggest multiplier the stakes put on a judged panel: the first attempt (× 1) with a called trick that landed. */
export const DUNK_MAX_SCALE = Math.max(...ATTEMPT_SCALE) * Math.max(1, CALL_BONUS);
/** One attempt's most: a perfect panel (5 judges × 10) at that multiplier — 60. */
export const DUNK_ATTEMPT_MAX = Math.round(PERFECT_TOTAL * DUNK_MAX_SCALE);
/** Attempts on one night's card. */
export const DUNK_CONTEST_ATTEMPTS = MIRRORED.dunkRounds * MIRRORED.dunksPerRound;
/** Highest judge card. */
export const JUDGE_CARD_MAX = PERFECT_TOTAL / JUDGE_COUNT;

/** What an attempt can total given the judges the card shows: the judges it does not show gave 10 at most. */
export function dunkAttemptCeiling(judges: readonly number[]): number {
  const shown = judges.slice(0, JUDGE_COUNT);
  const sum = shown.reduce((s, j) => s + j, 0) + (JUDGE_COUNT - shown.length) * JUDGE_CARD_MAX;
  return Math.round(sum * DUNK_MAX_SCALE);
}

// ---------------------------------------------------------------------------
// Rules ceilings that need a little arithmetic
// ---------------------------------------------------------------------------

/** First to `target`: the last bucket crosses it from target − 1. */
export function firstToCeiling(target: number, maxPerScore: number): number {
  return target - 1 + maxPerScore;
}

/** Big Air: most turns a boosted launch can spin before touchdown. The test RUNS the real big-air core at full boost with
 *  the spin started at take-off and holds this above what it measures (≈ 4.7 turns). */
export const BIG_AIR_MAX_TURNS = 5;
export function bigAirCeiling(): number {
  const t = BIG_AIR_TUNING;
  const perAttempt = Math.round((t.basePoints + BIG_AIR_MAX_TURNS * t.pointsPerRotation) * Math.max(...Object.values(t.gradePoints)));
  return t.attemptsPerRound * perAttempt;
}

/** Golf: a hole in one on every hole (the last one clutch), both rings, and the bank ride. */
export function golfCeiling(): number {
  const m = MIRRORED;
  let total = 0;
  for (let h = 0; h < m.golfHoles; h++) {
    const par = m.golfPar[Math.min(h, m.golfPar.length - 1)];
    const rel = 1 - par;                                            // one stroke
    const clutch = h === m.golfHoles - 1 ? m.clutchMult : 1;
    total += Math.round(Math.max(20, m.holeBasePts - rel * m.holePerStroke) * clutch);
    total += RINGS.pts * (1 + (RINGS.at.length - 1) * RINGS.chainMult);   // first ring, then the chained ones
    total += BANK.pts;
  }
  return total;
}

/** Derby: every pitch a perfect clutch homer, and each glass target's ×2 token spent on one of them. */
export function derbyCeiling(): number {
  const m = MIRRORED;
  const homerMax = Math.round(1 * (m.derbyHomerBase + m.derbyLaunchMax * m.derbyLaunchPts) * m.clutchMult);
  const targetMax = Math.max(...TARGETS.map((t) => t.pts));
  const perPitch = Math.max(homerMax, targetMax);
  const tokens = TARGETS.filter((t) => t.kind === 'glass').length;
  return m.derbyPitches * perPitch + tokens * perPitch * (TOKEN.mult - 1);
}

/** Penalties: every kick of regulation + sudden death a goal with every style point the breakaway can pay. A wall run
 *  ends by pushing off the glass at 2 m/s, and the next needs the run turned back into it at RUN.lateralAccel — so no
 *  more than one each 2 / lateralAccel seconds of the breakaway clock. */
export function penaltyCeiling(): number {
  const m = MIRRORED;
  const kicks = REGULATION_KICKS + m.penaltySdCap;
  const wallRuns = Math.ceil(BREAK.clockSec * RUN.lateralAccel / 2) + 1;
  const perGoal = m.goalPts + m.maxFeints * m.feintStylePts + m.shotStyleMax + m.kineticStylePts + wallRuns * m.wallRunStylePts;
  return kicks * perGoal;
}

/** Tiebreak: seven points and the longest rally the AI can survive. */
export function tiebreakCeiling(): number {
  const m = MIRRORED;
  const longestRally = Math.ceil((1 - m.tiebreakMissBase) / m.tiebreakMissPerRally - 1e-9);   // 17: from there the AI always misses
  return m.tiebreakTarget * m.tiebreakPointPts + longestRally * m.tiebreakRallyPts;
}

/** Brain Brawl: every round of the cap a tier-3 card answered on the first tick. */
export function brainBrawlCeiling(): number {
  return MIRRORED.brainBrawlMaxRounds * challengeScore(true, 1, 1, 3);
}

/** Who Scene It: every question of the match answered instantly, the streak multiplier climbing all the way. */
export function whoSceneItCeiling(): number {
  const questions = SCENE_CATEGORIES.length * MIRRORED.whoSceneItPerCategory;
  let total = 0;
  for (let i = 0; i < questions; i++) total += scoreAnswer(WHO_SCENE_IT, true, WHO_SCENE_IT.timeLimit, i).points;
  return total;
}

/** Dance: the longest chart a player's exported song can hold (every step on its shortest clip), every step PERFECT. */
export function danceCeiling(): number {
  const minClipBeats = Math.min(...DANCE_LIBRARY.map((c) => c.beats));
  const steps = Math.floor((MAX_SONG_BARS * 4) / minClipBeats);
  const perfect = Math.max(...JUDGE_WINDOWS.map((w) => w.points));
  return steps * perfect + MIRRORED.danceComboPts * (steps * (steps + 1)) / 2;
}

/** Iron Paradise: the most reps the power ramp allows in the minute (four on each of the first exercises, then the fastest). */
export function trainingCeiling(): number {
  const m = MIRRORED;
  const repSec = (speed: number) => m.trainingZoneFloor / (m.trainingPowerRate * speed);
  let left = m.trainingSec, reps = 0;
  for (let i = 0; i < m.trainingSpeeds.length; i++) {
    const last = i === m.trainingSpeeds.length - 1;
    const n = last ? Math.floor(left / repSec(m.trainingSpeeds[i]) + 1e-9) : Math.min(m.trainingRepsPerExercise, Math.floor(left / repSec(m.trainingSpeeds[i]) + 1e-9));
    reps += n; left -= n * repSec(m.trainingSpeeds[i]);
  }
  return reps * (m.trainingRepPts + m.trainingStreakPts);
}

// ---------------------------------------------------------------------------
// Bound ceilings: a flawless run of the longest length the mode allows (see the header), before BOUND_MARGIN
// ---------------------------------------------------------------------------

/**
 * A combo run: `sec` of play with a scoring event every `eventSec` (so at most floor(sec / eventSec) + 1 events), each
 * paying at most `perEvent` times the multiplier, which rises by one with every event up to `multCap`; `accrualPerSec`
 * more on the open link at the top multiplier the whole time; and `flat` on top. Every term is a maximum, so any run
 * with no more events, no bigger award and no faster accrual scores no more — the count-times-maximum pattern of
 * chainScoreCeiling, with the combo's multiplier in it.
 */
export function chainRunBound(o: { sec: number; eventSec: number; perEvent: number; multCap?: number; accrualPerSec?: number; flat?: number }): number {
  const events = Math.floor(o.sec / o.eventSec + 1e-9) + 1;
  const cap = o.multCap ?? Infinity;
  let total = 0;
  for (let i = 1; i <= events; i++) total += o.perEvent * Math.min(i, cap);
  total += (o.accrualPerSec ?? 0) * o.sec * Math.min(events, cap);
  return total + (o.flat ?? 0);
}

/** A per-frame accrual of `rate` points a second, rounded each frame, pays at most one point a frame up to 2 × rate
 *  frames a second (round(0.5) = 1) — so never more than twice its rate, whatever the display. */
export const frameRoundedRate = (rate: number): number => 2 * rate;

const maxOf = (xs: readonly number[]): number => Math.max(...xs);
const airPts = (tricks: typeof SKATE_TRICKS): number[] => tricks.filter((t) => t.kind === 'air').map(basePts);

/** Skate: the largest single award a link can pay in the plaza — a trick, a lip stall held to its longest, the wall, the
 *  plant, a rail's bonus, a grab held for the longest hang. */
export function skateLinkMax(): number {
  const m = MIRRORED;
  return Math.max(
    maxOf(airPts(SKATE_TRICKS)),
    maxOf(Object.values(LIP_TRICKS).map((t) => t.pts)) + LIP.ptsPerSec * LIP.maxSec,
    WALL_RIDE.pts, WALL_RIDE.plantPts, m.boardRailMax, Math.round(m.grabPtsPerSec * m.skateMaxHangSec),
  );
}
/** Venice Lines: one unbroken combo for the whole run, a link every SKATE_LINK_SEC, each the largest award, the held link
 *  accruing at the fastest frame-rounded rate the whole time, and every coin. ComboChain's multiplier is its link count. */
export function skateBound(): number {
  const m = MIRRORED;
  return chainRunBound({
    sec: m.skateRunSec, eventSec: SKATE_LINK_SEC, perEvent: skateLinkMax(),
    accrualPerSec: frameRoundedRate(Math.max(m.grindPtsPerSec, m.manualPtsPerSec, m.noseManualPtsPerSec, WALL_RIDE.ptsPerSec, LIP.ptsPerSec)),
    flat: m.coinRunCap * m.skateCoinPts,
  });
}

/** A TrickMachine combo's multiplier counts links whose move was repeated fewer than REPEAT_NO_MULT times, so it can
 *  never pass REPEAT_NO_MULT × the distinct moves the machine can be handed. */
const trickMachineMultCap = (moves: number): number => REPEAT_NO_MULT * moves;

/** The Break: a landing every BOARD_EVENT_SEC for the session (surf's airs or boardCore's grab, whichever pays most), a
 *  wave move every WAVE_MOVE_LOCK_SEC at full flow, and a barrel every BARREL_HOLD_SEC. */
export function surfBound(): number {
  const m = MIRRORED;
  const airs = chainRunBound({
    sec: m.surfRunSec, eventSec: BOARD_EVENT_SEC,
    perEvent: Math.max(maxOf(airPts(SURF_TRICKS)), maxOf(m.boardCoreTrickPts)),
    multCap: trickMachineMultCap(SURF_TRICKS.length + m.boardCoreTrickPts.length),
  });
  const waveMoves = (Math.floor(m.surfRunSec / m.surfWaveMoveLockSec) + 1)
    * (maxOf(SURF_TRICKS.filter((t) => t.kind !== 'air').map(basePts)) + Math.round(m.surfFlowMax / 4));
  const barrels = Math.floor(m.surfRunSec / m.surfBarrelHoldSec) * m.surfBarrelBonus;
  return airs + waveMoves + barrels;
}

/** Gate Crasher: no clock (a rider can stall on the slope), so UNTIMED_RUN_SEC of a landing or a rail every
 *  BOARD_EVENT_SEC — each the biggest trick or rail — plus every gate, the yeti and the whole time bonus. */
export function snowBound(): number {
  const m = MIRRORED;
  return chainRunBound({
    sec: UNTIMED_RUN_SEC, eventSec: BOARD_EVENT_SEC,
    perEvent: Math.max(maxOf(airPts(SNOW_TRICKS)), maxOf(m.boardCoreTrickPts), m.boardRailMax),
    multCap: trickMachineMultCap(SNOW_TRICKS.length + m.boardCoreTrickPts.length + 1),   // + the GRIND link
    flat: m.slalomGates * m.slalomGatePts + m.yetiClearPts + m.snowTimeBonusMax,
  });
}

/** Free Run: RUN_CAP_PAR × the longest par, a link every FREERUN_LINK_SEC at the biggest award (ComboChain 'all': the
 *  multiplier stops at REPEAT_NO_MULT × the move keys), plus the whole time bonus and the biggest route bonus. */
export function freerunBound(): number {
  const m = MIRRORED;
  return chainRunBound({
    sec: m.freerunParSecMax * m.freerunRunCapPar, eventSec: FREERUN_LINK_SEC,
    perEvent: Math.max(Math.round(m.freerunTrickPtsMax * m.freerunLaunchMultMax), m.freerunVerbPtsMax),
    multCap: REPEAT_NO_MULT * m.freerunMoveKeys,
    flat: m.freerunParSecMax * m.freerunTimeBonusPerSec + m.freerunRouteBonusMax,
  });
}

/** The Hundred: endless waves, so UNTIMED_RUN_SEC of a swing every KARATE_SWING_SEC, each downing a whole wave — every
 *  body a KO, a cleared wave, and a flow hit at the top multiplier. */
export function karateEndlessBound(): number {
  const m = MIRRORED;
  const swings = Math.floor(UNTIMED_RUN_SEC / KARATE_SWING_SEC + 1e-9) + 1;
  return swings * m.karateWaveMax * (m.karateKoPts + m.karateWavePts + FREEFLOW.hitPts * FREEFLOW.multMax);
}

/** Breakaway: a drive ends only on a touchdown or a tackle, so UNTIMED_RUN_SEC of a scoring event every
 *  FOOTBALL_EVENT_SEC at the biggest award, every one an evade that swells the touchdowns, every drive a breakaway
 *  touchdown, and every style chain. */
export function footballBound(): number {
  const m = MIRRORED;
  const events = Math.floor(UNTIMED_RUN_SEC / FOOTBALL_EVENT_SEC + 1e-9) + 1;
  const award = Math.max(m.footballAwardMax, GUNSLING.pts, SLINGSHOT.pts, STIFF.pts, BLOCK.catapultPts, LANES.railPts, LANES.rampPts, LANES.tunnelPts);
  const touchdowns = m.footballDrives * Math.round((m.footballTdBase + m.footballTdPerEvade * events) * m.footballTdMult);
  let style = 0;
  for (let k = 2; k <= m.footballStyleTypes; k++) style += m.footballStylePts * (k - 1);
  return events * award + touchdowns + m.footballDrives * style;
}

/** Game Night: each event's most in its own clock, in Carnival Points. */
export function carnivalEventBounds(): Record<string, number> {
  const m = MIRRORED;
  const gauntletRaw = chainRunBound({
    sec: m.trickGauntletSec, eventSec: BOARD_EVENT_SEC, perEvent: maxOf(m.boardCoreTrickPts),
    multCap: trickMachineMultCap(m.boardCoreTrickPts.length),
  });
  // coin storm: past a coin and its twin at the cross's centre, the next coin is at least a spacing away, less the magnet's
  // reach at both ends; the stick's corner is √2 of full speed, and each fresh pattern can drop its first coin underfoot
  const coinReach = m.coinStormSpacing - 2 * m.coinStormMagnet;
  const coins = 2 * (Math.floor((m.coinStormSec * m.coinStormSpeed * Math.SQRT2) / coinReach) + 1);
  return {
    slam_rush: (Math.floor(m.slamRushSec / m.slamRushCooldownSec) + 1) * m.slamRushPpu,
    strike_storm: (m.strikeStormSec * MAX_FRAME_HZ + 1) * m.strikeStormPpu,
    trick_gauntlet: Math.round(gauntletRaw * m.trickGauntletPpu),
    hot_shot: (Math.floor(m.hotShotSec / (m.hotShotGoalZ / m.hotShotMaxSpeed)) + 1) * m.hotShotPpu,
    coin_storm: coins * m.coinStormPpu,
    counter_strike: (Math.floor(m.counterStrikeSec / m.counterStrikeCycleSec) + 1) * m.counterStrikePpu,
  };
}
/** A night is EVENTS_PER_NIGHT events (a named night included), any of which may be the biggest one again. */
export function carnivalBound(): number {
  return EVENTS_PER_NIGHT * maxOf(Object.values(carnivalEventBounds()));
}

// ---------------------------------------------------------------------------
// The table — one row per stakeable mode (every ARENA_MODES key; the test holds that)
// ---------------------------------------------------------------------------

export type CeilingKind = 'rules' | 'bound';

export interface ScoreCeiling {
  /** Highest score a stake accepts. */
  max: number;
  kind: CeilingKind;
  /** Player-facing: where the number comes from, in a phrase. */
  why: string;
  /** Where the number comes from, in full. Required — an uncited ceiling is a guess. */
  basis: string;
  /** The arena route mounts a different game (2D/3D fallback, another scale) when NEXT_PUBLIC_DISABLE_3D=1. */
  swapsUnderKillSwitch: boolean;
}

const m = MIRRORED;
const bound = (run: number): number => Math.round(run * BOUND_MARGIN);
const untimedMin = Math.round(UNTIMED_RUN_SEC / 60);

export const SCORE_CEILINGS: Readonly<Record<string, ScoreCeiling>> = {
  dunkContest: {
    max: DUNK_CONTEST_ATTEMPTS * DUNK_ATTEMPT_MAX, kind: 'rules', swapsUnderKillSwitch: true,
    why: `${DUNK_CONTEST_ATTEMPTS} dunks, and no dunk can total more than ${DUNK_ATTEMPT_MAX}`,
    basis: `DunkMode ${m.dunkRounds} rounds × ${m.dunksPerRound} dunks (a retried miss is not scored) × round(PERFECT_TOTAL ${PERFECT_TOTAL} × ATTEMPT_SCALE[0] × CALL_BONUS ${CALL_BONUS})`,
  },
  hoops1v1: {
    max: firstToCeiling(m.onevoneTarget, m.bucketMax), kind: 'rules', swapsUnderKillSwitch: true,
    why: `the game ends at ${m.onevoneTarget} and no bucket is worth more than ${m.bucketMax}`,
    basis: `OneVOneMode TARGET_SCORE ${m.onevoneTarget}: ${m.onevoneTarget - 1} + a ${m.bucketMax}`,
  },
  hoops3v3: {
    max: firstToCeiling(m.threevthreeTarget, m.bucketMax), kind: 'rules', swapsUnderKillSwitch: true,
    why: `the game ends at ${m.threevthreeTarget} and no bucket is worth more than ${m.bucketMax}`,
    basis: `ThreeVThreeMode TARGET_SCORE ${m.threevthreeTarget}: ${m.threevthreeTarget - 1} + a ${m.bucketMax} (the buzzer only ends it lower)`,
  },
  threePoint: {
    max: m.threePointRacks * ((m.threePointBallsPerRack - 1) + m.threePointMoneyWorth), kind: 'rules', swapsUnderKillSwitch: true,
    why: `${m.threePointRacks} racks of ${m.threePointBallsPerRack}, each with one ${m.threePointMoneyWorth}-point money ball`,
    basis: 'ThreePointMode RACKS × (4 balls × 1 + the money ball × 2); a playoff re-shoots from 0',
  },
  bigAir: {
    max: bigAirCeiling(), kind: 'rules', swapsUnderKillSwitch: true,
    why: `${BIG_AIR_TUNING.attemptsPerRound} hits, each at most ${BIG_AIR_MAX_TURNS} turns stuck`,
    basis: `BIG_AIR_TUNING attemptsPerRound × round((basePoints + ${BIG_AIR_MAX_TURNS} turns × pointsPerRotation) × gradePoints.stuck); ${BIG_AIR_MAX_TURNS} turns is above the full-boost air the core allows (measured by the test)`,
  },
  golf: {
    max: golfCeiling(), kind: 'rules', swapsUnderKillSwitch: true,
    why: `${m.golfHoles} holes in one (the last clutch), every ring and the bank ride`,
    basis: 'precisionModes GolfMode: Σ holes max(20, 120 − (1 − par) × 40) × clutch on the last + ParkourGolf RINGS (first + chained) + BANK.pts',
  },
  baseball: {
    max: derbyCeiling(), kind: 'rules', swapsUnderKillSwitch: true,
    why: `${m.derbyPitches} pitches, each at most a perfect clutch homer, two of them doubled by the glass tokens`,
    basis: 'precisionModes DerbyMode TOTAL pitches × round(q 1 × (80 + 0.9 × 60) × CLUTCH_MULT) + each ParkourDerby glass TARGET\'s TOKEN ×2 once',
  },
  soccer: {
    max: penaltyCeiling(), kind: 'rules', swapsUnderKillSwitch: true,
    why: `${REGULATION_KICKS + m.penaltySdCap} kicks, each a goal with every style point the breakaway pays`,
    basis: 'PenaltyMode (REGULATION_KICKS + SD_CAP) × (20 + feints + shot kind + kinetic + wall runs × 5), wall runs ≤ ceil(BREAK.clockSec × RUN.lateralAccel / 2) + 1',
  },
  tennis: {
    max: m.tennisGames, kind: 'rules', swapsUnderKillSwitch: true,
    why: `the match ends at ${m.tennisGames} games`,
    basis: `NetSportMode new TennisScore(${m.tennisGames}); the score is games won`,
  },
  tiebreak: {
    max: tiebreakCeiling(), kind: 'rules', swapsUnderKillSwitch: false,
    why: `${m.tiebreakTarget} points and a rally no longer than the AI can survive`,
    basis: 'tiebreak-game TARGET × 120 + bestRally × 30, bestRally ≤ the rally at which 0.16 + 0.05 × rally reaches 1',
  },
  brainBrawl: {
    max: brainBrawlCeiling(), kind: 'rules', swapsUnderKillSwitch: false,
    why: `${m.brainBrawlMaxRounds} rounds, each at most a tier-3 card answered instantly`,
    basis: 'BrainBrawlMode MAX_ROUNDS × challengeScore(correct, full clock, tier 3)',
  },
  whoSceneIt: {
    max: whoSceneItCeiling(), kind: 'rules', swapsUnderKillSwitch: true,
    why: `${SCENE_CATEGORIES.length * m.whoSceneItPerCategory} questions, all instant, the streak maxed`,
    basis: 'SCENE_CATEGORIES × QUESTIONS_PER_CATEGORY questions, each scoreAnswer(WHO_SCENE_IT, correct, full clock, streak)',
  },
  karateVersus: {
    max: m.versusRoundsToWin * m.versusWinPts, kind: 'rules', swapsUnderKillSwitch: true,
    why: `the match ends at ${m.versusRoundsToWin} round wins`,
    basis: 'KarateVSMode myWins × 100 − foeWins × 40, myWins ≤ ROUNDS_TO_WIN',
  },
  mixedcombat: {
    max: m.versusRoundsToWin * m.versusWinPts, kind: 'rules', swapsUnderKillSwitch: false,
    why: `the match ends at ${m.versusRoundsToWin} round wins`,
    basis: 'MixedCombatMode myWins × 100 − foeWins × 40, myWins ≤ ROUNDS_TO_WIN',
  },
  dance: {
    max: danceCeiling(), kind: 'rules', swapsUnderKillSwitch: false,
    why: 'the longest chart a song can hold, every step PERFECT',
    basis: 'MAX_SONG_BARS × 4 beats ÷ the shortest DANCE_LIBRARY clip = steps; Σ (PERFECT 300 + combo × 5)',
  },
  training: {
    max: trainingCeiling(), kind: 'rules', swapsUnderKillSwitch: false,
    why: 'the most reps the power bar allows in the minute, each perfect on a streak',
    basis: 'training-game GAME_LEN ÷ (zone floor 0.45 ÷ (0.55 × speed)) reps × (80 + 20)',
  },
  // HOTFIX (2026-09-24): keyed 'music', the key the Arena, the catalogue and the Academy's GameShell use (lib/game-data.ts
  // LEGACY_MODE_KEYS). A duel stored as 'musicAcademy' finds this row through canonicalStakeMode.
  music: {
    max: performSetMax(), kind: 'rules', swapsUnderKillSwitch: false,
    why: `a ${PERFORM_SET_BARS}-bar set, every one of its ${PERFORM_SET_NOTES} notes hit PERFECT in one combo`,
    basis: 'performSet PERFORM_SET_NOTES (PERFORM_SET_BARS × 16 steps, every step a note), each performHitPoints(PERFECT, combo) = 100 × (1 + floor(combo / 5)); the set ends itself after its last note',
  },
  // ── bound: the rules set no maximum (see the header) ──────────────────────────────────────────────────────────────
  skateboarding: {
    max: bound(skateBound()), kind: 'bound', swapsUnderKillSwitch: true,
    why: `${BOUND_MARGIN}× a flawless ${m.skateRunSec}-second run: one combo, a new link every ${SKATE_LINK_SEC} s, each the plaza's biggest award`,
    basis: 'chainRunBound(RUN_SEC 90, SKATE_LINK_SEC, the largest trick / lip / wall / plant / rail / grab award, held links at 2× the fastest per-second rate) + COIN_RUN_CAP × 5, × BOUND_MARGIN — ComboChain\'s multiplier is its link count, and grinds and manuals never decay',
  },
  surfing: {
    max: bound(surfBound()), kind: 'bound', swapsUnderKillSwitch: true,
    why: `${BOUND_MARGIN}× a flawless ${m.surfRunSec}-second session: a landing every ${BOARD_EVENT_SEC} s, every wave move and every barrel`,
    basis: 'chainRunBound(RUN_SEC 90, BOARD_EVENT_SEC, the best air, TrickMachine\'s multiplier cap) + a wave move each WAVE_MOVE_LOCK_SEC at FLOW_MAX + a barrel each BARREL_HOLD_SEC, × BOUND_MARGIN',
  },
  snowboarding: {
    max: bound(snowBound()), kind: 'bound', swapsUnderKillSwitch: true,
    why: `${BOUND_MARGIN}× a flawless ${untimedMin}-minute run: a landing or a rail every ${BOARD_EVENT_SEC} s, every gate`,
    basis: 'no clock (the run ends at the last gate, and a rider can stall on the slope): chainRunBound(UNTIMED_RUN_SEC, BOARD_EVENT_SEC, the biggest trick or rail, TrickMachine\'s multiplier cap) + gates + yeti + the time bonus, × BOUND_MARGIN',
  },
  freerun: {
    max: bound(freerunBound()), kind: 'bound', swapsUnderKillSwitch: false,
    why: `${BOUND_MARGIN}× a flawless run to the time cap: a new link every ${FREERUN_LINK_SEC} s at the biggest award`,
    basis: 'chainRunBound(ROOKIE par 55 × RUN_CAP_PAR, FREERUN_LINK_SEC, SIDE FLIP 200 × LAUNCH_MULT 1.5, REPEAT_NO_MULT × 22 move keys) + the time and route bonuses, × BOUND_MARGIN',
  },
  karateEndless: {
    max: bound(karateEndlessBound()), kind: 'bound', swapsUnderKillSwitch: true,
    why: `${BOUND_MARGIN}× a flawless ${untimedMin}-minute run: a swing every ${KARATE_SWING_SEC} s, each downing a whole wave`,
    basis: 'endless waves: UNTIMED_RUN_SEC ÷ KARATE_SWING_SEC swings × a wave of 20 × (a KO 100 + a wave 50 + FREEFLOW.hitPts × multMax), × BOUND_MARGIN',
  },
  carnival: {
    max: bound(carnivalBound()), kind: 'bound', swapsUnderKillSwitch: false,
    why: `${BOUND_MARGIN}× ${EVENTS_PER_NIGHT} of the biggest event, each played flawlessly to its clock`,
    basis: 'EVENTS_PER_NIGHT × the largest carnivalEventBounds() (each event\'s clock ÷ what paces it × pointsPerUnit; the gauntlet through chainRunBound), × BOUND_MARGIN',
  },
  football: {
    max: bound(footballBound()), kind: 'bound', swapsUnderKillSwitch: true,
    why: `${BOUND_MARGIN}× a flawless ${untimedMin}-minute run: an award every ${FOOTBALL_EVENT_SEC} s and a breakaway touchdown every drive`,
    basis: 'no clock (a drive ends on a touchdown or a tackle): UNTIMED_RUN_SEC ÷ FOOTBALL_EVENT_SEC events × the biggest award + DRIVES × (100 + 10 × evades) × 1.5 + every style chain, × BOUND_MARGIN',
  },
};

/**
 * Registry / route keys the competition engine may carry (CompetitionBridge posts 'skateboard' | 'snowboard_slalom' |
 * 'surf') mapped onto the arena keys the table uses. An arena duel already carries an arena key.
 */
export const STAKE_MODE_ALIASES: Readonly<Record<string, string>> = {
  dunk: 'dunkContest', onevone: 'hoops1v1', threevthree: 'hoops3v3', threepoint: 'threePoint',
  skateboard: 'skateboarding', snowboard_slalom: 'snowboarding', surf: 'surfing', bigair: 'bigAir',
  derby: 'baseball', penalty: 'soccer', brainbrawl: 'brainBrawl', who_scene_it: 'whoSceneIt',
  karate: 'karateEndless', karate_vs: 'karateVersus',
};

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

export function canonicalStakeMode(mode: string): string {
  if (own(SCORE_CEILINGS, mode)) return mode;
  if (own(STAKE_MODE_ALIASES, mode)) return STAKE_MODE_ALIASES[mode];   // own keys only: '__proto__' is not a mode
  // HOTFIX (2026-09-24): a duel stored under an old catalogue key ('musicAcademy') still finds its ceiling. The one
  // table of old spellings lives in lib/game-data.ts, and it too reads own keys only.
  return canonicalModeKey(mode);
}

export function scoreCeilingFor(mode: string): ScoreCeiling | null {
  const key = canonicalStakeMode(String(mode ?? ''));
  return own(SCORE_CEILINGS, key) ? SCORE_CEILINGS[key] : null;
}

/**
 * NEXT_PUBLIC_DISABLE_3D=1 serves the 2D/3D fallback games, whose scores run on other scales.
 * HOTFIX (2026-09-24): read as the LITERAL `process.env.NEXT_PUBLIC_DISABLE_3D`, exactly as components/three/flags.ts
 * reads it, so the build inlines the same value into the server route as into the client that picks the game. A default
 * parameter `env = process.env` read the runtime env on the server while the client kept the build's value: a flag set
 * or unset without a rebuild made the server judge a game the client was not playing. `env` is for tests only.
 */
export function killSwitchOn(env?: Record<string, string | undefined>): boolean {
  const flag = env ? env.NEXT_PUBLIC_DISABLE_3D : process.env.NEXT_PUBLIC_DISABLE_3D;
  return flag === '1';
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

export type StakeRefusal =
  | 'SCORE_INVALID'
  | 'NO_SCORE_CEILING'
  | 'SCORE_ABOVE_CEILING'
  | 'CARD_TOO_MANY_ATTEMPTS'
  | 'CARD_ATTEMPT_INVALID'
  | 'CARD_TOTAL_MISMATCH'
  | 'SCORE_CARD_MISMATCH';

export type StakeCheck =
  | { ok: true; card: DunkCard | null; ceiling: ScoreCeiling; ceilingApplied: boolean }
  | { ok: false; code: StakeRefusal; detail: string };

/** HTTP status for a refused score: the request is well-formed, the score is not one the Arena can settle. */
export const STAKE_REFUSAL_STATUS = 422;

const NOT_RECORDED = 'The score was not recorded and nothing was settled.';

/**
 * The refusal's words, by the kind of ceiling. A 'rules' ceiling is the most the game can award, and says so. A 'bound'
 * ceiling is the Arena's limit on a mode with no maximum: it must not claim the score is impossible, only that a run
 * that big cannot be checked yet.
 */
export function aboveCeilingDetail(score: number, c: ScoreCeiling): string {
  return c.kind === 'rules'
    ? `${score} is more than this mode can award: ${c.max} (${c.why}). ${NOT_RECORDED}`
    : `${score} is above the Arena's limit for this mode, ${c.max} (${c.why}). A run past that limit can't be verified yet. ${NOT_RECORDED}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isWhole = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/**
 * Check a Flight Night score against the card sent with it. No card (or one that does not parse at all) is not an
 * error — a client that sends none settles on the ceiling alone, exactly as before cards existed; the parsed card is
 * returned for storage only when it adds up.
 */
export function checkDunkCard(score: number, raw: unknown): { ok: true; card: DunkCard | null } | { ok: false; code: StakeRefusal; detail: string } {
  if (raw === undefined || raw === null) return { ok: true, card: null };
  const card = parseCard(raw);
  if (!card || !isObj(raw) || !Array.isArray(raw.attempts)) return { ok: true, card: null };
  const attempts = raw.attempts as unknown[];
  if (attempts.length > DUNK_CONTEST_ATTEMPTS) {
    return { ok: false, code: 'CARD_TOO_MANY_ATTEMPTS', detail: `The dunk card lists ${attempts.length} dunks; a Flight Night card holds ${DUNK_CONTEST_ATTEMPTS}. ${NOT_RECORDED}` };
  }
  let total = 0;
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    const bad = (why: string) => ({ ok: false as const, code: 'CARD_ATTEMPT_INVALID' as const, detail: `Dunk ${i + 1} on the card ${why}. ${NOT_RECORDED}` });
    if (!isObj(a)) return bad('is not a dunk');
    const judges = a.judges === undefined ? [] : a.judges;
    if (!Array.isArray(judges) || judges.length > JUDGE_COUNT || !judges.every((j) => isWhole(j, 0, JUDGE_CARD_MAX))) {
      return bad(`has judges' cards outside 0–${JUDGE_CARD_MAX}`);
    }
    if (!isWhole(a.total, 0, DUNK_ATTEMPT_MAX)) return bad(`totals ${String(a.total)}, and a dunk totals a whole number from 0 to ${DUNK_ATTEMPT_MAX}`);
    const cap = dunkAttemptCeiling(judges as number[]);
    if (a.total > cap) return bad(`totals ${a.total}, more than its judges' cards allow (${cap})`);
    total += a.total;
  }
  if (raw.total !== undefined && raw.total !== total) {
    return { ok: false, code: 'CARD_TOTAL_MISMATCH', detail: `The dunk card says ${String(raw.total)} but its dunks add up to ${total}. ${NOT_RECORDED}` };
  }
  if (score !== total) {
    return { ok: false, code: 'SCORE_CARD_MISMATCH', detail: `The score (${score}) is not the dunk card's total (${total}). ${NOT_RECORDED}` };
  }
  return { ok: true, card };
}

/**
 * Everything a staked score must pass before it is written. `killSwitch` is NEXT_PUBLIC_DISABLE_3D: with it on, a mode
 * whose route mounts a fallback game on another scale is not held to the table (the ceiling describes the Babylon game);
 * the result says whether the ceiling applied so the route can log it.
 */
export function checkStakeScore(input: { mode: string; score: unknown; card?: unknown; killSwitch?: boolean }): StakeCheck {
  const { score } = input;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0) {
    return { ok: false, code: 'SCORE_INVALID', detail: 'score must be a non-negative integer' };
  }
  const key = canonicalStakeMode(String(input.mode ?? ''));
  const ceiling = scoreCeilingFor(key);
  if (!ceiling) {
    return { ok: false, code: 'NO_SCORE_CEILING', detail: `"${input.mode}" has no score ceiling, so a stake on it cannot be settled. ${NOT_RECORDED}` };
  }
  const ceilingApplied = !(input.killSwitch && ceiling.swapsUnderKillSwitch);
  if (ceilingApplied && score > ceiling.max) {
    return { ok: false, code: 'SCORE_ABOVE_CEILING', detail: aboveCeilingDetail(score, ceiling) };
  }
  let card: DunkCard | null = null;
  if (key === 'dunkContest') {
    const c = checkDunkCard(score, input.card);
    if (!c.ok) return c;
    card = c.card;
  }
  return { ok: true, card, ceiling, ceilingApplied };
}
