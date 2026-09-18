// CONTROLLER PROFILES — the pad is not always the pad you think (2026-09-13).
//
// Mission Phase A.3. The audit (docs/AUDIT-INPUT-PRESENCE.md) found this to be the single biggest real gap:
// NOTHING in the tree read `gamepad.id` or `gamepad.mapping`. Both pad paths assumed the W3C Standard
// Gamepad layout and indexed straight into `buttons[0..15]`, so a controller that reports a NON-STANDARD
// mapping — which is what a Switch Pro and most Joy-Con configurations do — was mis-mapped silently. Not
// "handled badly": there was no code path that could notice.
//
// What a profile is: a name test against `gamepad.id`, a mapping table, a deadzone, and the truth about
// whether the thing actually works on this device. Everything here is pure — the same table drives the live
// poller and the fixture tests, so "a DualSense and a Switch Pro produce identical canonical output for the
// same physical input" is a unit test rather than a hope.

/** The canonical buttons, in the vocabulary the tree already speaks (InputBus.FelInput). */
export type PadButton = 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1' | 'SELECT' | 'START' | 'LS' | 'RS';
export type PadDir = 'up' | 'down' | 'left' | 'right';

export interface PadMapping {
  /** Canonical button → physical index. */
  buttons: Record<PadButton, number>;
  /** D-pad direction → physical index. −1 means "this pad reports the d-pad on an AXIS instead". */
  dpad: Record<PadDir, number>;
  /** Analog trigger indices. */
  triggers: { L: number; R: number };
  /** Stick axis indices. */
  axes: { lx: number; ly: number; rx: number; ry: number };
  /**
   * Some pads report the d-pad as a HAT on an axis (a single axis cycling 8 directions) rather than as four
   * buttons. −1 when the pad uses buttons, which is the standard layout.
   */
  hatAxis: number;
}

/** The W3C Standard Gamepad. Xbox, DualSense over USB, and anything honest about `mapping === 'standard'`. */
export const STANDARD_MAPPING: PadMapping = {
  buttons: { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, SELECT: 8, START: 9, LS: 10, RS: 11 },
  dpad: { up: 12, down: 13, left: 14, right: 15 },
  triggers: { L: 6, R: 7 },
  axes: { lx: 0, ly: 1, rx: 2, ry: 3 },
  hatAxis: -1,
};

/**
 * The Switch Pro Controller, reported NON-STANDARD.
 *
 * Two things differ and both matter. The face buttons are physically laid out with B at the BOTTOM and A at
 * the RIGHT (the opposite of an Xbox pad), and the browser reports them in that physical order — so a naive
 * `buttons[0] = A` puts the game's confirm on the button labelled B, which is exactly the "silently
 * mis-mapped" failure. FEL's canonical A means "the bottom face button, the one you press to do the thing",
 * because that is what every mode's code means by it; so A maps to the Switch's physical B position.
 *
 * We map by POSITION, not by letter. A player looking at their Switch pad sees the game's A prompt on the
 * bottom button, which is where their thumb already is.
 */
export const SWITCH_PRO_MAPPING: PadMapping = {
  buttons: { A: 1, B: 0, X: 3, Y: 2, L1: 4, R1: 5, SELECT: 8, START: 9, LS: 10, RS: 11 },
  dpad: { up: 12, down: 13, left: 14, right: 15 },
  triggers: { L: 6, R: 7 },
  axes: { lx: 0, ly: 1, rx: 2, ry: 3 },
  hatAxis: -1,
};

/**
 * A single Joy-Con held sideways.
 *
 * The whole controller is rotated 90°, so the stick's axes are swapped AND one is inverted, and the four
 * face buttons are read a quarter-turn round. This is the most commonly broken configuration in browser
 * games and the least commonly tested, which is why it has its own entry rather than falling back.
 */
export const JOYCON_SINGLE_MAPPING: PadMapping = {
  buttons: { A: 0, B: 2, X: 1, Y: 3, L1: 4, R1: 5, SELECT: 8, START: 9, LS: 10, RS: 11 },
  dpad: { up: 12, down: 13, left: 14, right: 15 },
  triggers: { L: 6, R: 7 },
  // sideways: what the pad calls X is the player's Y, and the player's X runs the other way
  axes: { lx: 1, ly: 0, rx: 3, ry: 2 },
  hatAxis: -1,
};

export interface ControllerProfile {
  id: string;
  name: string;
  /** Matched against `gamepad.id`, lower-cased. */
  test: RegExp;
  mapping: PadMapping;
  /** Radial deadzone for this pad's sticks. */
  deadzone: number;
  /**
   * Known not to work on some devices, with the reason. Surfaced to the player instead of failing silently —
   * the mission's instruction for the Switch 2 Pro over Bluetooth on iOS, generalised to a field so the next
   * one of these is data rather than a special case.
   */
  unsupported?: { on: (ua: string) => boolean; why: string };
}

