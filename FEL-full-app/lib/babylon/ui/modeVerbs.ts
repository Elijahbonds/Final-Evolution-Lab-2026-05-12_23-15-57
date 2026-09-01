// modeVerbs v7 — uniform controller. Every mode now maps onto the SAME
// fixed A/B/X/Y diamond (position + color per slot never change), a d-pad,
// and both sticks — TouchOverlay always draws the full rig regardless of
// mode, exactly like an emulator showing the whole controller. Modes differ
// only in what pressing a slot DOES (`emit`) and what it's called
// (`label`); a slot a mode has no use for is `emit: null` ("inert") and
// still renders, dimmed, doing nothing when pressed.

import type { FelInput } from '../core/InputBus';

export interface VerbButton {
  label: string;                       // verb, not letter: "SLAM", "JAB" — '' for inert slots
  color: string;
  emit: FelInput | null;               // null = inert (rendered, but a no-op)
  hold?: boolean;                      // analog hold → trigger stream (charge)
}
// Always exactly 4, in A, B, X, Y order — TouchOverlay places them itself.
export type ModeVerbConfig = { buttons: [VerbButton, VerbButton, VerbButton, VerbButton] };

const A = (btn: 'A' | 'B' | 'X' | 'Y'): FelInput => ({ t: 'button', btn, pressed: true });
const RT = (value: number): FelInput => ({ t: 'trigger', side: 'R', value });
/** Shoulder button. Held verbs like BOX OUT live here, not on the face diamond. */
const L1 = (): FelInput => ({ t: 'button', btn: 'L1', pressed: true });

// Fixed slot colors — the whole point of a uniform rig: A is always this
// cyan, Y is always this gold, everywhere, the same way a real controller's
// face buttons never change color between games.
const SLOT_COLOR = { A: '#22d3ee', B: '#ff6b3d', X: '#a78bfa', Y: '#ffd75e' } as const;

const inert = (): VerbButton => ({ label: '', color: '#4b5563', emit: null });
/** Build a 4-slot config from up to 4 {slot, label, emit, hold} entries; any
 *  slot not supplied comes back inert (still drawn, does nothing). */
function verbs(defs: Partial<Record<'A' | 'B' | 'X' | 'Y', { label: string; emit: FelInput; hold?: boolean }>>): ModeVerbConfig {
  const slot = (k: 'A' | 'B' | 'X' | 'Y'): VerbButton =>
    defs[k] ? { label: defs[k]!.label, color: SLOT_COLOR[k], emit: defs[k]!.emit, hold: defs[k]!.hold } : inert();
  return { buttons: [slot('A'), slot('B'), slot('X'), slot('Y')] };
}

