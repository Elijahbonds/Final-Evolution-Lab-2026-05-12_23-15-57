// lib/babylon/music/performInput.ts — how a hand, a pad and a phone play PERFORM's four lanes. PURE (no DOM, no React, no
// navigator): StudioMode turns a keydown, a pad's button states or a phone action into one of these and plays it; the
// tests read the same tables.
//
// MUSIC-SUITE P6 (2026-09-25), owner decision #11 ("in lanes, on keyboard/pad/phone"). Before this PERFORM had ONE input:
// TAP — the TAP button, Space / J (P2, performSet isPerformTapKey), and any phone pad (P5) — so any finger took any note.
//
// THE LANES, LEFT TO RIGHT: KICK · SNARE · HATS · FLIP, and on every input the same four directions ← ↓ ↑ →:
//   * KEYBOARD — H J K L (one hand, one finger a lane; they are vim's ← ↓ ↑ →), and the ARROW keys ← ↓ ↑ → as the second
//     set. The plan asked for D F J K; D and F are FLIP pad keys (Flip.ts PAD_KEYS: 1-4 · Q-R · A-F · Z-V), and since the P4
//     fix pass no key means one thing on one tab and another on the next (ui/keys.ts "NO FLIP PAD LETTER AT ALL"), so the
//     lanes take the next home-row block: H J K L. None of H J K L or the arrows is a pad key, the booth's B, or '?'; the
//     studio key map takes nothing in PERFORM but ⌘Z / Ctrl+Z / Ctrl+Y and '?' / Esc (ui/keys.ts), and its arrows only while
//     the GRID has the focus in BUILD. SPACE pauses / resumes a free-play set (it was P2's TAP: a tap with no lane would take
//     any note — the one-lane exploit — so it is not a tap any more). A held key is one tap (key repeats are ignored).
//   * PAD (the Gamepad API's standard mapping) — the FACE buttons by where they sit: X (left) KICK, A (bottom) SNARE, Y (top)
//     HATS, B (right) FLIP — and the D-PAD the same way, ← ↓ ↑ →, so a left-handed player plays the lanes with the left thumb
//     and a right-handed one with the right (lefty-safe: neither set is a "main" one; both are live at once). START pauses.
//     A press is a button going DOWN between two polls (padLaneEdges): a held button is one tap.
//   * PHONE — the NEW music_perform schema (registry.ts): four lane buttons (lane_0 … lane_3) + PAUSE. And a phone already
//     paired as the MPC (music_flip, P5) plays PERFORM too: a pad in ROW r is lane r (the rows are coloured as the lanes are
//     drawn — PERFORM_LANE_COLORS), so nobody has to re-pair to perform. (Its PLAY / STOP / REC / BANK keep their P5 jobs.)

import { PERFORM_LANE_COUNT, isPerformLane, type PerformLane } from './performSet';

/** A key press as the map reads it (a KeyboardEvent, or a plain object in a test). */
export interface LaneKeyLike { key: string; code?: string; repeat?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }

/** The keys of each lane, lane by lane: [H, ←], [J, ↓], [K, ↑], [L, →]. */
export const PERFORM_LANE_KEYS: readonly (readonly string[])[] = [['h', 'ArrowLeft'], ['j', 'ArrowDown'], ['k', 'ArrowUp'], ['l', 'ArrowRight']];
/** What the lanes' key chips say on screen. */
export const PERFORM_LANE_KEY_LABELS: readonly string[] = ['H ←', 'J ↓', 'K ↑', 'L →'];

/** The lane a keydown plays, or null (not a lane key, or a chord: ⌘ / Ctrl / Alt + a key belong to the browser). */
export function performLaneForKey(e: LaneKeyLike): PerformLane | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  for (let lane = 0; lane < PERFORM_LANE_COUNT; lane++) if (PERFORM_LANE_KEYS[lane].includes(k)) return lane as PerformLane;
  return null;
}

