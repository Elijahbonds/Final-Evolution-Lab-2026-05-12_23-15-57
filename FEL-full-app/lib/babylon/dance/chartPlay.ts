// chartPlay — IMPROVE (2026-10-06): the Cypher's play options on top of a chart, pure so node can test them.
//
// The chart itself is movement play's (danceTracks.stepsFor / DanceCore — LANES.md); nothing here edits it. These take
// the finished step list and the player's input and decide:
//   #10 GROOVE  — bonus-only on-beat taps in the long gaps the sparse sections leave (nothing to press for 5–8 beats);
//   #11 LEVEL   — EASY / NORMAL / HARD, thinning or filling the chart per run (NORMAL is the chart, untouched);
//   #12 MATCH   — an opt-in mode where each move family has its own face button (A/B/X/Y), so reading the lane matters;
//   #13 HOLD    — a freeze is held through its beats and released on the beat (judged, bonus only).
// GROOVE and HOLD pay STYLE, a separate tally: the Arena-staked score stays DanceCore's (lib/arena-score-integrity.ts
// danceCeiling: PERFECT + combo per step), so neither can move what a staked run is worth.

import type { FelButton, FelInput } from '../core/InputBus';
import { DANCE_LIBRARY, MISS_AFTER, type DanceClip, type DanceStep } from '../core/DanceCore';
import { TAP_RELEASE } from '../audio/SongClock';
import { KEY_SPACE_DOWN } from '../core/StartWake';

/** One id → clip map (DANCE_LIBRARY is eight entries; the room looked clips up with a linear find every frame). */
export const CLIP_BY_ID: ReadonlyMap<string, DanceClip> = new Map(DANCE_LIBRARY.map((c) => [c.id, c]));
export const categoryOf = (s: DanceStep): DanceClip['category'] | null => CLIP_BY_ID.get(s.clipId)?.category ?? null;

// ── #11 level ────────────────────────────────────────────────────────────────────────────────────────────────────

export type DanceLevel = 'easy' | 'normal' | 'hard';
export const DANCE_LEVELS: readonly DanceLevel[] = ['easy', 'normal', 'hard'];

/** NEW TUNED NUMBER: on EASY no two step STARTS are closer than this (beats). The hooks' 2-beat runs become one move a
 *  bar; the sparse sections (5–8 beats apart already) are untouched. */
export const EASY_MIN_START_GAP_BEATS = 4;
/** NEW TUNED NUMBER: on HARD a free stretch (after a step's own clip ends, before the next starts) this long or longer
 *  (beats) gets another move of the same family. 2 = the shortest clip, so the densest HARD bar is the hooks' density. */
export const HARD_FILL_MIN_BEATS = 2;

/**
 * A run whose score is compared with another player's — an Arena duel (`?arena=`), an async challenge (`?mp=`) or a
 * friend's challenge link (`?c=`), GameShell's three — always dances the chart as authored: NORMAL, any button. A level
 * or MATCH choice would put two players on different charts under one comparison. (The Arena's ceiling holds either way:
 * HARD is never denser than danceCeiling assumes.)
 */
export function comparedRun(search: string | null | undefined): boolean {
  if (!search) return false;
  const q = new URLSearchParams(search);
  return q.has('arena') || q.has('mp') || q.has('c');
}

export function cycleLevel(level: DanceLevel, dir: 1 | -1): DanceLevel {
  const i = DANCE_LEVELS.indexOf(level);
  const n = DANCE_LEVELS.length;
  return DANCE_LEVELS[(Math.max(0, i) + dir + n) % n];
}
export const parseLevel = (v: unknown): DanceLevel => (v === 'easy' || v === 'hard' ? v : 'normal');

/**
 * The chart for a level. NORMAL returns the steps as given. EASY drops a step that starts within
 * EASY_MIN_START_GAP_BEATS of the last kept one (the first step and every freeze are always kept: the freeze is the
 * break's horn hit). HARD fills each gap of HARD_FILL_MIN_BEATS or more with the shortest clip of the previous step's
 * family that fits, so the band the steps earn is the band the section already plays. Never overlaps two steps, and
 * never denser than one step per shortest clip — the bound lib/arena-score-integrity.ts's danceCeiling assumes.
 */
