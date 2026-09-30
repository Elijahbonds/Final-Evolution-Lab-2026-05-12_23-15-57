// lib/breath/presets.ts — the breath presets, in FEL's own words and timings (MIRROR-COACH P7, 2026-09-29).
//
// WHAT WAS MISSING. The crossref's breathing row (crossref-wf_dfad67b3-209.json, "Book cross-check, breathing
// strategies") found breath work only as KB items and one corrective dose: nothing to do with the minute between two
// sets, and nothing to finish a session on (P6 has since added the owner's recovery breath to the automatic cool-down,
// lib/coach/cooldown.ts, running its own pacer arithmetic). Owner decision #11: add both, no HRV or injury claims.
//
// THE TWO PRESETS (every one runs the one pacer, lib/breath/pacer.ts; components/breath/Pacer.tsx draws it):
//   · BETWEEN_SET_SETTLE — a short breath led by the breath out, run INSIDE a rest timer (Today's set timer offers it as
//     a "Settle" chip on every rest long enough to hold it: components/coach/set-timer.tsx). FEL's timing: in through
//     the nose for 3, out slow for 6, a 1-second pause, four breaths — 40 s, which leaves a 60 s rest 20 s to set up.
//     On a shorter rest it gives up whole breaths rather than squeezing them (settleFor, below), and a rest too short
//     for two breaths offers no chip at all. It never runs during a set: it lives on the REST timer and nowhere else.
//     assumption: 3 / 6 / 1 × 4 is FEL's choice (the brief asked for "a short exhale-led settle" in FEL's timings).
//   · POST_SESSION_BREATH — the longer breath that finishes a session: the owner's own recovery breath (the
//     Neuro-Mechanic Playbook ch9, "The 4-6 Recovery Breath": in for 4, out for 6, a short pause — taken at 2 s — ten
//     breaths, 120 s). P6's automatic cool-down already runs exactly this breath; it now reads its numbers from here
//     (lib/coach/cooldown.ts RECOVERY_BREATH), so there is one post-session breath, not two.
//     assumption: the post-session preset IS the owner's recovery breath, unchanged, rather than a second breath with
//     new numbers — the owner wrote this one for exactly this moment, and the cool-down's tested 3–5 minutes stand.
//
// NOT HERE. The Mirror's breathe-first 4-2-6 (lib/mirror/squatStage.ts SQUAT_BREATH_PACER) and the Wake-Up's Pressurize
// (lib/drills WAKE_UP) keep their own specs where their stages live; they run the same pacer. The adults-only ramp-up
// breath before a key set is a separate, gated piece of this phase (not a preset anyone can start).
//
// HONESTY (lib/share/screen.ts; owner decision #11). "It helps you settle" is the most any line here says. No heart rate,
// no HRV, no nervous system, no stress chemistry, nothing about injury or pain, no condition, no book (presets.test.ts
// lints every line, and the P6 cool-down lint's word lists with it). Youth-safe: an easy breath with no hold, nothing a
// minor is kept from (owner decision #6 keeps only the ramp-up breath from them). Nothing here is scored, paid or
// streaked; a preset saves nothing on its own.
//
// Pure: no DOM, no clock.
import { pacerCycleSec, pacerLengthSec, pacerFrom, type PacerSpec } from './pacer';

export type BreathPresetId = 'between-set' | 'post-session';

export interface BreathPreset {
  id: BreathPresetId;
  /** What the chip / the step calls it. */
  name: string;
  /** The pacer, starting at 0 on its host's clock (a host moves it with pacerFrom). */
  spec: PacerSpec;
  /** One line: what it is and when, FEL's words. */
  lead: string;
  /** How to do it. */
  cue: string;
  /** Where it comes from ('fel' = FEL's own; the Playbook's chapter where the owner wrote it). */
  source: 'fel' | 'playbook ch9';
  /** Always true: no hold, nothing hard; a minor may use it (owner decision #6). */
  youthSafe: true;
}

