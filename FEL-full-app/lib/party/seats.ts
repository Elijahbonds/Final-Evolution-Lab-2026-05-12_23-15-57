// lib/party/seats.ts — who is P1, P2, P3, P4 in a party room (MULTIPLAYER lane, 2026-10-06).
//
// Two kinds of controller sit on one couch: a GAMEPAD plugged into (or paired with) the TV device, and a PHONE that
// joined by code. The game itself only knows gamepads: InputBus seats each pad in its own slot (pad order = P1, P2…)
// and the merged stream it feeds a mode is "pad 1". So the seat rule is fixed by the games, not chosen here:
//
//   PADS SIT FIRST, in their InputBus slot order; PHONES FILL THE SEATS AFTER THEM, in the order they joined.
//
// That way the number on a player's card is the number the game treats them as. (Brain Brawl with one pad and one phone:
// the pad's face buttons are P1 to the mode, so the pad must be P1 on the TV and the phone P2.) A phone past the last
// seat is WAITING — kept in the room, shown on the TV, seated the moment a seat opens. Nobody is ever refused for being
// one too many; they just play the next game.
//
// Pure: no DOM, no React. The TV page feeds it InputBus.pads() and HostSession.lobby().

export const PARTY_CAPACITY = 4;

/** One colour per seat, the same on the TV card and the phone's header. */
export const SEAT_COLORS = ['#22d3ee', '#f43f5e', '#facc15', '#4ade80'] as const;

export interface PadIn { slot: number; name: string }
export interface PhoneIn {
  peerId: string;
  name: string;
  /** HostSession's slot — the order phones joined (lowest free first), stable across a reconnect. */
  slot: number | null;
  ready: boolean;
  connected: boolean;
}

export interface Seat {
  /** 0-based seat; P1 is 0. Null for a waiting phone. */
  index: number | null;
  label: string;
  color: string;
  kind: 'pad' | 'phone';
  name: string;
  /** A pad is ready by being pressed; a phone says so. */
  ready: boolean;
  connected: boolean;
  /** `pad:<slot>` or `phone:<peerId>` — the host's own handle, never sent to a phone. */
  key: string;
}

export interface SeatTable { seats: Seat[]; waiting: Seat[] }

/** Seat everyone: pads first by slot, then phones by join slot; `seatCount` seats, the rest wait. */
export function seatTable(pads: readonly PadIn[], phones: readonly PhoneIn[], seatCount: number = PARTY_CAPACITY): SeatTable {
  const cap = Math.max(0, Math.min(PARTY_CAPACITY, Math.floor(seatCount)));
  const ordered: Omit<Seat, 'index' | 'label' | 'color'>[] = [
    ...[...pads].sort((a, b) => a.slot - b.slot).map((p) => ({
      kind: 'pad' as const, name: padName(p.name), ready: true, connected: true, key: `pad:${p.slot}`,
    })),
    ...[...phones]
      .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99))
      .map((p) => ({ kind: 'phone' as const, name: p.name, ready: p.ready, connected: p.connected, key: `phone:${p.peerId}` })),
  ];
  const seats: Seat[] = [];
  const waiting: Seat[] = [];
  ordered.forEach((s, i) => {
    if (i < cap) seats.push({ ...s, index: i, label: `P${i + 1}`, color: SEAT_COLORS[i], name: s.name || `P${i + 1}` });
    else waiting.push({ ...s, index: null, label: 'NEXT', color: '#6b7280', name: s.name || 'PLAYER' });
  });
  return { seats, waiting };
}

/** A pad's card name: the controller family, short ("Xbox Controller" → "XBOX PAD"). */
export function padName(profileName: string): string {
  const first = (profileName || '').split(/[\s(]/)[0].toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
  // a family name says something ("XBOX PAD"); a generic first word ("Wireless Controller") does not
  return /^(|WIRELESS|CONTROLL|GAMEPAD|GAME|USB|GENERIC|STANDARD)$/.test(first) ? 'GAME PAD' : `${first} PAD`;
}

/** The seat a phone holds now, or null (waiting, or gone). */
export function seatOfPhone(t: SeatTable, peerId: string): number | null {
  return t.seats.find((s) => s.key === `phone:${peerId}`)?.index ?? null;
}

/** Whether `count` seated players may start `min`..: every seated PHONE has said ready (pads are ready by pressing). */
export function everyoneReady(t: SeatTable): boolean {
  return t.seats.length > 0 && t.seats.every((s) => s.ready || !s.connected);
}

/** The phone that may drive the lobby from its screen: the lowest-seated connected phone. */
export function captainKey(t: SeatTable): string | null {
  return t.seats.find((s) => s.kind === 'phone' && s.connected)?.key ?? null;
}

/** What an empty seat says on the TV. */
export function openSeatHint(hasPads: boolean): string {
  return hasPads ? 'Press any button on a controller · or scan' : 'Scan the code · or press A on a controller';
}
