/**
 * FEL Gamepad Bridge
 * ──────────────────
 * Translates virtual-controller presses AND physical gamepad input into the
 * synthetic keyboard events that every FEL game already listens for. One code
 * path for both input sources keeps behaviour identical across all modes.
 */

import type { VCScheme } from './input-schemes';
import { readPad, type PadLike, type PadButton } from '@/lib/input/profiles';
import {
  resolveShoulders,
  resolveLook,
  SHOULDER_PAD_INDEX,
  stickToDirs,
  type ShoulderSlot,
} from './input/controller-map';

/** Derive DOM `code` + legacy `keyCode` for a given KeyboardEvent.key. */
export function codeForKey(key: string): { code: string; keyCode: number } {
  if (key === ' ') return { code: 'Space', keyCode: 32 };
  if (key === 'ArrowLeft') return { code: 'ArrowLeft', keyCode: 37 };
  if (key === 'ArrowUp') return { code: 'ArrowUp', keyCode: 38 };
  if (key === 'ArrowRight') return { code: 'ArrowRight', keyCode: 39 };
  if (key === 'ArrowDown') return { code: 'ArrowDown', keyCode: 40 };
  if (key === ';') return { code: 'Semicolon', keyCode: 186 };
  if (key.length === 1 && key >= 'a' && key <= 'z') return { code: 'Key' + key.toUpperCase(), keyCode: key.toUpperCase().charCodeAt(0) };
  if (key.length === 1 && key >= 'A' && key <= 'Z') return { code: 'Key' + key, keyCode: key.charCodeAt(0) };
  if (key.length === 1 && key >= '0' && key <= '9') return { code: 'Digit' + key, keyCode: key.charCodeAt(0) };
  return { code: key, keyCode: 0 };
}

function dispatch(type: 'keydown' | 'keyup', key: string) {
  if (typeof window === 'undefined') return;
  const { code, keyCode } = codeForKey(key);
  const ev = new KeyboardEvent(type, {
    key,
    code,
    keyCode,
    which: keyCode,
    bubbles: true,
    cancelable: true,
  } as KeyboardEventInit);
  // Some older handlers read keyCode/which which are read-only on the ctor in
  // certain engines — re-assert defensively.
  try {
    Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
    Object.defineProperty(ev, 'which', { get: () => keyCode });
  } catch { /* already set by ctor */ }
  window.dispatchEvent(ev);
}

export function pressKey(key: string) { dispatch('keydown', key); }
export function releaseKey(key: string) { dispatch('keyup', key); }

/**
 * Polls the first connected physical gamepad and, using the active scheme,
 * dispatches synthetic keydown/keyup on rising/falling edges. Tuned dead zone +
 * response curve on the left stick so it drives the same D-pad keys smoothly.
 */
export class PhysicalGamepadPoller {
  private prev: Record<string, boolean> = {};
  private scheme: VCScheme | null = null;
  private readonly DEADZONE = 0.28;

  setScheme(scheme: VCScheme | null) {
    // Release anything held when the scheme changes.
    if (this.scheme) this.releaseAll();
    this.scheme = scheme;
  }

  private edge(id: string, key: string, pressed: boolean) {
    const was = this.prev[id] ?? false;
    if (pressed && !was) pressKey(key);
    else if (!pressed && was) releaseKey(key);
    this.prev[id] = pressed;
  }

  private releaseAll() {
    for (const id of Object.keys(this.prev)) {
      if (this.prev[id] && this._keyById[id]) releaseKey(this._keyById[id]);
      this.prev[id] = false;
    }
  }

  private _keyById: Record<string, string> = {};

  poll() {
    const scheme = this.scheme;
    if (!scheme) return;
    let pad: Gamepad | null = null;
    try {
      const pads = navigator?.getGamepads?.();
      if (pads) pad = pads[0] || pads[1] || pads[2] || pads[3] || null;
    } catch { return; }
    if (!pad) { this.releaseAll(); return; }

    // Input & Presence Phase A (2026-09-13): read through the PROFILE rather than straight into
    // buttons[0..15]. This file used to be half-converted — it imported AXIS_INDEX for the right stick and
    // then indexed the left one by hand — which is the state that hides a mapping bug best. A Switch Pro's
    // face buttons are in a different physical order, and nothing here could previously notice. Every axis and
    // button now comes from readPad's canonical profile; raw indices live in controller-map alone.
    const c = readPad(pad as unknown as PadLike);
    const CANON: Record<string, PadButton> = { a: 'A', b: 'B', x: 'X', y: 'Y' };

    // Face buttons
    for (const b of scheme.buttons) {
      const id = 'face-' + b.pos;
      this._keyById[id] = b.key;
      this.edge(id, b.key, c.buttons[CANON[b.pos] ?? 'A']);
    }
    // Legacy single trigger (e.g. BLOCK/GUARD): fires on ANY shoulder button.
    if (scheme.trigger) {
      const id = 'trig';
      this._keyById[id] = scheme.trigger.key;
      // "any shoulder" keeps reading the raw analog trigger values, because a half-pulled trigger is not a
      // pressed BUTTON on every pad and this legacy binding wants either
      this.edge(id, scheme.trigger.key, c.buttons.L1 || c.buttons.R1 || c.triggers.L > 0.3 || c.triggers.R > 0.3);
    }
    // Multi-shoulder array (board spins, tennis lob/topspin, …) mapped to the
    // individual L1/R1/L2/R2 buttons via the unified controller map.
    const shoulders = resolveShoulders(scheme);
    (Object.keys(shoulders) as ShoulderSlot[]).forEach((slot) => {
      const t = shoulders[slot];
      if (!t) return;
      const id = 'sh-' + slot;
      this._keyById[id] = t.key;
      const down = slot === 'l1' ? c.buttons.L1 : slot === 'r1' ? c.buttons.R1
        : slot === 'l2' ? c.triggers.L > 0.3 : c.triggers.R > 0.3;
      this.edge(id, t.key, down);
    });
    // Right stick (look / camera / aim) → same synthetic-keyboard bridge. Dormant
    // for modes that declare no `look`; the Camera Rig phase (P4) lights it up.
    const look = resolveLook(scheme);
    if (look) {
      const rd = stickToDirs(c.rx, c.ry);
      if (look.left) { this._keyById['look-left'] = look.left; this.edge('look-left', look.left, rd.left); }
      if (look.right) { this._keyById['look-right'] = look.right; this.edge('look-right', look.right, rd.right); }
      if (look.up) { this._keyById['look-up'] = look.up; this.edge('look-up', look.up, rd.up); }
      if (look.down) { this._keyById['look-down'] = look.down; this.edge('look-down', look.down, rd.down); }
    }
    // Directions: dpad buttons OR left stick past deadzone.
    if (scheme.dir) {
      const stickLeft = c.lx < -this.DEADZONE;
      const stickRight = c.lx > this.DEADZONE;
      const stickUp = c.ly < -this.DEADZONE;
      const stickDown = c.ly > this.DEADZONE;
      const d = scheme.dir;
      if (d.left) { this._keyById['d-left'] = d.left; this.edge('d-left', d.left, c.dpad.left || stickLeft); }
      if (d.right) { this._keyById['d-right'] = d.right; this.edge('d-right', d.right, c.dpad.right || stickRight); }
      if (d.up) { this._keyById['d-up'] = d.up; this.edge('d-up', d.up, c.dpad.up || stickUp); }
      if (d.down) { this._keyById['d-down'] = d.down; this.edge('d-down', d.down, c.dpad.down || stickDown); }
    }
  }
}
