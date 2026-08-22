// DunkSim — the dunk contest as pure simulation.
//
// PASS 2, PHASE 1. THIS IS THE FILE THE WHOLE FIRST PASS WAS WAITING FOR.
//
// Pass 1 built `ModeKit`, `SimulatableMode`, `DunkTiers`, `Legibility` and the
// rest, and integrated exactly none of them. This is one mode, end to end,
// through all of it — and it exists to answer one question before anyone
// builds on those contracts again:
//
//     DOES THE SHAPE WORK?
//
// If it does not, that should cost one mode rather than twenty-five.
//
// WHAT MOVED
// `modes/DunkMode.ts` (M63) is 521 lines with the phase machine, charge, QTE,
// judging, scoring, Babylon meshes, camera cuts, replay recording and HUD all
// interleaved. Nothing in it could be tested, replayed, ghosted or verified,
// because reading the score required a `Scene`.
//
// The split is the only structural requirement `SimulatableMode` imposes:
//
//   DunkSim.ts   what the game IS   — pure, no Babylon, no clock, no DOM
//   DunkMode.ts  what it LOOKS LIKE — meshes, camera, HUD, audio
//
// Everything in this file is a pure function of (state, intent, rng). That is
// what makes a dunk run verifiable for prize money (M91), replayable as a
// ghost (M83), and testable at all.
//
// SCORING PARITY IS DELIBERATE
// The three judges, their weights, the 6-10 clamp, the chain threshold and the
// freshness rule are copied EXACTLY from M63. A migration that also changes
// balance is two changes wearing one commit, and when the scores come out
// different nobody can tell which half did it.

import { Rng } from '../../core/Rng';
import type { Intent } from '../../core/PlayerSlot';
import type { SimulatableMode } from '../../core/HeadlessSim';
import {
  DUNK_LIBRARY, availableDunks, scoreCeiling, type AthleteProfile, type DunkDef, type GateMode,
} from '../../core/DunkTiers';

export type DunkPhase =
  | 'approach' | 'charge' | 'cinematic' | 'resolve' | 'judging' | 'rivalTurn' | 'contestOver';

export type Style = 'power' | 'flashy' | 'sig';
export type Prop = 'none' | 'alleyoop' | 'obstacle';

// ── parity constants, verbatim from M63 ──────────────────────────────────
export const DUNKS_PER_ROUND = 2;
export const TOTAL_ROUNDS = 2;
export const CHAIN_THRESHOLD = 24;
export const STYLE_TIER: Record<Style, number> = { power: 3, flashy: 5.5, sig: 8 };
export const PROP_BONUS: Record<Prop, number> = { none: 0, alleyoop: 2, obstacle: 2 };

export const JUDGES = [
  { id: 'silk', name: 'Silk', w: { difficulty: 0.2, execution: 0.3, style: 0.5 } },
  { id: 'doc', name: 'Doc', w: { difficulty: 0.3, execution: 0.5, style: 0.2 } },
  { id: 'prime', name: 'Prime', w: { difficulty: 0.5, execution: 0.3, style: 0.2 } },
] as const;

/** Seconds each phase may last. From M63. */
export const BUDGET_SEC: Record<DunkPhase, number> = {
  approach: 30, charge: 5, cinematic: 4, resolve: 3, judging: 6, rivalTurn: 8, contestOver: 999,
};

/** The QTE window, as a fraction of the cinematic. Shrinks 25% per style tap. */
export const QTE_CENTRE = 0.55;
export const QTE_HALF_WIDTH = 0.14;
export const TAP_SHRINK = 0.75;
export const MAX_STYLE_TAPS = 2;

export interface JudgeScore { name: string; score: number; line: string }

export interface DunkState {
  phase: DunkPhase;
  phaseSec: number;
  round: number;
  dunkInRound: number;

  style: Style;
  prop: Prop;
  /** Chosen from the athlete's available library. */
  dunkId: string;

  charge: number;
  styleTaps: number;
  qteHit: boolean;
  qteAccuracy: number;
  hangSec: number;

  playerTotal: number;
  rivalTotal: number;
  hype: number;
  chain: number;
  /** "style_prop" combos already thrown — the freshness memory. */
  usedCombos: string[];
  lastScores: JudgeScore[];
  lastDifficulty: number;
  ended: boolean;
  outcome: string;

