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

import type { FelInput, InputBus } from '@/lib/babylon/core/InputBus';

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

// ── COUCH (FN-0, 2026-10-19): the host-seat model ───────────────────────────────────────────────────────────────────────
//
// A signed-in host starts a couch session from a mode's own /play page; up to three more people sit down beside them by
// pressing a button on a pad or joining by phone code. The seat rule is the one above (pads first, then phones in join
// order), capped at four; a fifth joiner waits. Everything about a seat lives in this module's memory and nowhere else:
// no account, no DB row, no localStorage, no fetch. The session forgets its seats when it ends.

/** Seats on a couch: the host plus up to three. */
export const COUCH_SEATS = PARTY_CAPACITY;
/** Phones the couch room lets connect: one past the seats, so a fifth joiner waits on the TV instead of being refused. */
export const COUCH_ROOM_PHONES = COUCH_SEATS + 1;

/** The couch's seat table: the seat rule, capped at COUCH_SEATS. */
export function couchSeatTable(pads: readonly PadIn[], phones: readonly PhoneIn[]): SeatTable {
  return seatTable(pads, phones, COUCH_SEATS);
}

/** What the mode reads as ctx.seatCount(): the seated players, never below the host's one. */
export function couchSeatCount(t: SeatTable): number {
  return Math.max(1, Math.min(COUCH_SEATS, t.seats.length));
}

/**
 * One couch session's seats, in memory only. The TV feeds it the pads and the phone lobby; a phone's press is routed to
 * the seat it holds (null = waiting or gone, and the press reaches nobody).
 */
export class CouchSession {
  private table: SeatTable = { seats: [], waiting: [] };

  seat(pads: readonly PadIn[], phones: readonly PhoneIn[]): SeatTable {
    this.table = couchSeatTable(pads, phones);
    return this.table;
  }

  current(): SeatTable { return this.table; }

  seatCount(): number { return couchSeatCount(this.table); }

  seatOfPhone(peerId: string): number | null { return seatOfPhone(this.table, peerId); }

  /**
   * A phone's press, to the seat it holds: InputBus.emitSlot (seat 1 = slot 0) for a mode that reads each seat, and seat
   * 1 also on the merged stream every solo mode reads — as a pad in slot 0 is. A waiting phone reaches nobody. Returns
   * the seat it went to.
   */
  route(peerId: string, e: FelInput, bus: Pick<InputBus, 'emit' | 'emitSlot'>): number | null {
    const seat = this.seatOfPhone(peerId);
    if (seat === null) return null;
    bus.emitSlot(seat, e);
    if (seat === 0) bus.emit(e);
    return seat;
  }

  /** Forget every seat (the room closed). */
  end(): void { this.table = { seats: [], waiting: [] }; }
}

// Whether a couch room is open on this device. In memory, read by the party dock (no chat, no voice on a couch) and by
// the phone controller page once its room says it is a couch.
let couchRooms = 0;
const couchListeners = new Set<() => void>();

export function couchActive(): boolean { return couchRooms > 0; }

/** Open a couch on this device; call the returned function to close it (each opener closes only its own). */
export function enterCouch(): () => void {
  couchRooms++;
  couchListeners.forEach((fn) => fn());
  let open = true;
  return () => {
    if (!open) return;
    open = false;
    couchRooms = Math.max(0, couchRooms - 1);
    couchListeners.forEach((fn) => fn());
  };
}

export function subscribeCouch(fn: () => void): () => void {
  couchListeners.add(fn);
  return () => { couchListeners.delete(fn); };
}
