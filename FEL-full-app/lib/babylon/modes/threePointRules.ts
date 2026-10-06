// threePointRules — the 3-Point Contest's pure rules for the owner-picked improvements (IMPROVE 2026-10-06, the threepoint
// section of docs/IMPROVEMENTS-2026-10-05.md). Import-free (types only), so the tests, the host and the READY-screen options
// read the same numbers the mode plays by without pulling Babylon in.

import type { ShotQuality } from '../core/BasketballCore';

export const TP_RACKS = 5;
export const TP_BALLS_PER_RACK = 5;
/** 2009 field: the top three of qualifying advance (ThreePointMode FINALISTS). */
export const TP_FINALISTS = 3;

// ── #1 THE NEXT BALL IS UP WHILE THE LAST ONE FLIES ─────────────────────────────────────────────────────────────────────
/**
 * Seconds after the ball leaves the hand before the next ball comes off the rack (then PICK_SEC into the hand). It used to
 * wait for the make to drop through (NET_EXIT_SEC 0.55 s) or the miss to bounce (RIM_OUT_SEC 0.85 s) after a ~0.8 s flight —
 * ~1.3–1.9 s from the release. TUNED (owner's eye): 0.35 s keeps the follow-through on screen (the arms at the top, the wrist
 * snap) before the hands go to the rack, and the old ball finishes its flight, its rim play and its bounce on its own.
 */
export const NEXT_UP_SEC = 0.35;
/** The live balls a run keeps in the air at once (the hand's own ball not counted). A third would end the oldest early. */
export const FLIGHT_POOL = 2;

// ── #5 THE MONEY-BALL RACK ───────────────────────────────────────────────────────────────────────────────────────────────
/** No money rack picked (the 2009 format the mode is benchmarked on: one money ball a rack). */
export const NO_MONEY_RACK = -1;
/** A rack's last ball is the money ball; every ball of the picked money rack is too (the modern contest's all-money rack). */
export function moneyBall(rack: number, ballIdx: number, moneyRack: number = NO_MONEY_RACK, balls = TP_BALLS_PER_RACK): boolean {
  return ballIdx === balls - 1 || (moneyRack >= 0 && rack === moneyRack);
}
/** A perfect run: 30 in the 2009 format; 34 with a money rack (four racks of 6 and one of 10). */
export function perfectRun(moneyRack: number = NO_MONEY_RACK, racks = TP_RACKS, balls = TP_BALLS_PER_RACK): number {
  let s = 0;
  for (let r = 0; r < racks; r++) for (let b = 0; b < balls; b++) s += moneyBall(r, b, moneyRack, balls) ? 2 : 1;
  return s;
}
/**
 * TUNED (owner's eye): with a money rack every shooter has one (the modern format), so a simulated rival's centre moves up by
 * what the rack adds at a typical rate — four balls worth one more, made about half the time: +2.
 */
export const MONEY_RACK_RIVAL_BONUS = 2;

/** A simulated rival's expected round score (ThreePointMode.simulateRival draws around this). */
export function rivalCentre(skill: number, round: 'qualifying' | 'final', moneyRack = false): number {
  return (round === 'final' ? 14 : 12.5) + skill * 5 + (moneyRack ? MONEY_RACK_RIVAL_BONUS : 0);
}

// ── #3 THE CUT LINE IN QUALIFYING ────────────────────────────────────────────────────────────────────────────────────────
/**
 * The number the player is projected to need to advance: the FINALISTS-th best rival's expected score (rivalCentre at each
 * rival's skill), rounded and clamped like a posted score. A tie advances (the board's stable sort keeps the player — field
 * index 0 — ahead of a rival on the same score), so this is the number itself, not one more.
 */
export function projectedCut(skills: readonly number[], moneyRack = false, finalists = TP_FINALISTS): number {
  const max = perfectRun(moneyRack ? 0 : NO_MONEY_RACK);
  const exp = skills.map((s) => Math.max(3, Math.min(max, Math.round(rivalCentre(s, 'qualifying', moneyRack))))).sort((a, b) => b - a);
  if (!exp.length) return 0;
  return exp[Math.min(finalists, exp.length) - 1];
}