/** Between sets: a short settle, longer out than in. FEL's timing (see the header). */
export const BETWEEN_SET_SETTLE: BreathPreset = {
  id: 'between-set',
  name: 'Settle breath',
  spec: { from: 0, inSec: 3, holdSec: 0, outSec: 6, restSec: 1, rounds: 4 },
  lead: 'A few slow breaths while you rest, longer out than in. It helps you settle before the next set.',
  cue: 'In through the nose for 3, out slow for 6, a short pause. Easy breaths, never forced.',
  source: 'fel',
  youthSafe: true,
};

/** After the session: the owner's 4-6 recovery breath (Playbook ch9), ten breaths. */
export const POST_SESSION_BREATH: BreathPreset = {
  id: 'post-session',
  name: '4-6 Recovery Breath',
  spec: { from: 0, inSec: 4, holdSec: 0, outSec: 6, restSec: 2, rounds: 10 },
  lead: 'Ten slow breaths to finish the session, longer out than in. It helps you settle after the work.',
  cue: 'In through the nose for 4, out slow through pursed lips for 6, then a short pause.',
  source: 'playbook ch9',
  youthSafe: true,
};

export const BREATH_PRESETS: readonly BreathPreset[] = [BETWEEN_SET_SETTLE, POST_SESSION_BREATH];

export const presetById = (id: BreathPresetId): BreathPreset => BREATH_PRESETS.find((p) => p.id === id)!;

/** Every line a preset can show, for the copy lint. */
export const presetLines = (p: BreathPreset): string[] => [p.name, p.lead, p.cue];

// ── the settle inside a rest ─────────────────────────────────────────────────────────────────────────────────────────

/** Seconds a rest keeps AFTER the settle, to set up for the next set (chalk, the bar, the stance). FEL's choice. */
export const SETTLE_SETUP_SEC = 15;
/** Fewer whole breaths than this is not a settle: no chip. */
export const SETTLE_MIN_ROUNDS = 2;

/**
 * The settle for what is left of a rest: BETWEEN_SET_SETTLE starting `startSec` into the rest timer, with as many whole
 * breaths (up to the preset's four) as fit before the last SETTLE_SETUP_SEC of the rest. null when fewer than
 * SETTLE_MIN_ROUNDS fit — the chip is not offered, and a settle never runs into the next set.
 */
export function settleFor(restSec: number, startSec = 0): PacerSpec | null {
  if (!Number.isFinite(restSec) || !Number.isFinite(startSec) || startSec < 0) return null;
  const base = BETWEEN_SET_SETTLE.spec;
  const room = restSec - startSec - SETTLE_SETUP_SEC;
  const rounds = Math.min(base.rounds, Math.floor(room / pacerCycleSec(base)));
  if (!(rounds >= SETTLE_MIN_ROUNDS)) return null;
  return pacerFrom({ ...base, rounds }, startSec);
}

/** Whether a rest of `restSec` has room for a settle from its start (the chip's show / hide). */
export const restHoldsSettle = (restSec: number): boolean => settleFor(restSec, 0) !== null;

/** The chip's words: "Settle · 40 s". */
export const settleChipLabel = (spec: PacerSpec): string => `Settle · ${Math.round(pacerLengthSec(spec))} s`;

export interface SettleChip {
  /** The item has a rest timer that can hold a settle from its start. */
  show: boolean;
  /** The settle a tap starts NOW, on the rest timer's clock; null = the chip is disabled (`why` says which way). */
  spec: PacerSpec | null;
  label: string;
  /** Why a shown chip is disabled: a set's timer is running, too little of this rest is left, or another breath (the
   *  Dial-Up Breath) is running on the same card. null otherwise. */
  why: 'set-running' | 'rest-too-short' | 'other-breath' | null;
}

/** A disabled chip's title, FEL's words (presets.test.ts lints them with the rest). */
export const SETTLE_WHY_LINE: Record<NonNullable<SettleChip['why']>, string> = {
  'set-running': 'For the rest between sets. Finish or stop the set timer first.',
  'rest-too-short': 'Too little of this rest is left for a settle. Set up for the next set.',
  // MIRROR-COACH P7 FIX (2026-09-29, review): one breath at a time on a card — see settleChip's `otherBreath`
  'other-breath': 'Finish the Dial-Up Breath first. One breath at a time.',
};

