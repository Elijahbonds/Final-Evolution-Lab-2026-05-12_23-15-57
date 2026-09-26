// Pad feel — the two things a PAD BANK asks the phone for beyond "this button was pressed": a buzz under the finger, and
// how hard the finger came down. Both are OPT-IN per schema (types.ts SchemaSpec `haptics` / `velocity`): the controller
// page serves every phone-controller mode, and a mode that does not ask gets exactly the button it always got (same
// markup, same `client.send(action)` with no payload — padFeel.test.ts pins both against the page as it was).
//
// MUSIC-SUITE P5 (2026-09-25), phone-mpc (owner decision #16: "Phone pad: MPC-style … haptic buzz, velocity where
// supported"). Before this the Flip's phone pad sent a bare `pad_3` for every hit: no buzz, every hit the same loudness.
//
// THE VELOCITY RULE (readVelocity) — a velocity is only ever something the phone MEASURED, never a number we make up:
//   1. FORCE. Touch.force (0..1), else PointerEvent.pressure (0..1) on a touch or pen pointer (a mouse has no force; its
//      pressure is the spec's 0.5-while-pressed placeholder). A reading of 0 is "not reported".
//   2. …but only once it has VARIED: a browser whose hardware reports nothing still hands over a constant (the 0.5
//      pressure default; some Android builds say force 1 on every touch), and a constant is not a measurement. The first
//      hits of a session therefore play at the fixed level until two readings FORCE_VARY_MIN apart have been seen.
//      Force → velocity is sqrt (a light tap at force 0.25 plays at 0.5, not a near-silent 0.25), floored at MIN_VELOCITY.
//   3. CONTACT SIZE as a proxy — only when force never varied, and only if the contact size itself varies (a finger
//      pressed harder flattens and reads bigger on most Android screens). Touch.radiusX/Y, else PointerEvent width/height
//      (the spec's default for "cannot measure" is 1 × 1 — a constant, so it never passes the variation test). The proxy
//      is RELATIVE to the smallest and largest contact seen this session (a screen's px scale is its own), mapped onto
//      CONTACT_FLOOR..1 so the lightest touch is still heard.
//   4. Otherwise FIXED: the press carries no velocity at all and the host plays its fixed pad level — the phone never
//      sends an invented value, so "no velocity" and "a measured soft hit" can always be told apart on the host.
//   iOS: Safari has no navigator.vibrate (no buzz, and the page says so instead of pretending), and only 3D-Touch
//   iPhones (6s – XS) report a varying force. assumption: WebKit fills PointerEvent.pressure from Touch.force and
//   width/height from the touch radius, as Chrome on Android fills them from MotionEvent pressure / touch major-minor;
//   neither was measured on a device here — the rule does not depend on it (a constant just stays fixed).

import type { ButtonSchemaHints, ButtonSpec } from '../types';
import { holdActions } from './button';

/** One press as the browser reported it (PointerEvent and/or Touch fields). */
export interface TouchSample {
  pointerType?: string;
  /** PointerEvent.pressure, 0..1 */
  pressure?: number;
  /** Touch.force, 0..1 */
  force?: number;
  /** PointerEvent.width / height, CSS px */
  width?: number;
  height?: number;
  /** Touch.radiusX / radiusY, CSS px */
  radiusX?: number;
  radiusY?: number;
}

interface Range { min: number; max: number; n: number }
/** What a session has seen so far (the rule learns whether this phone's readings are real). */
export interface VelocityState { force: Range; contact: Range }
export type VelocityVia = 'force' | 'contact' | 'fixed';
export interface VelocityReading { v: number | null; via: VelocityVia; state: VelocityState }

/** Two force readings this far apart = a sensor, not a placeholder. */
export const FORCE_VARY_MIN = 0.02;
/** Contact sizes must spread by this share of the largest (and at least CONTACT_VARY_PX) to count. */
export const CONTACT_VARY_SHARE = 0.1;
export const CONTACT_VARY_PX = 0.5;
/** The quietest a measured hit plays (force). */
export const MIN_VELOCITY = 0.2;
/** The smallest contact of the session plays here (contact proxy). */
export const CONTACT_FLOOR = 0.35;

const EMPTY: Range = { min: Infinity, max: -Infinity, n: 0 };
export function freshVelocityState(): VelocityState { return { force: EMPTY, contact: EMPTY }; }

const pos = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const widen = (r: Range, x: number | null): Range => (x === null ? r : { min: Math.min(r.min, x), max: Math.max(r.max, x), n: r.n + 1 });
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** The press's force, 0..1, or null when it reported none (a mouse never has one). */
export function forceOf(s: TouchSample): number | null {
  if (pos(s.force)) return Math.min(1, s.force);
  if (s.pointerType !== 'mouse' && pos(s.pressure)) return Math.min(1, s.pressure);
  return null;
}
/** The contact's size (mean radius, CSS px), or null when it reported none. */
export function contactOf(s: TouchSample): number | null {
  if (pos(s.radiusX) && pos(s.radiusY)) return (s.radiusX + s.radiusY) / 2;
  if (s.pointerType !== 'mouse' && pos(s.width) && pos(s.height)) return (s.width + s.height) / 4;
  return null;
}
export const forceVaries = (r: Range): boolean => r.n >= 2 && r.max - r.min >= FORCE_VARY_MIN;
export const contactVaries = (r: Range): boolean => r.n >= 2 && r.max - r.min >= Math.max(CONTACT_VARY_PX, CONTACT_VARY_SHARE * r.max);

