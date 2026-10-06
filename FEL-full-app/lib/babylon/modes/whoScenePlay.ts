// whoScenePlay — the pure rules behind Spot the Scene's IMPROVE pass (2026-10-06). No Babylon, no DOM: WhoSceneItMode wires
// them to input, the camera and the podiums; this file is what the tests pin.
import type { HudScoreCard } from '../core/ModeHarness';
import type { QuizConfig, QuizQuestion } from '../core/QuizCore';
import type { SceneRound } from '../core/SceneBuzz';

// ── #5 skip the reveal ──────────────────────────────────────────────────────────────────────────────────────────────

/** NEW TUNED NUMBER: the answer card holds this long before a press may move on (Brain Brawl's RESULT_SKIP_S is 0.55). */
export const REVEAL_SKIP_S = 0.5;

/** A press during the reveal moves on once the card has been up REVEAL_SKIP_S (`revealLeft` counts down from `revealS`). */
export function canSkipReveal(revealLeft: number, revealS: number): boolean {
  return revealLeft > 0 && revealS - revealLeft >= REVEAL_SKIP_S;
}

// ── #6 the pick screen's auto-start ─────────────────────────────────────────────────────────────────────────────────

/** The player-count screen starts by itself only for a viewer with no pad (a capture harness); a pad player is choosing. */
export function pickAutoStarts(timerFired: boolean, padCount: number): boolean {
  return timerFired && padCount === 0;
}

// ── #7 the CPU rival ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A run whose score is compared with another player's — an Arena duel (`?arena=`), an async challenge (`?mp=`) or a friend's
 * challenge link (`?c=`) — plays without the CPU: a rival that steals questions at random would put two players under one
 * comparison with different luck (the same rule as dance's chartPlay.comparedRun).
 */
export function comparedRun(search: string | null | undefined): boolean {
  if (!search) return false;
  const q = new URLSearchParams(search);
  return q.has('arena') || q.has('mp') || q.has('c');
}

/** NEW TUNED NUMBERS: the solo rival. QuizRound's foe defaults are 0.65 / 0.5; a venue read takes longer than a fact, and a
 *  rival that takes two in three questions off a learner reads as a wall, so it is a little slower and less sure. */
export const SCENE_RIVAL = { skill: 0.55, speed: 0.35 } as const;

export interface RivalPlan { at: number; right: boolean }

/**
 * The rival commits to WHEN it answers and WHETHER it is right as the question opens (QuizCore.QuizRound.armFoe's window:
 * no earlier than 15 % of the clock, no later than 1 − 0.7 × speed of it). Deciding lazily would let a slow player outrun
 * a rival that never scheduled an answer.
 */
export function armRival(cfg: QuizConfig, rnd: () => number, rival: { skill: number; speed: number } = SCENE_RIVAL): RivalPlan {
  const earliest = cfg.timeLimit * 0.15;
  const latest = cfg.timeLimit * (1 - rival.speed * 0.7);
  return { at: earliest + rnd() * Math.max(0.1, latest - earliest), right: rnd() < rival.skill };
}

/** The option the rival presses: the right one, or one of the wrong ones at random. */
export function rivalChoice(q: QuizQuestion, right: boolean, rnd: () => number): number {
  const answer = q.options.findIndex((o) => o.id === q.answer);
  if (right || q.options.length < 2) return answer;
  const wrong = q.options.map((_, i) => i).filter((i) => i !== answer);
  return wrong[Math.min(wrong.length - 1, Math.floor(rnd() * wrong.length))];
}

// ── #8 the tight-to-wide read ───────────────────────────────────────────────────────────────────────────────────────

/** NEW TUNED NUMBERS: each question opens at this share of the lens (0.5 ≈ a 2× zoom on the floor's centre) and is fully
 *  wide once this share of the clock has gone — so a fast read is made on a detail, and pays the speed bonus for it. */
export const SCENE_ZOOM = { start: 0.5, wideAt: 0.6 } as const;

/** The lens as a share of the camera's own fov, `elapsed` seconds into a `timeLimit` clock (smoothstep, tight → 1). */
export function zoomShare(elapsed: number, timeLimit: number): number {
  const t = Math.max(0, Math.min(1, elapsed / Math.max(0.001, timeLimit * SCENE_ZOOM.wideAt)));
  const e = t * t * (3 - 2 * t);
  return SCENE_ZOOM.start + (1 - SCENE_ZOOM.start) * e;
}

// ── #12 the last three seconds ──────────────────────────────────────────────────────────────────────────────────────

/** The whole second (3, 2, 1) the clock just crossed going from `before` to `after`, or null. */
export function tickSecond(before: number, after: number): number | null {
  const a = Math.ceil(before), b = Math.ceil(after);
  return b < a && b >= 1 && b <= 3 ? b : null;
}

// ── #15 the venue recap ─────────────────────────────────────────────────────────────────────────────────────────────

export interface RecapEntry { venue: string; by: string | null; sec: number | null; points: number }

/** The end-of-match list: each venue by name, who took it and how fast (HudScoreCard rows: name · line · score). */
export function recapRows(entries: readonly RecapEntry[]): HudScoreCard[] {
  return entries.map((e) => ({
    name: e.venue,
    line: e.by ? `${e.by}${e.sec !== null ? ` · ${e.sec.toFixed(1)} s` : ''}` : 'nobody',
    score: e.points,
  }));
}

// ── #17 the venues a match needs ────────────────────────────────────────────────────────────────────────────────────

/** Every venue key a drawn match will ask about, in order of first use. */
export function roundVenues(rounds: readonly SceneRound[], fallback: string): string[] {
  const out: string[] = [];
  for (const r of rounds) for (const q of r.questions) {
    const id = q.sceneVenueId ?? fallback;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** True when the question at (round `ri`, question `qi`) or any after it asks about `id` — its venue must stay shelved. */
export function venueNeededFrom(rounds: readonly SceneRound[], ri: number, qi: number, id: string, fallback: string): boolean {
  for (let r = Math.max(0, ri); r < rounds.length; r++) {
    const qs = rounds[r].questions;
    for (let q = r === ri ? Math.max(0, qi) : 0; q < qs.length; q++) if ((qs[q].sceneVenueId ?? fallback) === id) return true;
  }
  return false;
}