/** Is this a browser on an Apple mobile OS? Used only by the unsupported test below. */
export function isIosLike(ua: string): boolean {
  const s = ua.toLowerCase();
  // iPadOS 13+ reports a Mac UA with touch, which is why this is not just /iphone|ipad/
  return /iphone|ipad|ipod/.test(s) || (/macintosh/.test(s) && /mobile|touch/.test(s));
}

/**
 * The profiles, most specific first.
 *
 * Order matters: 'switch 2 pro' has to be tested before 'switch pro', and every vendor entry before the
 * generic fallbacks. The list is walked top to bottom and the first match wins.
 */
export const PROFILES: readonly ControllerProfile[] = [
  {
    id: 'switch2-pro', name: 'Switch 2 Pro Controller',
    test: /switch\s*2|nintendo.*2\s*pro|057e-2069/,
    mapping: SWITCH_PRO_MAPPING, deadzone: 0.12,
    unsupported: {
      on: isIosLike,
      // stated as a device limitation, not a defect in the player's hardware or in the game
      why: 'This controller does not connect reliably over Bluetooth on this device. Try a different controller, or play on a computer.',
    },
  },
  { id: 'switch-pro', name: 'Switch Pro Controller', test: /switch\s*pro|057e-2009|pro controller/, mapping: SWITCH_PRO_MAPPING, deadzone: 0.12 },
  { id: 'joycon-pair', name: 'Joy-Con Pair', test: /joy-?con.*(pair|l\/r|charging grip)/, mapping: STANDARD_MAPPING, deadzone: 0.15 },
  { id: 'joycon-single', name: 'Joy-Con', test: /joy-?con/, mapping: JOYCON_SINGLE_MAPPING, deadzone: 0.18 },
  { id: 'dualsense', name: 'DualSense', test: /dualsense|054c-0ce6|054c-0df2|ps5/, mapping: STANDARD_MAPPING, deadzone: 0.10 },
  { id: 'dualshock4', name: 'DualShock 4', test: /dualshock|054c-09cc|054c-05c4|ps4/, mapping: STANDARD_MAPPING, deadzone: 0.12 },
  { id: 'xbox-series', name: 'Xbox Wireless Controller', test: /xbox.*(series|wireless)|045e-0b12|045e-0b13/, mapping: STANDARD_MAPPING, deadzone: 0.12 },
  { id: 'xbox-one', name: 'Xbox Controller', test: /xbox|045e-/, mapping: STANDARD_MAPPING, deadzone: 0.14 },
];

export const GENERIC_STANDARD: ControllerProfile = {
  id: 'generic-standard', name: 'Controller', test: /.^/, mapping: STANDARD_MAPPING, deadzone: 0.15,
};

/**
 * The last resort, for a pad that matches nothing AND does not claim the standard mapping.
 *
 * It uses the standard table anyway, because a guess that follows the published spec is the best available
 * guess — but it is a SEPARATE profile so the remap UI can say "we do not recognise this controller, check
 * the buttons" instead of pretending everything is fine.
 */
export const GENERIC_FALLBACK: ControllerProfile = {
  id: 'generic-fallback', name: 'Unrecognised controller', test: /.^/, mapping: STANDARD_MAPPING, deadzone: 0.18,
};

/**
 * Normalise a gamepad id before matching.
 *
 * THE BROWSERS DO NOT AGREE ON THIS STRING. Chrome writes a DualShock 4 as
 *   "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)"
 * and Firefox writes the same pad as
 *   "054c-09cc-Wireless Controller".
 * A table written against one of those silently fails on the other — caught by the fixture test, which used
 * the Chrome spelling against a table written in the Firefox one. Collapsing "Vendor: x Product: y" into
 * "x-y" means every profile can be written once, in the compact form, and match both.
 */
export function normalizePadId(id: string): string {
  return id.toLowerCase().replace(/vendor:\s*([0-9a-f]{4})\s+product:\s*([0-9a-f]{4})/i, '$1-$2');
}

/**
 * Pick the profile for a pad.
 *
 * `mapping` is consulted only when the id matches nothing: a pad we RECOGNISE is mapped by its profile
 * whatever it claims, because the reason the profile exists is usually that the claim is wrong.
 */
