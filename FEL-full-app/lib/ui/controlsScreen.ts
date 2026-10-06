// controlsScreen — the one CONTROLS screen every mode shows before START and on PAUSE (controls-screen, console-view
// lane, 2026-10-06). The pure half: which rows a player with a pad, a keyboard or a touch screen is shown, and how a
// mode's static hint string is broken into lines. components/games/controls-panel.tsx draws it.
//
// Owner, verbatim: "Can we take off that wall of text when the game starts, maybe have that show as a beginning screen
// for the controls." Picks: nothing during play; before START and on pause the same screen; every mode, from its own
// button map.
//
// WHERE THE ROWS COME FROM — nothing is written out a second time:
//   - the face verbs: MODE_VERBS (what TouchOverlay draws and the modes read), translated per device from what each
//     verb actually EMITS: a button A/B/X/Y is that button on a pad and J/K/L/I on the keys (InputBus KEYMAP); a held
//     right trigger (the dunk's RUN, the football's TRUCK) is R2 on a pad and SPACE on the keys — the card slot's old
//     "HOLD Y" was the touch slot's letter, which a pad's Y does not send;
//   - the named moves and the system rows (d-pad strides, the R-stick flick, BOOST): the card slot's buttonMap;
//   - the mode's own words: its static hint lines (lib/babylon/ui/staticControls.ts), split at its ' · ' separators —
//     or, for a mode whose hint is a whole controller map, the panel's curated short list (lib/babylon/ui/panelLines.ts).
//
// controls-screen-2 (2026-10-06). Owner: "Yes to both proposed fixes for texts and impeding gameplay view." The texts:
// on a sideways phone the long lists scrolled inside the panel, which a pad cannot do. So: the curated lists, the board
// modes' trick table folded to one line per button (nine rows were five lines of the grid), and the body's boost line
// that the gauge no longer says during play.

import { MODE_VERBS } from '../babylon/ui/modeVerbs';
import { buttonMap, slotModeKey } from '../creator/cardSlot';
import { staticControlsFor } from '../babylon/ui/staticControls';
import { panelLinesFor, BODY_BOOST_LINE, PANEL_MAX_CHARS, PANEL_GROUPS } from '../babylon/ui/panelLines';

export type ControlsDevice = 'pad' | 'keys' | 'touch';
export const CONTROLS_DEVICES: readonly ControlsDevice[] = ['pad', 'keys', 'touch'];
export const DEVICE_LABEL: Record<ControlsDevice, string> = { pad: 'CONTROLLER', keys: 'KEYBOARD', touch: 'TOUCH' };

export interface ControlRow {
  /** What you press, in this device's words: 'R2', 'HOLD SPACE', 'J', 'LEFT PAD'. */
  input: string;
  /** What it does, as the game names it. */
  action: string;
}

/** Some of the sheet's lines under a heading (the hoops modes' OFFENSE / DEFENSE); untitled, the plain list. */
export interface ControlsGroup {
  title?: string;
  /** The heading's colour (a CSS colour). */
  color?: string;
  lines: string[];
}

export interface ControlsSheet {
  device: ControlsDevice;
  rows: ControlRow[];
  /** The mode's own words, one idea per line. */
  lines: string[];
  /** The same lines as the panel draws them: one untitled group for most modes; the hoops modes' titled groups. */
  groups: ControlsGroup[];
}

/** InputBus KEYMAP, read the other way: the key that sends each pad button. */
const KEY_OF: Record<string, string> = { A: 'J', B: 'K', X: 'L', Y: 'I', L1: 'Q', R1: 'E', SELECT: 'C', START: 'ESC', LS: 'V', RS: 'R' };
/** Modes the left stick does nothing in (a quiz answers on the face buttons; the sprint mashes the d-pad). */
const NO_STICK = new Set(['who_scene_it', 'brainbrawl', 'sprint', 'dance', 'bigair']);
const STICK_ACTION: Record<string, string> = {
  velocitykart: 'STEER', aeroaces: 'STEER', skateboard: 'STEER', snowboard_slalom: 'STEER', surf: 'STEER',
  golf: 'AIM', derby: 'AIM', penalty: 'AIM', threepoint: 'AIM', duel: 'ORBIT',
};
const FACE = ['A', 'B', 'X', 'Y'] as const;

/** A one-letter label is a quiz answer (who-scene-it, brain brawl): say so. */
const actionOf = (label: string): string => (/^[A-Z]$/.test(label) ? `ANSWER ${label}` : label);