export function chartForLevel(steps: readonly DanceStep[], level: DanceLevel): DanceStep[] {
  const sorted = [...steps].sort((a, b) => a.beat - b.beat);
  if (level === 'normal' || sorted.length === 0) return sorted;
  if (level === 'easy') {
    const out: DanceStep[] = [];
    let last = -Infinity;
    for (const s of sorted) {
      if (out.length === 0 || categoryOf(s) === 'freeze' || s.beat - last >= EASY_MIN_START_GAP_BEATS) {
        out.push(s);
        last = s.beat;
      }
    }
    return out;
  }
  const out: DanceStep[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    out.push(s);
    const next = sorted[i + 1];
    if (!next) break;
    const fam = categoryOf(s);
    if (!fam || fam === 'freeze') continue;   // the freeze stays alone on its break
    const fits = DANCE_LIBRARY.filter((c) => c.category === fam).sort((a, b) => a.beats - b.beats || a.id.localeCompare(b.id));
    let cursor = s.beat + s.holdBeats;
    let mirrored = s.mirrored;
    for (;;) {
      const room = next.beat - cursor;
      if (room < HARD_FILL_MIN_BEATS) break;
      const clip = fits.find((c) => c.beats <= room);
      if (!clip) break;
      mirrored = !mirrored;
      out.push({ clipId: clip.id, beat: cursor, holdBeats: clip.beats, mirrored });
      cursor += clip.beats;
    }
  }
  return out;
}

// ── #10 groove taps ──────────────────────────────────────────────────────────────────────────────────────────────

/** NEW TUNED NUMBER: a groove beat is a whole beat at least this far (beats) from every step's start, so a groove tap
 *  can never sit inside a step's judge window (MISS_AFTER 0.2 s is under half a beat at every shipped tempo). With the
 *  chart's gaps (8 beats at energy 1, 5 at energy 2, 3 at energy 3) it opens five beats, two, then none. */
export const GROOVE_CLEAR_BEATS = 2;
/** NEW TUNED NUMBER: how close to the beat a groove tap must land (s) — the GREAT window. */
export const GROOVE_WINDOW_SEC = 0.09;
/** NEW TUNED NUMBER: STYLE per groove tap. A sixth of a PERFECT step's 300, so it never outweighs dancing the chart. */
export const GROOVE_STYLE = 50;

/** The whole beats (from the chart's beat 0, before its last step's end) a groove tap may land on. Sorted. */
export function grooveBeats(steps: readonly DanceStep[]): number[] {
  if (steps.length === 0) return [];
  const starts = steps.map((s) => s.beat).sort((a, b) => a - b);
  const end = Math.max(...steps.map((s) => s.beat + s.holdBeats));
  const out: number[] = [];
  let j = 0;
  for (let b = 1; b < end; b++) {
    while (j + 1 < starts.length && starts[j + 1] <= b) j++;
    const prev = starts[j] <= b ? starts[j] : -Infinity;
    const next = starts[j] > b ? starts[j] : (j + 1 < starts.length ? starts[j + 1] : Infinity);
    if (b - prev >= GROOVE_CLEAR_BEATS && next - b >= GROOVE_CLEAR_BEATS) out.push(b);
  }
  return out;
}

/** The groove beat a tap at `beatPos` (chart beats, fractional) takes, or null: the nearest beat inside
 *  `windowBeats`, not already taken. */
export function grooveTap(beats: readonly number[], beatPos: number, windowBeats: number, taken: ReadonlySet<number>): number | null {
  if (!Number.isFinite(beatPos)) return null;
  const b = Math.round(beatPos);
  if (Math.abs(beatPos - b) > windowBeats || taken.has(b)) return null;
  // binary search: the beats are sorted
  let lo = 0, hi = beats.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] === b) return b;
    if (beats[mid] < b) lo = mid + 1; else hi = mid - 1;
  }
  return null;
}

/** The index of the first groove beat at or after `beatPos` (for the lane's look-ahead). */
export function firstGrooveFrom(beats: readonly number[], beatPos: number): number {
  let lo = 0, hi = beats.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (beats[mid] < beatPos) lo = mid + 1; else hi = mid; }
  return lo;
}

// ── #12 one face button per move family ──────────────────────────────────────────────────────────────────────────

/**
 * NEW TUNED MAP (opt-in MATCH mode only): the seven families on four buttons, grouped by what the body does —
 * A the standing grooves (top rock, bounce), B the floor (footwork, power), X the arms and turns (wave, spin), Y the
 * freeze (the break's horn hit). A is the commonest family pair, so a player who only knows A still dances most bars.
 */