  /**
   * The config this run was started with, carried IN the state.
   *
   * `SimulatableMode.tick(state, intent, rng, dt)` has no config parameter —
   * config is an argument to `init` only. So a config held anywhere else is
   * invisible to a server re-simulating the run, and the first draft of this
   * file had `tick` fall back to `DEFAULT_CONFIG`: every match played at a
   * non-default PRQ would have failed verification, and only for players whose
   * readiness was not exactly average. Same failure shape as M91's
   * quantisation bug — the honest player is the one who gets rejected.
   */
  cfg: DunkConfig;
}

export interface DunkConfig {
  profile: AthleteProfile;
  gate: GateMode;
  /** From DDA. Higher PRQ → stricter judges. */
  judgeStrictness: number;
  /** From DDA. What the rival is capable of. */
  rivalSkill: number;
  /**
   * How much wider the QTE window is than its base, after PRQ catch-up and the
   * accessibility assist. 1 = no change.
   *
   * It lives in the CONFIG rather than being applied at the call site because
   * of determinism: the sim must be a pure function of (state, intent, rng),
   * and a window that silently varies with a setting the replay never captured
   * would desync on the server for exactly the players who need the assist.
   * As config it is recorded, replayed, and verifiable — accessibility and
   * prize money stop being in tension.
   */
  qteWindowScale: number;
}

export const DEFAULT_CONFIG: DunkConfig = {
  profile: { heightCm: 185, verticalCm: 70, hangTimeMs: 550 },
  gate: 'arcade',
  judgeStrictness: 1,
  rivalSkill: 0.6,
  qteWindowScale: 1,
};

export function initialState(cfg: DunkConfig): DunkState {
  const available = availableDunks(cfg.profile, cfg.gate);
  return {
    phase: 'approach', phaseSec: 0, round: 1, dunkInRound: 0,
    style: 'power', prop: 'none',
    dunkId: available[available.length - 1]?.id ?? DUNK_LIBRARY[0].id,
    charge: 0, styleTaps: 0, qteHit: false, qteAccuracy: 0, hangSec: 0,
    playerTotal: 0, rivalTotal: 0, hype: 0, chain: 0,
    usedCombos: [], lastScores: [], lastDifficulty: 0,
    ended: false, outcome: '',
    cfg,
  };
}

// ── judging, exactly as M63 scored it ────────────────────────────────────

export function cannedLine(name: string, score: number): string {
  if (score >= 10) return `${name}: THAT'S A TEN. Hand me the mic.`;
  if (score >= 9) return `${name}: about as good as it gets.`;
  if (score >= 7) return `${name}: real difficulty, clean finish.`;
  return `${name}: gets it done — I've seen bigger.`;
}

export function judgeDunk(
  difficulty: number, execution: number, style: number, strictness = 1,
): JudgeScore[] {
  return JUDGES.map((j) => {
    const raw = difficulty * j.w.difficulty + execution * j.w.execution + style * j.w.style;
    // `strictness` comes from PRQ: a legendary-tier player faces judges who
    // want more for the same 10. It scales the raw score, NOT the clamp, so
    // the 6-10 band that M63 established is preserved exactly.
    const score = Math.max(6, Math.min(10, Math.round(6 + (raw / strictness) * 0.4)));
    return { name: j.name, score, line: cannedLine(j.name, score) };
  });
}

/**
 * Freshness. A combo already thrown scores 20% lower difficulty.
 *
 * From M63, and it is the rule that stops a dunk contest being one dunk twice.
 */
export function freshnessFactor(used: readonly string[], style: Style, prop: Prop): number {
  return used.includes(`${style}_${prop}`) ? 0.8 : 1;
}

/**
 * Difficulty for an attempt, 0-10.
 *
 * Style tier + prop bonus + style taps, then the M85 tier ceiling — this is
 * where the player's REAL VERTICAL enters the score. A windmill thrown by
 * someone whose body supports it scores higher than the same windmill
 * borrowed, without anyone being locked out.
 */
export function attemptDifficulty(s: DunkState, cfg: DunkConfig): number {
  const dunk = DUNK_LIBRARY.find((d) => d.id === s.dunkId) ?? DUNK_LIBRARY[0];
  const base = STYLE_TIER[s.style] + PROP_BONUS[s.prop] + s.styleTaps * 1.2;
  const fresh = freshnessFactor(s.usedCombos, s.style, s.prop);
  return Math.max(0, Math.min(10, base * fresh * scoreCeiling(cfg.profile, dunk)));
}

