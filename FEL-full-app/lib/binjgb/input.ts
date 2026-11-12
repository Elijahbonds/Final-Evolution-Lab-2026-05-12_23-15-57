// lib/binjgb/input.ts — BINJGB-SHELF-1 input scope (Cyber G8, review 067e0dce).
//
// - Keyboard: handled by the player's own focused canvas only (inside the sandboxed frame). No window-level listener,
//   no global preventDefault, and never while a text field has focus.
// - Gamepad: navigator.getGamepads() is read by the shelf page only while the page is visible AND the player is on
//   screen; the button state is posted into the frame. (The frame cannot read pads itself: Permissions-Policy
//   gamepad=(self) keeps the opaque-origin frame out, which is what we want.)
// - No Pointer Lock, no Keyboard Lock, no auto-fullscreen (fullscreen only on a tap), no vibration.
// - Pads are read through the input layer's readPad (lib/input/profiles.ts), so the controller profile decides which
//   physical button is canonical A/B/START/… (a Switch Pro maps by position, like every FEL mode). No raw index here
//   (lib/input/noRawIndices.test.ts).
import { profileFor, readPad, type PadLike } from '@/lib/input/profiles';

/** Joypad bits (the order the frame applies them). */
export const BUTTON = { right: 1, left: 2, up: 4, down: 8, a: 16, b: 32, select: 64, start: 128 } as const;
export type ButtonName = keyof typeof BUTTON;

/** KeyboardEvent.code → button. */
export const KEY_TO_BUTTON: Readonly<Record<string, ButtonName>> = {
  ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up', ArrowDown: 'down',
  KeyX: 'a', KeyZ: 'b', Enter: 'start', Backspace: 'select', ShiftRight: 'select',
};

/** Is this element a place the player is typing (so keys are never captured there)? */
export function isTextEntry(el: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false;
  const tag = (el.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/** Read pads only while the page is visible and the player is on screen. */
export function shouldPollGamepad(visibilityState: string, playerOnScreen: boolean): boolean {
  return visibilityState === 'visible' && playerOnScreen;
}

/** Left-stick travel (after the profile's radial deadzone) that counts as a d-pad press. */
export const STICK_AS_DPAD = 0.5;

/** A pad → joypad bits, through the canonical reading: A/B/SELECT/START, the d-pad, and the left stick as a d-pad. */
export function gamepadBits(pad: PadLike | null): number {
  if (!pad) return 0;
  const c = readPad(pad, profileFor(pad));
  let bits = 0;
  if (c.buttons.A) bits |= BUTTON.a;
  if (c.buttons.B) bits |= BUTTON.b;
  if (c.buttons.SELECT) bits |= BUTTON.select;
  if (c.buttons.START) bits |= BUTTON.start;
  if (c.dpad.up || c.ly < -STICK_AS_DPAD) bits |= BUTTON.up;
  if (c.dpad.down || c.ly > STICK_AS_DPAD) bits |= BUTTON.down;
  if (c.dpad.left || c.lx < -STICK_AS_DPAD) bits |= BUTTON.left;
  if (c.dpad.right || c.lx > STICK_AS_DPAD) bits |= BUTTON.right;
  return bits;
}
