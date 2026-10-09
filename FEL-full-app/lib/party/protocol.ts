// lib/party/protocol.ts — what the TV tells each phone about the room, and what a phone may ask of it
// (MULTIPLAYER lane, 2026-10-06).
//
// Two messages ride Controller Link's reliable channel (types.ts LinkMessage 'party' / 'party-cmd'):
//
//   TV → phone  PartyView: the room as THAT phone should see it — the game picked, every seat's label, name, colour and
//               ready light, which seat is "you", whether you may drive the lobby. Built per phone, so it never needs
//               anybody's id: no peer id, no account, no email ever leaves the TV. Bounded again on the phone
//               (parsePartyView), like roomState.ts, because the phone draws it.
//   phone → TV  a PartyCmd: ready / not ready / pick the previous or next game / start / rematch / back to the lobby /
//               leave. The TV decides (partyCmdAllowed): only the captain (the first seated phone) picks and starts, and
//               only when the room is in a state where that makes sense. Anything else is dropped without a word.
//
// Pure: no transport, no React.

import type { PartyStyle } from './catalog';

export type PartyPhase = 'lobby' | 'playing' | 'results';

export interface PartySeatView {
  label: string;
  name: string;
  color: string;
  ready: boolean;
  kind: 'pad' | 'phone';
  connected: boolean;
  you: boolean;
}

export interface PartyView {
  phase: PartyPhase;
  mode: { id: string; title: string; players: string; style: PartyStyle };
  /** This phone's seat label ("P2"), or null while it waits for a seat. */
  seat: string | null;
  seats: PartySeatView[];
  /** How many phones are waiting for a seat. */
  waiting: number;
  /** This phone may pick the game and start it. */
  captain: boolean;
  /** Enough players, and every seated phone ready. */
  canStart: boolean;
  /** One line the TV wants on every phone ("P2 · SAM — YOUR GO", "P1 WINS"). */
  note: string;
  /** TURNS: this phone's go right now. */
  yourGo: boolean;
}

export const PARTY_CMDS = ['ready', 'unready', 'prev', 'next', 'start', 'rematch', 'lobby', 'leave'] as const;
export type PartyCmd = (typeof PARTY_CMDS)[number];

export function parsePartyCmd(raw: unknown): PartyCmd | null {
  return typeof raw === 'string' && (PARTY_CMDS as readonly string[]).includes(raw) ? (raw as PartyCmd) : null;
}

/**
 * May this phone do this now? `seated` = it holds a seat; `captain` = it is the first seated phone.
 * ready / unready / leave: anyone in the room (a waiting phone may ready up for the next game, and anyone may go).
 * prev / next / start: the captain, in the lobby. rematch / lobby: the captain, on the results.
 */
export function partyCmdAllowed(cmd: PartyCmd, who: { seated: boolean; captain: boolean }, phase: PartyPhase): boolean {
  switch (cmd) {
    case 'ready': case 'unready': return phase !== 'playing';
    case 'leave': return true;
    case 'prev': case 'next': case 'start': return who.captain && who.seated && phase === 'lobby';
    case 'rematch': case 'lobby': return who.captain && who.seated && phase === 'results';
  }
}

const MAX_SEATS = 4;
const MAX_TEXT = 40;
const HEX = /^#[0-9a-fA-F]{6}$/;
const str = (v: unknown, max = MAX_TEXT): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** A PartyView as the phone may draw it: bounded, colours only as #rrggbb, junk → null. Never throws. */
export function parsePartyView(raw: unknown): PartyView | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const phase = r.phase === 'lobby' || r.phase === 'playing' || r.phase === 'results' ? r.phase : null;
  const m = r.mode as Record<string, unknown> | undefined;
  if (!phase || !m || typeof m !== 'object' || !Array.isArray(r.seats)) return null;
  const seats: PartySeatView[] = (r.seats as unknown[]).slice(0, MAX_SEATS).flatMap((s) => {
    if (!s || typeof s !== 'object') return [];
    const o = s as Record<string, unknown>;
    return [{
      label: str(o.label, 4), name: str(o.name, 16), color: typeof o.color === 'string' && HEX.test(o.color) ? o.color : '#6b7280',
      ready: o.ready === true, kind: o.kind === 'pad' ? 'pad' : 'phone', connected: o.connected !== false, you: o.you === true,
    }];
  });
  return {
    phase,
    mode: { id: str(m.id, 32), title: str(m.title), players: str(m.players, 16), style: m.style === 'turns' ? 'turns' : 'buzz' },
    seat: typeof r.seat === 'string' ? str(r.seat, 4) || null : null,
    seats,
    waiting: typeof r.waiting === 'number' && Number.isFinite(r.waiting) ? Math.max(0, Math.min(16, Math.floor(r.waiting))) : 0,
    captain: r.captain === true,
    canStart: r.canStart === true,
    note: str(r.note, 64),
    yourGo: r.yourGo === true,
  };
}

/** Same view, so the TV sends a phone only what changed. */
export function samePartyView(a: PartyView | null, b: PartyView | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