/** Execution, 0-10. Charge accuracy, the QTE, and rim hang. */
export function attemptExecution(s: DunkState): number {
  const chargeQuality = 1 - Math.abs(s.charge - 0.85) / 0.85;   // 0.85 is the sweet spot
  const qte = s.qteHit ? s.qteAccuracy : 0;
  const hang = Math.min(1, s.hangSec / 0.8);
  return Math.max(0, Math.min(10, chargeQuality * 4 + qte * 4 + hang * 2));
}

/** Style score, 0-10. */
export function attemptStyle(s: DunkState): number {
  return Math.max(0, Math.min(10, STYLE_TIER[s.style] + s.styleTaps * 1.5 + (s.prop === 'none' ? 0 : 1)));
}

/**
 * The QTE window at the current tap count. Narrows 25% per tap.
 *
 * `scale` is the PRQ + assist widening from `ModeKit.window()`. It multiplies
 * the half-width, so the window stays centred: an assist that widened only one
 * side would move where "on time" is, and a player who then turned the assist
 * off would have to relearn the timing.
 */
export function qteWindow(styleTaps: number, scale = 1): { from: number; to: number } {
  const half = QTE_HALF_WIDTH * TAP_SHRINK ** styleTaps * scale;
  return { from: QTE_CENTRE - half, to: QTE_CENTRE + half };
}

/** How accurate a tap at `t` (0..1 through the cinematic) was, 0..1. */
export function qteAccuracyAt(t: number, styleTaps: number, scale = 1): number {
  const w = qteWindow(styleTaps, scale);
  if (t < w.from || t > w.to) return 0;
  const half = (w.to - w.from) / 2;
  return 1 - Math.abs(t - QTE_CENTRE) / half;
}

/**
 * What the rival throws.
 *
 * Deterministic from the injected Rng, so a contest replays identically. M63
 * used `Math.random()` here, which is why no dunk contest could ever be
 * verified for the Cash Arena it was built for.
 */
export function rivalScore(rng: Rng, skill: number, round: number): number {
  const base = 20 + skill * 7;
  const pressure = round > 1 ? 1.5 : 0;
  return Math.round(Math.min(30, Math.max(18, base + pressure + rng.range(-2, 2))));
}

// ── the mode ─────────────────────────────────────────────────────────────

/**
 * The simulation.
 *
 * Every branch is a pure function of (state, intent, rng). No `performance.now`,
 * no `Math.random`, no `Date`, no scene. That is not stylistic — it is the
 * complete list of things that make a match unverifiable.
 */