/**
 * The Settle chip on a rest timer. `restSec` = the item's prescribed rest (null / 0: no rest timer, no chip).
 * `restElapsedSec` = seconds into a rest run that is live now, or null when no rest is running — then a tap starts the
 * rest AND the settle from 0. With a rest running, the settle starts where the rest is, with the breaths that still fit
 * before the set-up time; past that point the chip stays in place, disabled, rather than squeezing a breath into the
 * next set.
 *
 * `setLive` = a work or hold timer — a SET — is running now (not done; paused counts as running). MIRROR-COACH P7
 * review (2026-09-29): the chip used to be live then too, and a tap started the rest, which REPLACED the set's timer
 * (SetTimer's start swaps the run; only Stop logs a timed set's seconds) — the settle cut into the set and the seconds
 * worked were never logged. Now the chip stays in place, disabled, until the set's timer is done or stopped.
 */
export function settleChip(restSec: number | null | undefined, restElapsedSec: number | null, setLive = false, otherBreath = false): SettleChip {
  const rest = typeof restSec === 'number' && Number.isFinite(restSec) ? restSec : 0;
  if (!restHoldsSettle(rest)) return { show: false, spec: null, label: BETWEEN_SET_SETTLE.name, why: null };
  if (setLive && restElapsedSec === null) {
    return { show: true, spec: null, label: settleChipLabel(settleFor(rest, 0)!), why: 'set-running' };
  }
  // MIRROR-COACH P7 FIX (2026-09-29, review): `otherBreath` = the Dial-Up Breath is running on this card. The settle
  // (in 3, out 6) and the Dial-Up (one second in, one out, sharp) could run side by side, two rings giving opposite
  // instructions at once. Today's key-set card now keeps one breath at a time: while the Dial-Up runs the chip stays in
  // place, disabled, and says so (the other direction — a settle live, then the Dial-Up — cannot happen: a settle
  // starts a rest, and any timer started on the key set's card closes the Dial-Up offer).
  if (otherBreath) {
    return { show: true, spec: null, label: settleChipLabel(settleFor(rest, 0)!), why: 'other-breath' };
  }
  const spec = settleFor(rest, restElapsedSec ?? 0);
  return spec
    ? { show: true, spec, label: settleChipLabel(spec), why: null }
    : { show: true, spec: null, label: 'Settle', why: 'rest-too-short' };
}

// ── a timed item that IS the post-session breath ─────────────────────────────────────────────────────────────────────

/**
 * MIRROR-COACH P7 FIX (2026-09-29, review): THE OFF DAY'S BREATH RAN ON A BARE CLOCK. P6's off day
 * (lib/coach/offDay.ts) ends with the owner's 4-6 Recovery Breath as an ordinary Today item timed by a Work run
 * (workSeconds 180 = 15 breaths of 12 s), and an off day has no automatic cool-down (lib/coach/cooldown.ts
 * needsAutoCooldown is false for kind 'recovery') — so on an off day it is the only recovery breath, and Today drew it
 * as "Work 3:00" counting down with no in / out / pause ring and no count, while the same named breath in the
 * automatic cool-down ran on the one pacer. Measured with a tsx render of SetTimer over timersFor(the off day's breath
 * item): one 'work' timer and no data-pacer anywhere.
 *
 * The item's breath as the one pacer's spec, starting at 0 on its Work run's clock (components/coach/set-timer.tsx
 * draws it while that run is live, so pausing the clock pauses the ring). Only for the post-session preset by name (its
 * timing is known), only on a catalogue row filed as a breath, and only when the work time is a whole number of its
 * breaths; anything else keeps the plain clock rather than a ring that ends out of step with it.
 */
export function workBreathFor(
  item: { name?: string | null; workSeconds?: number | null },
  row?: { pattern?: unknown; category?: unknown } | null,
): PacerSpec | null {
  const sec = item.workSeconds;
  if (!(typeof sec === 'number' && Number.isFinite(sec) && sec > 0)) return null;
  if (item.name !== POST_SESSION_BREATH.name) return null;
  if (row?.pattern !== 'breath' && row?.category !== 'breath') return null;
  const cycle = pacerCycleSec(POST_SESSION_BREATH.spec);
  const rounds = sec / cycle;
  return Number.isInteger(rounds) && rounds >= 1 ? { ...POST_SESSION_BREATH.spec, from: 0, rounds } : null;
}
