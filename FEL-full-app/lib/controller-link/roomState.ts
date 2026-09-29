// Room state — the host's small back channel to the phone (MUSIC-SUITE P6 phone-replay, 2026-09-26).
//
// What was wrong (P5 REPORT 'Not done', measured in the code): the link had NO host → phone message beyond the lobby
// ('lobby', 'assign' — host.ts onState 'connected') and the pings. The Flip's phone pad (P5, the MPC) sends BANK A–D,
// PLAY / STOP / REC, but the phone could never show what they did: the live bank, a running transport and ARM REC all
// looked the same on the phone, and the only answer was a toast on the TV (StudioMode's say) the player was not looking at.
//
// Now one OPT-IN message rides the existing reliable control channel (PeerLink.sendSafe, 'fel-control', ordered):
//   { type: 'state', state: RoomState } — RoomState = { lit: the mode's own actions whose buttons are on, chips: words }.
// The rules, all here so both ends and the tests read one copy:
//   * OPT-IN BY CONFIG (types.ts ModeControllerConfig.roomState). HostSession.sendState refuses for a config without it,
//     so no other mode ever puts a 'state' on the wire; the page draws one only for an opted-in config, so even a stray
//     one changes nothing on another mode's phone (controller-page.test.tsx pins every other mode's markup byte-for-byte).
//   * MODE-AGNOSTIC. The page never learns what 'bank_B' or 'PLAYING' means: it lights the buttons whose action is listed
//     and prints the chips. The mode (lib/babylon/music/phonePad.ts phoneRoomState) decides what they say.
//   * BOUNDED. The phone trusts its host, but a message is still data off a network: parseRoomState keeps at most
//     ROOM_STATE_MAX_LIT actions and ROOM_STATE_MAX_CHIPS chips, cuts text at ROOM_STATE_MAX_TEXT characters, and keeps a
//     tone only if it is a plain #rrggbb colour (it goes into a style attribute — never a url(), never a gradient).
//   * LATEST WINS, AND A LATE JOINER GETS IT. The host keeps the last state it sent and sends it again when a phone's link
//     comes up (the same place it re-sends the lobby), so a phone that joins — or reconnects — mid-song sees the room as
//     it is, not blank until the next change. An unchanged state is not re-sent (sameRoomState).

import type { RoomState, RoomStateChip } from './types';

export const ROOM_STATE_MAX_LIT = 16;
export const ROOM_STATE_MAX_CHIPS = 4;
export const ROOM_STATE_MAX_TEXT = 28;
const ACTION_RE = /^[A-Za-z0-9_:.-]{1,32}$/;
// #rrggbb only: the page appends a 2-digit alpha to it (`${tone}66`), which a 3-, 4- or 8-digit hex would turn invalid
const TONE_RE = /^#[0-9a-fA-F]{6}$/;

/** A chip's text, trimmed and cut to the cap (an ellipsis where it was cut). Empty → null (not drawn). */
function chipText(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const t = x.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > ROOM_STATE_MAX_TEXT ? `${t.slice(0, ROOM_STATE_MAX_TEXT - 1)}…` : t;
}

/**
 * A RoomState off the wire, bounded (the rules in the header) — or null when it is not one at all (no `lit` array and no
 * `chips` array). Unknown fields are dropped; a malformed chip or action is skipped, never fatal.
 */
export function parseRoomState(x: unknown): RoomState | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as { lit?: unknown; chips?: unknown };
  if (!Array.isArray(o.lit) && !Array.isArray(o.chips)) return null;
  const lit: string[] = [];
  for (const a of Array.isArray(o.lit) ? o.lit : []) {
    if (typeof a === 'string' && ACTION_RE.test(a) && !lit.includes(a)) lit.push(a);
    if (lit.length >= ROOM_STATE_MAX_LIT) break;
  }
  const chips: RoomStateChip[] = [];
  for (const c of Array.isArray(o.chips) ? o.chips : []) {
    if (!c || typeof c !== 'object') continue;
    const cc = c as { text?: unknown; tone?: unknown; on?: unknown };
    const text = chipText(cc.text);
    if (!text) continue;
    const chip: RoomStateChip = { text };
    if (typeof cc.tone === 'string' && TONE_RE.test(cc.tone)) chip.tone = cc.tone;
    if (cc.on === true) chip.on = true;
    chips.push(chip);
    if (chips.length >= ROOM_STATE_MAX_CHIPS) break;
  }
  return { lit, chips };
}

/** Two states the phone would draw the same (the host sends only a change). */
export function sameRoomState(a: RoomState | null | undefined, b: RoomState | null | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.lit.length !== b.lit.length || a.chips.length !== b.chips.length) return false;
  if (a.lit.some((x, i) => x !== b.lit[i])) return false;
  return a.chips.every((c, i) => c.text === b.chips[i].text && c.tone === b.chips[i].tone && !!c.on === !!b.chips[i].on);
}

/** Does this config take a room state? (Only an explicit `roomState: true` — absent, false, anything else: no.) */
export function roomStateOptIn(config: { roomState?: unknown } | null | undefined): boolean {
  return config?.roomState === true;
}

/** Is this button lit by the state? (No state → nothing is.) */
export function isLit(state: RoomState | null | undefined, action: string): boolean {
  return !!state && state.lit.includes(action);
}