export const DunkSim: SimulatableMode<DunkState> & {
  step(s: DunkState, i: Intent, rng: Rng, dt: number, cfg?: DunkConfig): DunkState;
} = {
  modeId: 'dunk',

  init(_rng: Rng, config: Record<string, number>): DunkState {
    return initialState({
      ...DEFAULT_CONFIG,
      judgeStrictness: config.judgeStrictness ?? 1,
      rivalSkill: config.rivalSkill ?? 0.6,
      qteWindowScale: config.qteWindowScale ?? 1,
      profile: {
        heightCm: config.heightCm ?? DEFAULT_CONFIG.profile.heightCm,
        verticalCm: config.verticalCm ?? DEFAULT_CONFIG.profile.verticalCm,
        hangTimeMs: config.hangTimeMs ?? DEFAULT_CONFIG.profile.hangTimeMs,
      },
    });
  },

  tick(state, intent, rng, dt) {
    return DunkSim.step(state, intent, rng, dt, state.cfg);
  },

  fingerprint: (s) => [
    s.phaseSec, s.charge, s.qteAccuracy, s.hangSec,
    s.playerTotal, s.rivalTotal, s.chain, s.hype,
    s.styleTaps, s.round, s.dunkInRound,
    // Phase must be in the fingerprint: two runs can share every number and
    // still be in different phases, and a hash that cannot see that would
    // verify a desync.
    ['approach', 'charge', 'cinematic', 'resolve', 'judging', 'rivalTurn', 'contestOver'].indexOf(s.phase),
  ],

  score: (s) => s.playerTotal,

  step(s, i, rng, dt, cfg = s.cfg): DunkState {
    if (s.ended) return s;
    const t = { ...s, phaseSec: s.phaseSec + dt };

    switch (t.phase) {
      case 'approach': {
        // Cycle style and prop with the face buttons; hold action to charge.
        if (i.pass) t.style = t.style === 'power' ? 'flashy' : t.style === 'flashy' ? 'sig' : 'power';
        if (i.steal) t.prop = t.prop === 'none' ? 'alleyoop' : t.prop === 'alleyoop' ? 'obstacle' : 'none';
        if (i.actionHeld > 0.02) { t.phase = 'charge'; t.phaseSec = 0; t.charge = 0; }
        else if (t.phaseSec > BUDGET_SEC.approach) { t.phase = 'charge'; t.phaseSec = 0; }
        return t;
      }

      case 'charge': {
        t.charge = Math.min(1, t.charge + dt / 1.1);
        // Released, or the charge budget ran out.
        if (i.actionHeld <= 0.02 || t.phaseSec >= BUDGET_SEC.charge) {
          t.phase = 'cinematic';
          t.phaseSec = 0;
          t.styleTaps = 0;
          t.qteHit = false;
          t.qteAccuracy = 0;
        }
        return t;
      }

      case 'cinematic': {
        const progress = Math.min(1, t.phaseSec / BUDGET_SEC.cinematic);
        // Style taps mid-air: more difficulty, narrower QTE. The risk is real
        // and it is the decision the phase exists to offer.
        if (i.pass && t.styleTaps < MAX_STYLE_TAPS) t.styleTaps++;
        if (i.action && !t.qteHit) {
          const acc = qteAccuracyAt(progress, t.styleTaps, cfg.qteWindowScale);
          if (acc > 0) { t.qteHit = true; t.qteAccuracy = acc; }
        }
        if (progress >= 1) { t.phase = 'resolve'; t.phaseSec = 0; }
        return t;
      }

      case 'resolve': {
        // Rim hang while the action button is held.
        if (i.actionHeld > 0.02) t.hangSec += dt;
        if (t.phaseSec >= BUDGET_SEC.resolve) {
          const difficulty = attemptDifficulty(t, cfg);
          const scores = judgeDunk(difficulty, attemptExecution(t), attemptStyle(t), cfg.judgeStrictness);
          const total = scores.reduce((n, j) => n + j.score, 0);

          t.lastScores = scores;
          t.lastDifficulty = difficulty;
          t.playerTotal += total;
          t.chain = total >= CHAIN_THRESHOLD ? t.chain + 1 : 0;
          t.hype = Math.min(100, t.hype + (total >= CHAIN_THRESHOLD ? 25 : 8));
          if (!t.usedCombos.includes(`${t.style}_${t.prop}`)) {
            t.usedCombos = [...t.usedCombos, `${t.style}_${t.prop}`];
          }
          t.phase = 'judging';
          t.phaseSec = 0;
          t.hangSec = 0;
        }
        return t;
      }

      case 'judging': {
        if (t.phaseSec >= BUDGET_SEC.judging) { t.phase = 'rivalTurn'; t.phaseSec = 0; }
        return t;
      }

      case 'rivalTurn': {
        if (t.phaseSec >= BUDGET_SEC.rivalTurn) {
          t.rivalTotal += rivalScore(rng, cfg.rivalSkill, t.round);
          t.dunkInRound++;
          if (t.dunkInRound >= DUNKS_PER_ROUND) { t.dunkInRound = 0; t.round++; }
          if (t.round > TOTAL_ROUNDS) {
            t.phase = 'contestOver';
            t.ended = true;
            t.outcome = t.playerTotal > t.rivalTotal ? 'WIN'
              : t.playerTotal === t.rivalTotal ? 'DRAW' : 'LOSS';
          } else {
            t.phase = 'approach';
            t.charge = 0;
          }
          t.phaseSec = 0;
        }
        return t;
      }

      default:
        return t;
    }
  },
};

/**
 * What the player needs to score to win, if they are behind.
 *
 * M63 called this "THE NEED" and showed it on the final round. Kept because it
 * is the single line that makes the last dunk tense.
 */
export function scoreNeeded(s: DunkState): number | null {
  if (s.round < TOTAL_ROUNDS || s.playerTotal > s.rivalTotal) return null;
  return s.rivalTotal - s.playerTotal + 1;
}

/** The dunks this athlete may pick from, for the selection UI. */
export function selectableDunks(cfg: DunkConfig): DunkDef[] {
  return availableDunks(cfg.profile, cfg.gate);
}