/** '← + B' on the pad is '← + K' on the keys and '← + <B's verb>' on touch. */
function translate(input: string, device: ControlsDevice, labels: Record<string, string>): string | null {
  if (/HOLD RB · SHIFT/.test(input)) return device === 'pad' ? 'HOLD RB' : device === 'keys' ? 'HOLD SHIFT' : 'HOLD BOOST';
  if (device === 'pad') return input;
  if (/R-STICK/.test(input)) return device === 'touch' ? input.replace('R-STICK', 'RIGHT PAD') : null;   // no keyboard right stick
  if (device === 'keys') return input.replace(/D-PAD\s*/, 'ARROWS ').replace(/\b([ABXY])\b/g, (_, b: string) => KEY_OF[b]).trim();
  return input.replace(/\b([ABXY])\b/g, (_, b: string) => labels[b] || b);
}

/** The rows for one device: the stick, the face verbs (from what they emit), the moves, boost, look and pause. */
export function controlRows(modeId: string, device: ControlsDevice): ControlRow[] {
  const key = slotModeKey(modeId);
  const cfg = MODE_VERBS[key] ?? MODE_VERBS.default;
  const labels: Record<string, string> = {};
  cfg.buttons.forEach((b, i) => { if (b.emit && b.label) labels[FACE[i]] = b.label; });
  const rows: ControlRow[] = [];
  if (!NO_STICK.has(key)) {
    rows.push({ input: device === 'pad' ? 'L-STICK' : device === 'keys' ? 'WASD / ARROWS' : 'LEFT PAD', action: STICK_ACTION[key] ?? 'MOVE' });
  }
  cfg.buttons.forEach((b) => {
    const e = b.emit;
    if (!e || !b.label) return;
    const hold = b.hold ? 'HOLD ' : '';
    let input: string | null = null;
    if (e.t === 'button') input = device === 'pad' ? e.btn : device === 'keys' ? KEY_OF[e.btn] ?? null : null;
    else if (e.t === 'trigger') input = device === 'pad' ? (e.side === 'R' ? 'R2' : 'L2') : device === 'keys' ? (e.side === 'R' ? 'SPACE' : null) : null;
    if (device === 'touch') input = b.hold ? 'HOLD' : 'TAP';
    else if (input) input = hold + input;
    if (input) rows.push({ input, action: actionOf(b.label) });
  });
  for (const r of buttonMap(modeId)) {
    if (r.group === 'verb') continue;   // the verbs above, from what they emit
    if (r.group === 'move' && TRICK.test(r.input)) continue;   // a trick-table move: one line per button (moveLines)
    const input = translate(r.input, device, labels);
    if (input) rows.push({ input, action: r.action });
  }
  if (cfg.rStick && cfg.rStick !== 'FLICK') {
    if (device === 'pad') rows.push({ input: 'R-STICK', action: cfg.rStick });
    else if (device === 'touch') rows.push({ input: 'RIGHT PAD', action: cfg.rStick });
  }
  if (device !== 'touch') rows.push({ input: device === 'pad' ? 'START' : 'ESC', action: 'PAUSE' });
  return rows;
}

/** A board's trick-table move as the card slot writes it: an optional direction, then a face button ('← + B', 'Y'). */
const TRICK = /^(?:([←↑→↓]) \+ )?([ABXY])$/;

/**
 * The trick table, one line per button (controls-screen-2): 'B: BOTTOM TURN · ←CUTBACK ↑SNAP →FLOATER …', not a row
 * each. The surf's nine trick rows were five lines of the grid — the panel's whole height on a sideways phone. The
 * button is the device's: the letter on a pad, its key on the keys (InputBus KEYMAP), its verb on the touch deck.
 */
export function moveLines(modeId: string, device: ControlsDevice): string[] {
  const cfg = MODE_VERBS[slotModeKey(modeId)] ?? MODE_VERBS.default;
  const labels: Record<string, string> = {};
  cfg.buttons.forEach((b, i) => { if (b.emit && b.label) labels[FACE[i]] = b.label; });
  const byBtn = new Map<string, { plain: string[]; dir: string[] }>();
  for (const r of buttonMap(modeId)) {
    const m = r.group === 'move' ? TRICK.exec(r.input) : null;
    if (!m) continue;
    const g = byBtn.get(m[2]) ?? { plain: [], dir: [] };
    if (m[1]) g.dir.push(`${m[1]}${r.action}`); else g.plain.push(r.action);
    byBtn.set(m[2], g);
  }
  const name = (b: string): string => device === 'pad' ? b : device === 'keys' ? KEY_OF[b] ?? b : labels[b] ?? b;
  // the arrow is each directed move's own bullet: one row of a sideways phone holds the surf's five B moves
  const lines = [...byBtn].map(([b, g]) => `${name(b)}: ${[...g.plain, g.dir.join(' ')].filter(Boolean).join(' · ')}`);
  // and two short buttons share a row ('Y: →720 … · X: BOARDSLIDE'): Gate Crasher's sideways-phone card has no row spare
  const packed: string[] = [];
  for (const l of lines) {
    const last = packed.length ? packed[packed.length - 1] : null;
    if (last !== null && last.length + 3 + l.length <= PANEL_MAX_CHARS) packed[packed.length - 1] = `${last} · ${l}`;
    else packed.push(l);
  }
  return packed;
}