export const MODE_VERBS: Record<string, ModeVerbConfig> = {
  dunk: verbs({
    A: { label: 'SLAM', emit: A('A') },
    B: { label: 'STYLE', emit: A('B') },
    Y: { label: 'CHARGE', emit: RT(1), hold: true },
    // X left inert on purpose — mid-air tricks fire from the d-pad + A/B/Y
    // combo (see DunkSystem.ts), not a dedicated button of their own.
  }),
  karate: verbs({
    A: { label: 'JAB', emit: A('A') },
    B: { label: 'KICK', emit: A('B') },
    X: { label: 'BLOCK', emit: A('X') },
    Y: { label: 'HEAVY', emit: A('Y') },
  }),
  football: verbs({
    A: { label: 'HURDLE', emit: A('A') },
    X: { label: 'JUKE L', emit: A('X') },
    Y: { label: 'TRUCK', emit: RT(1), hold: true },
    B: { label: 'JUKE R', emit: A('Y') },
  }),
  skateboard: verbs({
    A: { label: 'POP', emit: A('A') },
    B: { label: 'FLIP', emit: A('B') },
    X: { label: 'GRAB', emit: A('X') },
    Y: { label: 'PUMP', emit: RT(1), hold: true },
  }),
  // B is TRICKS.spin + boost fill in SnowboardSlalomMode, not a grab. It was
  // labelled GRAB, so a touch player pressing GRAB spun -- and the real grab,
  // which the mode reads on X, was not on the overlay at all. Both fixed: the
  // label now says what the button does, and X exists.
  snowboard_slalom: verbs({
    A: { label: 'JUMP', emit: A('A') },
    B: { label: 'SPIN', emit: A('B') },
    X: { label: 'GRAB', emit: A('X') },
    Y: { label: 'TUCK', emit: RT(1), hold: true },
  }),
  // Surf had TWO of its four verbs. SurfBreakMode reads B (cutback) and X
  // (grab) as well, and the cutback is one of only two scoring actions a player
  // can actively take -- so on a phone, half the mode was missing and nothing
  // reported it, because an absent slot renders as an inert button rather than
  // failing. This is the same silent-degradation shape as the Karate VS verb-key
  // bug that gave this phase its own permanent guard.
  surf: verbs({
    A: { label: 'AIR', emit: A('A') },
    B: { label: 'CUTBACK', emit: A('B') },
    X: { label: 'GRAB', emit: A('X') },
    Y: { label: 'CARVE', emit: RT(1), hold: true },
  }),
  // The four slots ARE the shot vocabulary — the thing that makes the locked
  // benchmark a rally rather than a metronome. It used one of them.
  tennis: verbs({
    A: { label: 'DRIVE', emit: A('A') },
    B: { label: 'SLICE', emit: A('B') },
    X: { label: 'DROP', emit: A('X') },
    Y: { label: 'LOB', emit: A('Y') },
  }),
  derby: verbs({ A: { label: 'SWING', emit: A('A') } }),
  penalty: verbs({ A: { label: 'STRIKE', emit: A('A') } }),
  golf: verbs({ A: { label: 'SWING', emit: A('A') } }),

  // 1v1 Hoops: shooting is HOLD-then-release on the trigger stream (shot
  // meter). Crossovers come from stick reversal, so no button needed there.
  onevone: verbs({
    Y: { label: 'SHOOT', emit: RT(1), hold: true },
    A: { label: 'BLOCK', emit: A('A') },
    X: { label: 'STEAL', emit: A('X') },
    // BOX OUT was gamepad-only. The mode's own on-screen hint tells you to
    // "hold L1/LT to BOX OUT" while the touch overlay drew no such button — so
    // on a phone the instruction named a control that did not exist, and the B
    // slot sat there inert rendering the bare letter "B". A press/release on a
    // button slot emits pressed true/false, which is exactly what braceHeld
    // wants, so the shoulder verb fits the diamond without a new control type.
    B: { label: 'BOX OUT', emit: L1() },
  }),
  // 3v3 Streetball: held-trigger shot, PASS (B), STEAL (X), BLOCK (A) —
  // the exact bindings LocalInputSource + the modes' onInput already read.
  threevthree: verbs({
    Y: { label: 'SHOOT', emit: RT(1), hold: true },
    B: { label: 'PASS', emit: A('B') },
    X: { label: 'STEAL', emit: A('X') },
    A: { label: 'BLOCK', emit: A('A') },
  }),
  // Court Carnival: four rotating events share one deck. CHARGE covers Slam
  // Rush's held trigger + Trick Gauntlet's pump; GO is every event's A verb
  // (slam/jab/jump/shoot); TRICK is B (kick/flip A); POWER is Y (heavy/flip
  // B). The Gauntlet's X spin is the one verb that didn't fit the 4-button
  // budget — B/Y still give two distinct tricks, so variety scoring works.
  carnival: verbs({
    A: { label: 'GO', emit: A('A') },
    B: { label: 'TRICK', emit: A('B') },
    Y: { label: 'POWER', emit: A('Y') },
    X: { label: 'CHARGE', emit: RT(1), hold: true },
  }),

  // Pass-and-play head-to-head dunk contest — no mid-air tricks here (see
  // DunkDuelMode.ts), so X stays inert rather than wired to nothing.
  dunkduel: verbs({
    A: { label: 'SLAM', emit: A('A') },
    B: { label: 'STYLE', emit: A('B') },
    Y: { label: 'CHARGE', emit: RT(1), hold: true },
  }),

  // Karate VS uses the exact same verb set as Karate Endless — BLOCK is
  // press-AND-release aware in the mode (hold to guard, tap to parry).
  // NOTE: key must be 'karate_vs' (underscore) — karate-vs-babylon.tsx renders
  // <TouchOverlay modeId="karate_vs">, so a hyphenated key here silently fell
  // through to MODE_VERBS.default (a single ACTION/A button), making KICK,
  // HEAVY, and BLOCK completely unreachable from the touch UI.
  karate_vs: verbs({
    A: { label: 'JAB', emit: A('A') },
    B: { label: 'KICK', emit: A('B') },
    X: { label: 'BLOCK', emit: A('X') },
    Y: { label: 'HEAVY', emit: A('Y') },
  }),
  mixedcombat: verbs({
    A: { label: 'STRIKE', emit: A('A') },
    B: { label: 'KICK', emit: A('B') },
    X: { label: 'GUARD', emit: A('X') },
    Y: { label: 'HEAVY', emit: A('Y') },
  }),
  // Soul-Calibur-lane weapon duel (DuelMode.ts). Same A/B/Y buttons do double
  // duty: during weapon select they PICK fists/blade/staff (matching the
  // mode's own on-screen hint), then in the fight they're that weapon's
  // three moves in order. BLOCK on X — hold to guard, flick the left stick
  // toward the opponent at the moment of impact for a GUARD IMPACT no-sell.
  duel: verbs({
    A: { label: 'FISTS', emit: A('A') },
    B: { label: 'BLADE', emit: A('B') },
    X: { label: 'BLOCK', emit: A('X') },
    Y: { label: 'STAFF', emit: A('Y') },
  }),

  // Showdown (Naruto-Storm lane). The mode's four face verbs; its L1 dash-cancel,
  // R1 substitution and SELECT assist are shoulder/system inputs that the touch
  // pad has no slot for — they remain gamepad/keyboard only, which the mode's
  // own on-screen hint already states.
  showdown: verbs({
    A: { label: 'JAB', emit: A('A') },
    B: { label: 'KICK', emit: A('B') },
    X: { label: 'GUARD', emit: A('X') },
    Y: { label: 'ULTIMATE', emit: A('Y') },
  }),

  // Air-session family (gymnastics vault / snowboard big air). The RUN is the
  // d-pad cadence — alternating left/right strides — so the face buttons only
  // carry the two air verbs.
  gymnastics: verbs({
    A: { label: 'FLIP', emit: A('A') },
    B: { label: 'STICK', emit: A('B') },
  }),
  bigair: verbs({
    A: { label: 'SPIN', emit: A('A') },
    B: { label: 'STOMP', emit: A('B') },
  }),

  // Sprint: the race IS the d-pad cadence, so no face verb does anything. All
  // four stay inert rather than pretending a button matters.
  sprint: verbs({}),

  // Rhythm dance. No movement stick use — the body IS the game; one TAP verb
  // judged against the beat. B also taps (mode reads A or B).
  // 3PT Shootout: one verb, the release. Timing is the whole mechanic.
  threepoint: verbs({ A: { label: 'SHOOT', emit: A('A') } }),

  // Volleyball had NO entry at all, so touch fell through to MODE_VERBS.default
  // — one generic ACTION button — which is the original karate_vs bug in a mode
  // that shipped. NetSportMode reads exactly one verb (A, or the R trigger as
  // an analog alias), so one labelled button is the correct entry TODAY. The
  // benchmark wants three: bump / set / spike is the whole loop of Nintendo
  // Switch Sports volleyball, and this mode currently treats all three touches
  // as the same generic hit. That is a Phase 2 change recorded in the concept
  // lock, not something to fake here by adding buttons the mode cannot read.
  volleyball: verbs({
    A: { label: 'HIT', emit: A('A') },
    B: { label: 'BLOCK', emit: A('B') },
  }),

  dance: verbs({ A: { label: 'TAP', emit: A('A') } }),

  default: verbs({ A: { label: 'ACTION', emit: A('A') } }),
};