export function profileFor(pad: { id?: string; mapping?: string } | null | undefined): ControllerProfile {
  const id = normalizePadId(pad?.id ?? '');
  for (const p of PROFILES) if (p.test.test(id)) return p;
  return pad?.mapping === 'standard' ? GENERIC_STANDARD : GENERIC_FALLBACK;
}

/** Can this controller actually be used on this device? */
export function supportCheck(profile: ControllerProfile, userAgent: string): { ok: true } | { ok: false; why: string } {
  if (profile.unsupported && profile.unsupported.on(userAgent)) return { ok: false, why: profile.unsupported.why };
  return { ok: true };
}

// ── Deadzone ───────────────────────────────────────────────────────────────
/**
 * RADIAL deadzone, which is what the tree did not have.
 *
 * Both existing paths dead-zoned each axis independently (`|x| < 0.15 ? 0 : x`), and a per-axis deadzone
 * makes a square hole in a round stick: pushed diagonally at 0.14 on each axis the stick is 0.20 from
 * centre — a real, deliberate push — and both axes read zero. It also lets a stick resting at 0.16 on one
 * axis leak a permanent drift. Radial measures the magnitude, kills it below the threshold, and RESCALES the
 * remainder to 0..1 so the first millimetre past the deadzone is a small input rather than a jump to 0.15.
 */
export function radialDeadzone(x: number, y: number, dz: number): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (!(m > dz)) return { x: 0, y: 0 };
  const scaled = Math.min(1, (m - dz) / (1 - dz)) / m;
  return { x: x * scaled, y: y * scaled };
}

// ── Reading a pad through a profile ────────────────────────────────────────
/** The minimal shape this module needs from a Gamepad, so tests need no browser. */
export interface PadLike {
  id?: string;
  mapping?: string;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

/** A pad's state in canonical terms. The SAME shape whatever the controller is — that is the entire point. */
export interface CanonicalPad {
  lx: number; ly: number; rx: number; ry: number;
  triggers: { L: number; R: number };
  buttons: Record<PadButton, boolean>;
  dpad: Record<PadDir, boolean>;
}

const HAT_DIRS: Record<PadDir, [number, number][]> = {
  // a hat axis cycles −1 (up) through +1; these are the ranges each direction occupies on a −1..1 hat
  up: [[-1.1, -0.9], [0.9, 1.1]], right: [[-0.5, -0.3]], down: [[-0.1, 0.1]], left: [[0.4, 0.6]],
};

function hatHas(v: number, dir: PadDir): boolean {
  return HAT_DIRS[dir].some(([lo, hi]) => v >= lo && v <= hi);
}

/**
 * Read a pad in canonical terms.
 *
 * Everything a mode ever sees comes through here, which is why the acceptance criterion — "DualSense, Xbox
 * Series and Switch Pro each produce identical canonical output for the same physical input" — is testable
 * with three fixtures and no hardware.
 */
export function readPad(pad: PadLike, profile: ControllerProfile = profileFor(pad)): CanonicalPad {
  const m = profile.mapping;
  const btn = (i: number): boolean => !!pad.buttons[i]?.pressed;
  const ax = (i: number): number => pad.axes[i] ?? 0;
  const L = radialDeadzone(ax(m.axes.lx), ax(m.axes.ly), profile.deadzone);
  const R = radialDeadzone(ax(m.axes.rx), ax(m.axes.ry), profile.deadzone);
  const dpad = m.hatAxis >= 0
    ? { up: hatHas(ax(m.hatAxis), 'up'), down: hatHas(ax(m.hatAxis), 'down'), left: hatHas(ax(m.hatAxis), 'left'), right: hatHas(ax(m.hatAxis), 'right') }
    : { up: btn(m.dpad.up), down: btn(m.dpad.down), left: btn(m.dpad.left), right: btn(m.dpad.right) };
  return {
    lx: L.x, ly: L.y, rx: R.x, ry: R.y,
    triggers: { L: pad.buttons[m.triggers.L]?.value ?? 0, R: pad.buttons[m.triggers.R]?.value ?? 0 },
    buttons: {
      A: btn(m.buttons.A), B: btn(m.buttons.B), X: btn(m.buttons.X), Y: btn(m.buttons.Y),
      L1: btn(m.buttons.L1), R1: btn(m.buttons.R1),
      SELECT: btn(m.buttons.SELECT), START: btn(m.buttons.START),
      LS: btn(m.buttons.LS), RS: btn(m.buttons.RS),
    },
    dpad,
  };
}

/** Is anything at all pressed? The "press any button to join" test — a pad is invisible to JS until then. */
export function anyPressed(pad: PadLike): boolean {
  return pad.buttons.some((b) => b?.pressed) || pad.axes.some((a) => Math.abs(a) > 0.5);
}