/**
 * A hint string as lines: split at its ' · ' separators — but never inside brackets, where the 3v3's post-up list
 * keeps its own dots ("POST UP (L2/L1 · shoot = HOOK · …)" is one line). Runs of spaces collapse; empties drop.
 */
export function splitHint(hint: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < hint.length; i++) {
    const ch = hint[i];
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    if (ch === '·' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/**
 * The mode's own lines: its curated panel list when it has one (panelLines.ts), else its static hint(s) split — the
 * body's while the body plays — or, when it has neither, the line its host was built with (the board and timing hosts'
 * `hint`, which until now nothing drew). A speed mode's body boost line follows (the gauge no longer says it in play).
 * Repeats across lines drop.
 */
export function controlLines(modeId: string, opts: { body?: boolean; fallback?: string } = {}): string[] {
  const key = slotModeKey(modeId);
  const grouped = titledGroups(key);
  if (grouped) return [...new Set(grouped.flatMap((g) => g.lines))];
  const curated = panelLinesFor(key, !!opts.body);
  const own = curated ?? staticControlsFor(key, !!opts.body).flatMap(splitHint);
  const src = own.length ? own : opts.fallback ? splitHint(opts.fallback) : [];
  const boost = opts.body ? BODY_BOOST_LINE[key] : undefined;
  return [...new Set(boost ? [...src, boost] : src)];
}

/**
 * HOOPS PAUSE (2026-10-06; owner: "Hoops pause: Controls panel only"): a mode's titled groups (panelLines PANEL_GROUPS —
 * the 1v1 and 3v3 OFFENSE / DEFENSE lists), each split like a hint, or null. They are the same for the body (the hoops
 * modes have no body words).
 */
export function titledGroups(modeKey: string): ControlsGroup[] | null {
  const g = PANEL_GROUPS[modeKey];
  return g ? g.map((x) => ({ title: x.title, color: x.color, lines: splitHint(x.text) })) : null;
}

/** The device's rows; then its trick lines (a board's table), then the mode's own lines — in its titled groups, if it has them. */
export function controlsSheet(modeId: string, device: ControlsDevice, opts: { body?: boolean; fallback?: string } = {}): ControlsSheet {
  const moves = moveLines(modeId, device);
  const titled = titledGroups(slotModeKey(modeId));
  const groups: ControlsGroup[] = titled
    ? [...(moves.length ? [{ lines: moves }] : []), ...titled]
    : [{ lines: [...moves, ...controlLines(modeId, opts)] }];
  return { device, rows: controlRows(modeId, device), lines: groups.flatMap((g) => g.lines), groups };
}

/** The smallest the panel's rows and lines may step down to so a list fits its box (ControlsPanel's fit): 10 px → 8.5 px. */
export const FIT_MIN = 0.85;
const FIT_STEP = 0.05;

/**
 * The panel's fit (controls-screen-2, 2026-10-06): the largest size, from 1 down in steps of 0.05, at which `cuts` says
 * nothing is cut off — or FIT_MIN when even that cuts (the lines then scroll, as before). `cuts(s)` lays the panel out
 * at `s` and measures it, so the first answer is the full size whenever the list fits.
 */
export function fitScale(cuts: (s: number) => boolean, min = FIT_MIN, step = FIT_STEP): number {
  for (let s = 1; s > min + 1e-9; s = Math.round((s - step) * 1000) / 1000) if (!cuts(s)) return s;
  return min;
}

/** Which list to open on: a connected pad wins (it is what a TV player holds), then a touch screen, then the keys. */
export function pickDevice(env: { pads: number; touch: boolean }): ControlsDevice {
  if (env.pads > 0) return 'pad';
  return env.touch ? 'touch' : 'keys';
}

/** Is this the device in use, read from the browser (guarded: no navigator in tests or on the server). */
export function detectDevice(): ControlsDevice {
  let pads = 0, touch = false;
  try {
    if (typeof navigator !== 'undefined') {
      const list = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      pads = Array.from(list ?? []).filter((p) => p && p.connected !== false).length;
      touch = (navigator.maxTouchPoints ?? 0) > 0;
    }
    if (!touch && typeof window !== 'undefined' && typeof window.matchMedia === 'function') touch = window.matchMedia('(pointer: coarse)').matches;
  } catch { /* a permissions policy can deny the Gamepad API: no pad, then */ }
  return pickDevice({ pads, touch });
}
