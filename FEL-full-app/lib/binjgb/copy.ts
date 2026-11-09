// lib/binjgb/copy.ts — BINJGB-SHELF-1: every user-facing string for the Homebrew Shelf, in one place (T-NO-TM-COPY,
// T-NO-ROM-SITE-COPY scan this module). Trademark rule (OQ-11): no console or platform-maker names anywhere in UI copy;
// the file extensions .gb / .gbc appear only as extensions. Never the word for a cartridge dump in UI copy (G5).

/** The shelf (spec §1 / §3.3.2, real copy — not placeholder). */
export const SHELF_COPY = {
  title: 'Homebrew Shelf',
  subtitle: 'Homebrew handheld games made by independent creators.',
  empty: 'No games on the shelf.',
  wasmFail: "The player couldn't start on this device.",
  credits: 'Credits and licences',
  back: 'Back',
  /** The quiet play-hub row's label (OQ-8). It never renders while the shelf has no titles. */
  row: 'Homebrew Shelf',
  /** Page <title>. */
  metaTitle: 'Homebrew Shelf · Final Evolution Lab',
} as const;

/**
 * Unknown age (G6): the age prompt, not the shelf's player. The same words FEL already uses for an unknown age
 * (lib/coach/teenGate.ts TEEN_GATE_COPY.age_required), pointed back here.
 */
export const AGE_PROMPT_COPY = {
  message: 'Tell us the year you were born first.',
  action: 'Add your birth year',
  href: '/age?next=%2Fplay%2Fgb-shelf',
} as const;

/**
 * Player controls (APPROVED copy, Vibe review, Nov 9 2026): not part of the pending picker card.
 * Full screen is one-way: the button only calls requestFullscreen() on a tap; leaving is the browser's own Esc/back,
 * so there is no "Exit full screen" state to label.
 */
export const PLAYER_CONTROLS_COPY = {
  stop: 'Stop',
  fullscreen: 'Full screen',
} as const;

/**
 * Load-your-own picker (spec §3.5 "UI — picker copy"). PLACEHOLDER, NOT FINAL: the PM sends these strings to Elijah on a
 * card before they ship (BINJGB_LOCAL_FILE_ENABLED stays OFF until then and until G-FILE). The disclaimer renders
 * before the chooser opens (G-FILE item 8).
 */
export const PICKER_COPY = {
  pendingElijahCard: true,
  button: 'Load a game file',
  helper: 'Choose a .gb or .gbc file from this device. It stays on your device. FEL never uploads it.',
  /** Shown after a pick, with the name cut to 40 characters on screen; the name is never stored or sent. */
  picked: 'Your file',
  disclaimer:
    'You are responsible for the files you open. Only open games you have the right to use. Final Evolution does not provide game files, does not link to places that share them, and does not upload your file. The file stays on this device.',
  /** PLACEHOLDER rejects, pending Elijah's card t4785s52422. */
  tooBig: "That file is too big. Choose a file that's 8 MB or smaller.",
  wrongType: 'Choose a .gb or .gbc file.',
  unreadable: "That file couldn't be opened. Try a different file.",
} as const;

/** The longest file name shown on screen after a pick (spec §3.5: ≤40 chars). */
export const PICKED_NAME_MAX = 40;

/** Saves (G7, spec §3.6 — real strings). */
export const SAVES_COPY = {
  control: 'Delete saves',
  confirmTitle: 'Delete saves on this device?',
  confirmBody: "This removes battery saves and save states for Homebrew Shelf on this device only. It can't be undone.",
  confirm: 'Delete saves',
  cancel: 'Keep saves',
  done: 'Saves deleted.',
  quota: "Couldn't save on this device.",
} as const;

/** The credits line (spec §3.2). Text only — no outbound link (G5). */
export const BINJGB_CREDIT_LINE = 'Homebrew player: binjgb by Ben Smith (binji), MIT License.';

/** On-screen controls' accessible names (touch at 390px). */
export const CONTROL_LABELS = {
  up: 'Up', down: 'Down', left: 'Left', right: 'Right', a: 'A', b: 'B', start: 'Start', select: 'Select',
  /** The player canvas inside the local frame. */
  screen: 'Player screen',
  /** The local frame's iframe title. */
  frame: 'Your game',
} as const;

/** Every string above, flattened, for the copy scans. */
export function allShelfCopy(): string[] {
  const out: string[] = [];
  for (const group of [SHELF_COPY, AGE_PROMPT_COPY, PLAYER_CONTROLS_COPY, PICKER_COPY, SAVES_COPY, CONTROL_LABELS]) {
    for (const v of Object.values(group)) if (typeof v === 'string') out.push(v);
  }
  out.push(BINJGB_CREDIT_LINE);
  return out;
}
