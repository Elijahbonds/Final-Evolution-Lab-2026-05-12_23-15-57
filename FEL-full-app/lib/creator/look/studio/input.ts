// EVERY INPUT (CREATOR-PLAN phase 4d, 2026-10-06): mouse and keyboard, touch, and a gamepad, mapped to the same Studio
// actions. Pure: the stage (components/closet/avatar-preview.tsx) feeds it pointer positions, key presses and the pad as
// the repo's input layer reads it (lib/input/profiles.readPad → CanonicalPad), and acts on what comes back.
//
// THE PAD IS READ THROUGH THE INPUT LAYER, NOT THE INPUT BUS. lib/babylon/core/InputBus also binds the keyboard (WASD,
// the arrows with preventDefault, space) for a game: in an editor full of sliders and text boxes that would steal the
// arrows from a focused slider. So the Studio polls the pad through lib/input/profiles (the same profiles, remap-free
// canonical buttons) only while a pad is connected, and handles the keyboard itself, never inside a text field.

import type { StudioShot } from './framing';

export type StudioAction =
  | 'undo' | 'redo' | 'select' | 'back' | 'prevTab' | 'nextTab' | 'shotIn' | 'shotOut' | 'prevItem' | 'nextItem'
  | 'photo' | 'beforeAfter' | 'turntable' | 'mirror'
  | { shot: StudioShot };

export interface KeyLike { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }

/** A key press → a Studio action. `inField`: the focus is in a text box, a slider or a select (they keep their keys —
 *  except undo / redo, which the Closet's history owns everywhere but a text box, see below). */
export function keyAction(e: KeyLike, inField: boolean, inText = inField): StudioAction | null {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.ctrlKey || e.metaKey) {
    if (inText) return null;                              // a text box has its own undo
    if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
    if (k === 'y') return 'redo';
    return null;
  }
  if (inField || e.altKey) return null;
  switch (k) {
    case '1': return { shot: 'full' };
    case '2': return { shot: 'bust' };
    case '3': return { shot: 'face' };
    case '[': return 'prevTab';
    case ']': return 'nextTab';
    case ',': return 'prevItem';
    case '.': return 'nextItem';
    case 't': return 'turntable';
    case 'b': return 'beforeAfter';
    case 'p': return 'photo';
    case 'm': return 'mirror';
    case 'Escape': return 'back';
    default: return null;
  }
}

/** Is this element one that keeps its own keys? (a text box, a slider, a select, anything editable) */
export function isFieldTarget(t: { tagName?: string; isContentEditable?: boolean; type?: string } | null | undefined): { field: boolean; text: boolean } {
  if (!t) return { field: false, text: false };
  const tag = (t.tagName ?? '').toUpperCase();
  const text = tag === 'TEXTAREA' || !!t.isContentEditable || (tag === 'INPUT' && !/^(range|checkbox|radio|color|button|submit)$/i.test(t.type ?? 'text'));
  return { field: text || tag === 'INPUT' || tag === 'SELECT', text };
}

// ── touch: one finger spins, two fingers orbit and pinch ─────────────────────────────────────────────────────────────

export interface Pt { x: number; y: number }

/** Two fingers from one frame to the next: the pinch (> 1 = fingers apart = zoom in, as a factor on the distance to
 *  divide by) and the orbit (the midpoint's travel, px). */
export function twoFinger(prev: readonly [Pt, Pt], next: readonly [Pt, Pt]): { pinch: number; dx: number; dy: number } {
  const d0 = Math.hypot(prev[0].x - prev[1].x, prev[0].y - prev[1].y);
  const d1 = Math.hypot(next[0].x - next[1].x, next[0].y - next[1].y);
  const pinch = d0 > 4 && d1 > 4 ? d1 / d0 : 1;
  const dx = (next[0].x + next[1].x - prev[0].x - prev[1].x) / 2;
  const dy = (next[0].y + next[1].y - prev[0].y - prev[1].y) / 2;
  return { pinch, dx, dy };
}

/** How far a press may travel and still be a tap (CSS px). */
export const TAP_SLOP = 8;
/** A press longer than this is not a tap either (ms). */
export const TAP_MS = 450;

export type PressKind = 'tap' | 'spin' | 'orbit' | 'dragPart' | 'dragSticker' | 'none';