/** The rule above: this press's velocity (null = fixed), how it was read, and what the session has now seen. */
export function readVelocity(state: VelocityState, s: TouchSample): VelocityReading {
  const f = forceOf(s);
  const c = contactOf(s);
  const next: VelocityState = { force: widen(state.force, f), contact: widen(state.contact, c) };
  if (f !== null && forceVaries(next.force)) return { v: clamp(Math.sqrt(f), MIN_VELOCITY, 1), via: 'force', state: next };
  if (c !== null && !forceVaries(next.force) && contactVaries(next.contact)) {
    const r = next.contact;
    return { v: CONTACT_FLOOR + (1 - CONTACT_FLOOR) * clamp((c - r.min) / (r.max - r.min), 0, 1), via: 'contact', state: next };
  }
  return { v: null, via: 'fixed', state: next };
}

/** A pointer event's fields as a TouchSample (the page reads a React PointerEvent; a TouchEvent's Touch fits too). */
export function sampleOf(e: { pointerType?: string; pressure?: number; width?: number; height?: number; force?: number; radiusX?: number; radiusY?: number }): TouchSample {
  return { pointerType: e.pointerType, pressure: e.pressure, width: e.width, height: e.height, force: e.force, radiusX: e.radiusX, radiusY: e.radiusY };
}

/** The per-schema hints a button schema may carry (types.ts). Absent = the plain button every other mode gets. */
export type PadHints = ButtonSchemaHints;
export const hasHints = (h: PadHints | null | undefined): boolean => !!h && (h.haptics === true || h.velocity === true || h.compact === true);

/**
 * What one press SENDS: [action] exactly as before for a button without the velocity hint (or a hold button — its
 * down/up pair has no velocity), else [action, { v, via }] when the phone measured one, and [action] when it did not.
 */
export function pressMessage(spec: ButtonSpec, hints: PadHints | null | undefined, reading: Pick<VelocityReading, 'v' | 'via'> | null): [string] | [string, { v: number; via: Exclude<VelocityVia, 'fixed'> }] {
  if (spec.hold) return [holdActions(spec).down];
  if (!hints?.velocity || !reading || reading.v === null || reading.via === 'fixed') return [spec.action];
  return [spec.action, { v: Math.round(reading.v * 1000) / 1000, via: reading.via }];
}

// ── HAPTICS ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** One pad hit's buzz: short enough to feel like a click, not a phone call (decision #16's "a buzz on each hit"). */
export const HIT_BUZZ_MS = 12;
export interface Vibrator { vibrate?: (pattern: number | number[]) => boolean }
/** Does this browser have a vibrator at all? (iOS Safari: no — navigator.vibrate is undefined there.) */
export function canBuzz(nav: Vibrator | null | undefined): boolean { return !!nav && typeof nav.vibrate === 'function'; }
/** Buzz once where supported; false when the browser has none or refused (never throws — a hit must still send). */
export function buzz(nav: Vibrator | null | undefined, ms: number = HIT_BUZZ_MS): boolean {
  if (!canBuzz(nav)) return false;
  try { return nav!.vibrate!(Math.max(1, Math.round(ms))) === true; } catch { return false; }
}
/**
 * The honest line under a pad bank that asked for haptics / velocity (null = nothing to say). `can.buzz` null = not known
 * yet (the server render, before the page has looked at navigator) — then the buzz is not mentioned at all.
 */
export function feelLine(hints: PadHints | null | undefined, can: { buzz: boolean | null }, via: VelocityVia | null): string | null {
  if (!hints?.haptics && !hints?.velocity) return null;
  const parts: string[] = [];
  if (hints.haptics && can.buzz !== null) parts.push(can.buzz ? 'buzz on each hit' : 'no buzz on this phone (its browser has no vibration — iPhones never do)');
  if (hints.velocity) {
    parts.push(via === 'force' ? 'velocity: how hard you press'
      : via === 'contact' ? 'velocity: how much finger touches the pad'
      : via === 'fixed' ? 'fixed velocity (this phone reports no pressure)'
      : 'velocity: tap a few pads to see if this phone reports pressure');
  }
  return parts.length ? parts.join(' · ') : null;
}
/** Every hint any of a config's button schemas asked for (the page says one feel line for the whole controller). */
export function hintsOf(schemas: readonly { kind: string }[]): PadHints {
  const out: PadHints = {};
  for (const s of schemas) {
    if (s.kind !== 'button') continue;
    const h = s as PadHints;
    if (h.haptics === true) out.haptics = true;
    if (h.velocity === true) out.velocity = true;
    if (h.compact === true) out.compact = true;
  }
  return out;
}
