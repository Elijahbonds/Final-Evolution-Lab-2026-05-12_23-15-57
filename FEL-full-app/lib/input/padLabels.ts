// padLabels — what each button is CALLED on the controller in the player's hands (CONTROLLER-TRY-FIX item 4, C5, 2026-10-28).
//
// The live walkthrough (Part 4, C5): an Xbox pad was told "HOLD R2" (the PlayStation name; it is RT on that pad), and the hint
// "tap JUMP at the line" named a button no controller has. The bindings themselves are right; only the WORDS were generic. This is
// the pure half: a family per controller profile, and the family's word for each canonical button. TEXT ONLY — no glyph art — and
// no brand beyond the two the profile layer already names (lib/input/profiles.ts: xbox-series / xbox-one, dualsense / dualshock4).
//
// `generic` is exactly today's words, so a caller that passes no family (or 'generic') draws what it drew before, byte for byte.
// The keyboard and touch columns are for reference (the panel's keys / touch rows keep their own translation in controlsScreen.ts);
// an empty string is "nothing on this device" — the keyboard has no L2 (PM call, 2026-10-28: no key is bound for it).

import { profileFor } from './profiles';

export type LabelFamily = 'xbox' | 'playstation' | 'generic' | 'keyboard' | 'touch';
/** The families a connected pad can be. */
export type PadFamily = 'xbox' | 'playstation' | 'generic';
export type CanonicalButton = 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1' | 'L2' | 'R2' | 'SELECT' | 'START' | 'L-STICK' | 'R-STICK' | 'D-PAD';
export const CANONICAL_BUTTONS: readonly CanonicalButton[] = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'SELECT', 'START', 'L-STICK', 'R-STICK', 'D-PAD'];

const STICKS = { 'L-STICK': 'L-STICK', 'R-STICK': 'R-STICK', 'D-PAD': 'D-PAD' } as const;

/** Each family's word for each canonical button. The PlayStation words and VIEW / MENU vs CREATE / OPTIONS are PM copy. */
export const PAD_LABELS: Readonly<Record<LabelFamily, Readonly<Record<CanonicalButton, string>>>> = {
  generic: { A: 'A', B: 'B', X: 'X', Y: 'Y', L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2', SELECT: 'SELECT', START: 'START', ...STICKS },
  xbox: { A: 'A', B: 'B', X: 'X', Y: 'Y', L1: 'LB', R1: 'RB', L2: 'LT', R2: 'RT', SELECT: 'VIEW', START: 'MENU', ...STICKS },
  playstation: { A: 'CROSS', B: 'CIRCLE', X: 'SQUARE', Y: 'TRIANGLE', L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2', SELECT: 'CREATE', START: 'OPTIONS', ...STICKS },
  // InputBus KEYMAP (J K L I · Q E · C ESC · SPACE for the held right trigger); no L2 key, no right stick
  keyboard: { A: 'J', B: 'K', X: 'L', Y: 'I', L1: 'Q', R1: 'E', L2: '', R2: 'SPACE', SELECT: 'C', START: 'ESC', 'L-STICK': 'WASD / ARROWS', 'R-STICK': '', 'D-PAD': 'ARROWS' },
  // the touch deck names its buttons by their verbs (MODE_VERBS); only the sticks and the held RUN pad have a fixed word
  touch: { A: '', B: '', X: '', Y: '', L1: '', R1: '', L2: '', R2: 'HOLD', SELECT: '', START: '', 'L-STICK': 'LEFT PAD', 'R-STICK': 'RIGHT PAD', 'D-PAD': '' },
};

/** A profile id (PadInfo.profileId, profiles.ts) → its label family. Every other profile — the Switch family included — is generic. */
export function familyFor(profileId: string | null | undefined): PadFamily {
  if (profileId === 'xbox-series' || profileId === 'xbox-one') return 'xbox';
  if (profileId === 'dualsense' || profileId === 'dualshock4') return 'playstation';
  return 'generic';
}

/** The family's word for one button. */
export const padLabel = (b: CanonicalButton, family: LabelFamily = 'generic'): string => PAD_LABELS[family][b];

/** Other families' words for a canonical button, read back (a row written 'HOLD RB' is R1). */
const ALIAS: Record<string, CanonicalButton> = { LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2' };
const canon = (t: string): CanonicalButton => ALIAS[t] ?? (t as CanonicalButton);

/** Multi-letter button names: never an ordinary word, so they translate anywhere they stand alone. */
const NAMED = /(?<![\w-])(L1|R1|L2|R2|LB|RB|LT|RT|START|SELECT)(?![\w-])/g;
/** A face letter, only where it is plainly a button: before ' · ', ' — ', ' / ', ' + ', ')' or the end, or after '+ ' or '/ '. */
const FACE_BEFORE = /(?<![\w-])([ABXY])(?=\s[·—/+]\s|\)|$)/g;
const FACE_AFTER = /(?<=[+/]\s)([ABXY])(?![\w-])/g;

/** A pad row's input ('HOLD R2', 'A', 'START', 'D-PAD + A/B/X/Y') in the family's words. Generic → unchanged. */
export function relabelInput(input: string, family: PadFamily = 'generic'): string {
  if (family === 'generic') return input;
  const L = PAD_LABELS[family];
  return input
    .replace(NAMED, (t: string) => L[canon(t)])
    .replace(/(?<![\w-])([ABXY])(?![\w-])/g, (t: string) => L[t as CanonicalButton]);
}

/**
 * A mode's line with its buttons named (the panel's lines, the dunk host's live hint). No family → the line, unchanged.
 * The dunk's own phrases gain the button they mean (JUMP is A on the run, or letting go of RUN): 'HOLD to run' → 'HOLD <R2> to run',
 * 'tap JUMP' → 'tap <A> to JUMP', 'press to flush' → 'press <A> to flush'. A button token in the line is put in the family's
 * words — a multi-letter name anywhere it stands alone, a face letter only where it is plainly a button ('A · RUN IT BACK',
 * 'D-PAD UP + Y'), never a word that is a letter ('A MAKE').
 */
export function withButtons(line: string, family?: PadFamily | null): string {
  if (!family) return line;
  const L = PAD_LABELS[family];
  let out = line
    .replace(/\bHOLD to run\b/g, `HOLD ${L.R2} to run`)
    .replace(/\btap (JUMP|jump)\b/g, (_m: string, w: string) => `tap ${L.A} to ${w}`)
    .replace(/\bpress to flush\b/g, `press ${L.A} to flush`);
  if (family === 'generic') return out;
  out = out.replace(NAMED, (t: string) => L[canon(t)]);
  return out.replace(FACE_BEFORE, (t: string) => L[t as CanonicalButton]).replace(FACE_AFTER, (t: string) => L[t as CanonicalButton]);
}

/** The pause's device line under PAUSED — TAP TO RESUME (PM copy, 2026-10-28): 'Press START' / 'Press MENU' / 'Press OPTIONS' / 'Press ESC'. */
export function pauseDeviceLine(family: LabelFamily): string | null {
  const start = PAD_LABELS[family].START;
  return start ? `Press ${start}` : null;
}

/** The first connected pad's family, read from the browser (guarded: no navigator in tests or on the server), or null with no pad. */
export function detectPadFamily(): PadFamily | null {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    const pad = Array.from(navigator.getGamepads() ?? []).find((p) => p && p.connected !== false);
    return pad ? familyFor(profileFor(pad).id) : null;
  } catch { return null; }   // a permissions policy can deny the Gamepad API
}
