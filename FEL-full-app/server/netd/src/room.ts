// fel-netd — room logic (2026-09-12).
//
// Pure state machine, no sockets. The transport-facing server is a thin shell over this so the
// rules that decide a match can be tested without opening a port.
//
// The server is AUTHORITATIVE for membership and for the tick clock. It is not (yet) running the
// game simulation: moving Havok server-side is a much larger build, and is called out as such
// rather than implied. What this buys today is the thing a peer-hosted match cannot give —
// the match outlives any one player's browser, so a host closing their tab does not delete it.

export const MAX_PLAYERS = 6;
/** A peer silent this long is dropped. Generous: a phone switching networks takes seconds. */
export const PEER_TIMEOUT_MS = 10_000;
/** Rooms with nobody in them are collected after this long. */
export const EMPTY_ROOM_TTL_MS = 60_000;

export interface Peer {
  id: string;
  /** Server clock when we last heard anything at all. */
  lastSeen: number;
  /** Highest input tick this peer has sent. */
  lastInputTick: number;
}

export interface Room {
  id: string;
  mode: string;
  createdAt: number;
  peers: Map<string, Peer>;
  /** The peer whose simulation is treated as truth until the server runs its own. */
  authority: string | null;
  /** Server tick at room start; the shared clock every peer stamps against. */
  startedAt: number;
  emptySince: number | null;
}

export function createRoom(id: string, mode: string, now: number): Room {
  return { id, mode, createdAt: now, peers: new Map(), authority: null, startedAt: now, emptySince: now };
}

export type JoinResult =
  | { ok: true; room: Room; isAuthority: boolean }
  | { ok: false; reason: 'full' | 'duplicate' };

export function join(room: Room, peerId: string, now: number): JoinResult {
  if (room.peers.has(peerId)) return { ok: false, reason: 'duplicate' };
  if (room.peers.size >= MAX_PLAYERS) return { ok: false, reason: 'full' };
  room.peers.set(peerId, { id: peerId, lastSeen: now, lastInputTick: -1 });
  room.emptySince = null;
  // first in owns authority; everyone else inherits it only if the owner leaves
  if (!room.authority) room.authority = peerId;
  return { ok: true, room, isAuthority: room.authority === peerId };
}

/** Returns the new authority when the leaver was holding it, so the caller can announce it. */
export function leave(room: Room, peerId: string, now: number): { newAuthority: string | null; changed: boolean } {
  const had = room.peers.delete(peerId);
  if (!had) return { newAuthority: room.authority, changed: false };
  if (room.peers.size === 0) room.emptySince = now;
  if (room.authority !== peerId) return { newAuthority: room.authority, changed: false };
  // AUTHORITY HANDOVER. The whole point of a server-held room: the match does not die with the
  // host. The longest-present remaining peer takes it, which is stable and needs no election.
  const next = [...room.peers.values()].sort((a, b) => a.lastSeen - b.lastSeen)[0] ?? null;
  room.authority = next ? next.id : null;
  return { newAuthority: room.authority, changed: true };
}

export function touch(room: Room, peerId: string, now: number, inputTick?: number): void {
  const p = room.peers.get(peerId);
  if (!p) return;
  p.lastSeen = now;
  if (inputTick !== undefined && inputTick > p.lastInputTick) p.lastInputTick = inputTick;
}

/** Drop the silent. Returns who went, and whether authority moved as a result. */
export function reap(room: Room, now: number): { dropped: string[]; authorityChanged: boolean } {
  const dropped: string[] = [];
  let authorityChanged = false;
  for (const p of [...room.peers.values()]) {
    if (now - p.lastSeen <= PEER_TIMEOUT_MS) continue;
    dropped.push(p.id);
    const r = leave(room, p.id, now);
    authorityChanged = authorityChanged || r.changed;
  }
  return { dropped, authorityChanged };
}

export function isCollectable(room: Room, now: number): boolean {
  return room.peers.size === 0 && room.emptySince !== null && now - room.emptySince > EMPTY_ROOM_TTL_MS;
}

/** The shared tick every peer stamps against, derived from the server clock alone. */
export function tickAt(room: Room, now: number, tickMs: number): number {
  return Math.floor((now - room.startedAt) / tickMs);
}

/** What the host should ack back to each peer, so clients can measure their own lag. */
export function ackMap(room: Room): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of room.peers.values()) out[p.id] = p.lastInputTick;
  return out;
}