/** Is this keydown PERFORM's pause (Space, no modifier)? */
export function isPerformPauseKey(e: LaneKeyLike): boolean {
  return !(e.ctrlKey || e.metaKey || e.altKey) && (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space');
}

// ── the pad ────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The standard-mapping buttons of each lane: [X 2, D-pad ← 14], [A 0, D-pad ↓ 13], [Y 3, D-pad ↑ 12], [B 1, D-pad → 15].
 * (https://w3c.github.io/gamepad/#remapping — the face buttons 0 bottom, 1 right, 2 left, 3 top; the d-pad 12 up, 13 down,
 * 14 left, 15 right.)
 */
export const PAD_LANE_BUTTONS: readonly (readonly number[])[] = [[2, 14], [0, 13], [3, 12], [1, 15]];
/** START (standard button 9) pauses / resumes. */
export const PAD_PAUSE_BUTTON = 9;
/** What the lanes' pad chips say (Xbox letters; the D-pad beside them). */
export const PAD_LANE_LABELS: readonly string[] = ['X / ←', 'A / ↓', 'Y / ↑', 'B / →'];

/** One poll of a pad: which buttons are down (index = the standard-mapping button). */
export type PadButtonsDown = readonly boolean[];
/** The pad's buttons as the room polls them (a Gamepad's `buttons[i].pressed`, else a value past half). */
export function padButtonsDown(buttons: readonly { pressed?: boolean; value?: number }[] | null | undefined): boolean[] {
  return (buttons ?? []).map((b) => !!b && (b.pressed === true || (typeof b.value === 'number' && b.value > 0.5)));
}

/**
 * What a pad did between two polls: the lanes whose button went DOWN (each lane once, whichever of its two buttons did it
 * — a face button and its D-pad twin pressed together are one tap), and whether START went down. A held button is one tap.
 */
export function padLaneEdges(prev: PadButtonsDown, now: PadButtonsDown): { lanes: PerformLane[]; pause: boolean } {
  const went = (i: number): boolean => !!now[i] && !prev[i];
  const lanes: PerformLane[] = [];
  for (let lane = 0; lane < PERFORM_LANE_COUNT; lane++) if (PAD_LANE_BUTTONS[lane].some(went)) lanes.push(lane as PerformLane);
  return { lanes, pause: went(PAD_PAUSE_BUTTON) };
}

// ── the phone ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** The music_perform schema's actions (registry.ts): four lanes and PAUSE. */
export const PHONE_LANE_ACTIONS: readonly string[] = ['lane_0', 'lane_1', 'lane_2', 'lane_3'];
export const PHONE_PAUSE_ACTION = 'pause';

/** What one phone action asks PERFORM for. */
export type PerformPhoneCommand = { kind: 'lane'; lane: PerformLane } | { kind: 'pause' };

/**
 * A phone action as PERFORM reads it: music_perform's lane_N / pause, or a music_flip pad (pad_N: the pad's ROW is the lane —
 * rows of four, pad_0 … pad_3 the top row = KICK). Anything else (the MPC's PLAY / STOP / REC / BANK) is not PERFORM's: null.
 */
export function performPhoneCommand(ev: { a?: unknown } | null | undefined): PerformPhoneCommand | null {
  const a = typeof ev?.a === 'string' ? ev.a : '';
  if (a === PHONE_PAUSE_ACTION) return { kind: 'pause' };
  const lane = /^lane_(\d)$/.exec(a);
  if (lane) { const l = Number(lane[1]); return isPerformLane(l) ? { kind: 'lane', lane: l } : null; }
  const pad = /^pad_(\d{1,2})$/.exec(a);
  if (pad) { const p = Number(pad[1]); const l = Math.floor(p / 4); return p < 16 && isPerformLane(l) ? { kind: 'lane', lane: l } : null; }
  return null;
}

// ── pause ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * What PAUSE does to a set: in free play it stops the transport (and PLAY / PAUSE again starts it); an Arena set cannot be
 * paused — it runs to its end on the locked house beat (the rejudge times every tap from its first downbeat), so PAUSE there
 * only says so. Taps while the transport is stopped are not judged (there is no song to be early or late against).
 */
export type PauseEffect = 'stop' | 'start' | 'refused' | 'arena-start';
/**
 * MUSIC-SUITE P6 FIX PASS (2026-09-26): in an Arena run whose attempt is READY (START not pressed yet), a pad's START and
 * Space START it ('arena-start') — they answered "there is no pause", and START MY ONE ATTEMPT could only be reached with a
 * pointer or Tab + Enter, so a player holding only a pad could not begin. Once the set is playing: 'refused', as before.
 */
export function performPauseEffect(s: { arena: boolean; running: boolean; arenaReady?: boolean }): PauseEffect {
  if (s.arena) return s.arenaReady ? 'arena-start' : 'refused';
  return s.running ? 'stop' : 'start';
}