export interface PressStart {
  pointers: number;
  /** 0 left / primary, 1 middle, 2 right */
  button: number;
  shift: boolean;
  /** the press began on the selected part's move knob (the stage's hit test) */
  onPart: boolean;
  /** the press began on the body with a placeable layer (a stamp, text, a drawing) selected in the Paint tab */
  onSticker: boolean;
}

/** What a press becomes once it has moved past the tap slop: two fingers, a right or middle button or shift orbit the
 *  camera; a press on the selected part drags it (it snaps to the nearest bone); on the body with a sticker selected it
 *  drags the sticker over the surface; anything else spins the turntable. */
export function dragKind(p: PressStart): PressKind {
  if (p.pointers >= 2 || p.button === 1 || p.button === 2 || p.shift) return 'orbit';
  if (p.onPart) return 'dragPart';
  if (p.onSticker) return 'dragSticker';
  return 'spin';
}

/** A finished press: a tap if it stayed inside the slop and was short. */
export function isTap(moved: number, ms: number, pointers: number): boolean {
  return pointers === 1 && moved <= TAP_SLOP && ms <= TAP_MS;
}

// ── the pad ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The canonical pad (lib/input/profiles.CanonicalPad), the fields the Studio reads. */
export interface PadRead {
  lx: number; ly: number; rx: number; ry: number;
  triggers: { L: number; R: number };
  buttons: Record<'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1' | 'SELECT' | 'START' | 'LS' | 'RS', boolean>;
  dpad: Record<'up' | 'down' | 'left' | 'right', boolean>;
}

/** The pad's continuous part this frame: turntable spin, camera orbit and tilt, zoom (all per second at full deflection). */
export interface PadAxes { spin: number; orbit: number; tilt: number; zoom: number }

/** Stick deadzone (radial) — lib/input/profiles keeps its own for modes; the Studio's sticks are slow and precise. */
export const PAD_DEADZONE = 0.18;
const dz = (x: number, y: number): [number, number] => {
  const m = Math.hypot(x, y);
  if (m < PAD_DEADZONE) return [0, 0];
  const k = (m - PAD_DEADZONE) / (1 - PAD_DEADZONE) / m;
  return [x * k, y * k];
};

/** TUNED (phase 4d): the left stick spins the turntable at up to 2.4 rad/s; the right orbits at 1.6 rad/s and tilts at
 *  1.0 rad/s; the triggers zoom by up to 1.2× per second. */
export const PAD_RATES = { spin: 2.4, orbit: 1.6, tilt: 1.0, zoom: 1.2 } as const;

export function padAxes(p: PadRead): PadAxes {
  const [lx] = dz(p.lx, p.ly);
  const [rx, ry] = dz(p.rx, p.ry);
  const trig = (p.triggers.R ?? 0) - (p.triggers.L ?? 0);
  return { spin: lx * PAD_RATES.spin, orbit: rx * PAD_RATES.orbit, tilt: ry * PAD_RATES.tilt, zoom: Math.abs(trig) < 0.08 ? 0 : trig * PAD_RATES.zoom };
}

/** The pad's buttons as actions, on the press edge only (held buttons do not repeat). */
export function padActions(p: PadRead, prev: PadRead | null): StudioAction[] {
  const out: StudioAction[] = [];
  const pressed = (b: keyof PadRead['buttons']) => p.buttons[b] && !prev?.buttons[b];
  const dpad = (d: keyof PadRead['dpad']) => p.dpad[d] && !prev?.dpad[d];
  if (pressed('A')) out.push('select');
  if (pressed('B')) out.push('back');
  if (pressed('X')) out.push('undo');
  if (pressed('Y')) out.push('redo');
  if (pressed('L1')) out.push('prevTab');
  if (pressed('R1')) out.push('nextTab');
  if (pressed('START')) out.push('photo');
  if (pressed('SELECT')) out.push('beforeAfter');
  if (pressed('LS')) out.push('turntable');
  if (pressed('RS')) out.push('mirror');
  if (dpad('up')) out.push('shotIn');
  if (dpad('down')) out.push('shotOut');
  if (dpad('left')) out.push('prevItem');
  if (dpad('right')) out.push('nextItem');
  return out;
}

/** The tab after / before this one, wrapping. */
export function cycle<T>(list: readonly T[], at: T, dir: 1 | -1): T {
  const i = list.indexOf(at);
  if (i < 0) return list[0];
  return list[(i + dir + list.length) % list.length];
}