export const FAMILY_BUTTON: Record<DanceClip['category'], 'A' | 'B' | 'X' | 'Y'> = {
  toprock: 'A', bounce: 'A', footwork: 'B', power: 'B', wave: 'X', transition: 'X', freeze: 'Y',
};
export const buttonForStep = (s: DanceStep): 'A' | 'B' | 'X' | 'Y' => FAMILY_BUTTON[categoryOf(s) ?? 'toprock'];

/** In MATCH mode: which face button a press is. A pad's face buttons are themselves; the R trigger and SPACE (the
 *  one-button taps) count as A. null = not a tap in MATCH mode. */
export function matchPress(e: FelInput, anyTap: boolean): 'A' | 'B' | 'X' | 'Y' | null {
  if (e.t === 'button' && e.pressed && e.src !== 'space' && (e.btn === 'A' || e.btn === 'B' || e.btn === 'X' || e.btn === 'Y')) return e.btn;
  return anyTap ? 'A' : null;
}

/**
 * The step a press at `now` would be judged against — the same choice DancePerformance.hit makes, read off
 * upcoming() (pending first, then unfired in chart order): the nearest step already due within MISS_AFTER, else the
 * first step still ahead within MISS_AFTER. null = the press is a wild tap (or a groove tap).
 */
export function pressTarget<T extends { time: number; step: DanceStep }>(upcoming: readonly T[], now: number, missAfter = MISS_AFTER): T | null {
  let due: T | null = null;
  for (const u of upcoming) {
    if (u.time > now) continue;
    if (now - u.time <= missAfter && (!due || Math.abs(now - u.time) < Math.abs(now - due.time))) due = u;
  }
  if (due) return due;
  for (const u of upcoming) {
    if (u.time <= now) continue;
    return u.time - now <= missAfter ? u : null;
  }
  return null;
}

// ── #13 hold the freeze ──────────────────────────────────────────────────────────────────────────────────────────

/** Where a tap came from, so only ITS release ends a hold (a pad re-sends an untouched trigger at 0 every frame). */
export type TapSource = 'trigger' | 'space' | `btn:${FelButton}`;

export function tapSource(e: FelInput): TapSource | null {
  if (e.t === 'trigger') return e.value === KEY_SPACE_DOWN ? 'space' : 'trigger';
  if (e.t === 'button' && e.src !== 'space') return `btn:${e.btn}`;
  return null;
}

/** Is `e` the release of a tap from `src`? SPACE's key-up is the bus's made-up A (`src: 'space'`). */
export function isReleaseOf(src: TapSource, e: FelInput): boolean {
  if (src === 'space') return e.t === 'button' && e.src === 'space';
  if (src === 'trigger') return e.t === 'trigger' && e.side === 'R' && e.value < TAP_RELEASE && e.value !== KEY_SPACE_DOWN;
  return e.t === 'button' && !e.pressed && e.src !== 'space' && `btn:${e.btn}` === src;
}

/** NEW TUNED NUMBERS: a release within RELEASE_CLEAN_SEC of the freeze's last beat is CLEAN, within RELEASE_WINDOW_SEC
 *  it is HELD (the GREAT and GOOD windows); STYLE for each. */
export const RELEASE_CLEAN_SEC = 0.09;
export const RELEASE_WINDOW_SEC = 0.2;
export const HOLD_STYLE_CLEAN = 150;
export const HOLD_STYLE_OK = 75;

export type ReleaseCall = 'CLEAN' | 'HELD' | 'EARLY' | 'LATE';

/** Judge a release `deltaSec` after the freeze's end (− = let go early). LATE is also what a hold that is never let go
 *  becomes once the window has passed. */
export function judgeRelease(deltaSec: number): { call: ReleaseCall; style: number } {
  const a = Math.abs(deltaSec);
  if (a <= RELEASE_CLEAN_SEC) return { call: 'CLEAN', style: HOLD_STYLE_CLEAN };
  if (a <= RELEASE_WINDOW_SEC) return { call: 'HELD', style: HOLD_STYLE_OK };
  return { call: deltaSec < 0 ? 'EARLY' : 'LATE', style: 0 };
}

export const RELEASE_TEXT: Record<ReleaseCall, string> = {
  CLEAN: 'FREEZE HELD — CLEAN', HELD: 'FREEZE HELD', EARLY: 'HOLD THE FREEZE', LATE: 'LET GO ON THE BEAT',
};