// ── #4 RELEASE-HISTORY PIPS ──────────────────────────────────────────────────────────────────────────────────────────────
/** One character a ball: '.' not shot yet, E early, G good, P perfect, L late (a held-out / brick release reads late). */
export type PipChar = '.' | 'E' | 'G' | 'P' | 'L';
export const EMPTY_PIPS = '.'.repeat(TP_RACKS * TP_BALLS_PER_RACK);
export function pipFor(q: ShotQuality): PipChar {
  return q === 'perfect' ? 'P' : q === 'good' || q === 'held' ? 'G' : q === 'early' ? 'E' : 'L';
}
/** The run's pips with ball (rack, ballIdx) graded `q`. Out-of-range balls leave the string as it was. */
export function pushPip(pips: string, rack: number, ballIdx: number, q: ShotQuality, balls = TP_BALLS_PER_RACK): string {
  const i = rack * balls + ballIdx;
  if (i < 0 || i >= pips.length) return pips;
  return pips.slice(0, i) + pipFor(q) + pips.slice(i + 1);
}

// ── #7 RIVAL FORM ON THE BOARD ───────────────────────────────────────────────────────────────────────────────────────────
/** Rival skills are drawn 0.25–0.95 (0.35–0.95 in the final): the top of that band shoots HOT, the bottom COLD. */
export const FORM_HOT = 0.72, FORM_COLD = 0.48;
export type FormTag = 'HOT' | 'COLD' | '';
export function formTag(skill: number | undefined): FormTag {
  if (typeof skill !== 'number' || !Number.isFinite(skill)) return '';
  return skill >= FORM_HOT ? 'HOT' : skill < FORM_COLD ? 'COLD' : '';
}

// ── #2 SKIP THE STANDINGS ────────────────────────────────────────────────────────────────────────────────────────────────
/** A press skips the board only once it has been up this long — the run's last press (or its button-up) is never a skip. */
export const SKIP_ARM_SEC = 0.4;
export function canSkipStandings(boardUpSec: number): boolean { return boardUpSec >= SKIP_ARM_SEC; }

// ── #5 #6 THE READY-SCREEN OPTIONS ───────────────────────────────────────────────────────────────────────────────────────
/** The query keys of a staked or head-to-head run (Arena stake, async challenge, challenge link — onevoneRules
 *  HEAD_TO_HEAD_PARAMS, the same three): both shooters must shoot the same contest, and the Arena stake ceiling stays 30. */
export const TP_HEAD_TO_HEAD_PARAMS: readonly string[] = ['arena', 'mp', 'c'];
/** Are the practice rack and the money-rack pick offered on this run? Never on a staked or head-to-head run. */
export function optionsOffered(search: string): boolean {
  const q = new URLSearchParams(search);
  return !TP_HEAD_TO_HEAD_PARAMS.some((k) => q.get(k));
}
export const PRACTICE_KEY = 'fel-3pt-practice';
export const MONEY_RACK_KEY = 'fel-3pt-moneyrack';
function store(): Storage | null { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } }
/** The remembered practice pick (off unless the player turned it on). */
export function readPracticePick(): boolean { try { return store()?.getItem(PRACTICE_KEY) === '1'; } catch { return false; } }
export function writePracticePick(on: boolean): void { try { const s = store(); if (!s) return; if (on) s.setItem(PRACTICE_KEY, '1'); else s.removeItem(PRACTICE_KEY); } catch { /* convenience only */ } }
/** The remembered money rack, zero-based, or NO_MONEY_RACK. */
export function readMoneyRackPick(): number {
  try { const n = Number(store()?.getItem(MONEY_RACK_KEY)); return Number.isInteger(n) && n >= 1 && n <= TP_RACKS ? n - 1 : NO_MONEY_RACK; } catch { return NO_MONEY_RACK; }
}
export function writeMoneyRackPick(rack: number): void {
  try { const s = store(); if (!s) return; if (rack >= 0 && rack < TP_RACKS) s.setItem(MONEY_RACK_KEY, String(rack + 1)); else s.removeItem(MONEY_RACK_KEY); } catch { /* convenience only */ }
}
/** What this run plays with: the picks, only where they are offered. */
export function runOptions(search: string, picked: { practice: boolean; moneyRack: number }): { practice: boolean; moneyRack: number } {
  if (!optionsOffered(search)) return { practice: false, moneyRack: NO_MONEY_RACK };
  const r = picked.moneyRack;
  return { practice: picked.practice, moneyRack: Number.isInteger(r) && r >= 0 && r < TP_RACKS ? r : NO_MONEY_RACK };
}
