// Signaling store — the ONLY server-side state Controller Link needs.
//
// Why this is tiny on purpose: once WebRTC connects, gameplay input flows
// peer-to-peer and never touches the server again. The server's whole job is to
// pass a handful of SDP/ICE messages during the few seconds of a join. That is
// what makes this deployable on serverless at all.
//
// DEPLOYMENT WARNING — read before shipping to Vercel:
// The default store below is an in-process Map. That is correct for `next dev`
// and for any single long-lived instance, and it is what this reference
// implementation is tested against. It is NOT correct on Vercel's serverless
// runtime, where each function invocation may land in a different isolate with
// its own empty Map, so a phone's answer can be written to one instance and
// read from another that never sees it.
//
// The interface below is the whole seam. Ship a KV/Redis/Postgres implementation
// of SignalStore and call setSignalStore() once at startup; nothing else in the
// codebase changes. Entries are short-lived and small, so a KV with TTL is the
// natural fit.

export interface SignalEnvelope {
  /** Monotonic per-room sequence so pollers can ask for "everything after N". */
  seq: number;
  from: string;
  to: string;
  /** Opaque SDP / ICE payload. */
  data: unknown;
}

export interface RoomRecord {
  code: string;
  modeId: string;
  hostId: string;
  createdAt: number;
  /** Peers that have announced themselves, newest last. */
  peers: { peerId: string; name: string; joinedAt: number }[];
  messages: SignalEnvelope[];
  seq: number;
}

export interface SignalStore {
  createRoom(code: string, modeId: string, hostId: string): Promise<RoomRecord>;
  getRoom(code: string): Promise<RoomRecord | null>;
  addPeer(code: string, peerId: string, name: string): Promise<RoomRecord | null>;
  push(code: string, env: Omit<SignalEnvelope, 'seq'>): Promise<number | null>;
  /** Messages addressed to `to` with seq > after. */
  poll(code: string, to: string, after: number): Promise<SignalEnvelope[]>;
  sweep(): Promise<void>;
}

/** Rooms older than this are swept — a TV left on overnight should not pin state. */
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
/** Signaling messages are consumed within seconds; keep the buffer bounded. */
const MAX_MESSAGES = 200;

class MemorySignalStore implements SignalStore {
  private rooms = new Map<string, RoomRecord>();

  async createRoom(code: string, modeId: string, hostId: string): Promise<RoomRecord> {
    const room: RoomRecord = {
      code, modeId, hostId, createdAt: Date.now(), peers: [], messages: [], seq: 0,
    };
    this.rooms.set(code, room);
    return room;
  }

  async getRoom(code: string): Promise<RoomRecord | null> {
    return this.rooms.get(code) ?? null;
  }

  async addPeer(code: string, peerId: string, name: string): Promise<RoomRecord | null> {
    const room = this.rooms.get(code);
    if (!room) return null;
    const existing = room.peers.find((p) => p.peerId === peerId);
    // A reconnecting phone re-announces with the same id — refresh it in place
    // rather than appending a duplicate ghost peer to the lobby.
    if (existing) existing.name = name;
    else room.peers.push({ peerId, name, joinedAt: Date.now() });
    return room;
  }

  async push(code: string, env: Omit<SignalEnvelope, 'seq'>): Promise<number | null> {
    const room = this.rooms.get(code);
    if (!room) return null;
    room.seq += 1;
    room.messages.push({ ...env, seq: room.seq });
    if (room.messages.length > MAX_MESSAGES) {
      room.messages.splice(0, room.messages.length - MAX_MESSAGES);
    }
    return room.seq;
  }

  async poll(code: string, to: string, after: number): Promise<SignalEnvelope[]> {
    const room = this.rooms.get(code);
    if (!room) return [];
    return room.messages.filter((m) => m.to === to && m.seq > after);
  }

  async sweep(): Promise<void> {
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const [code, room] of this.rooms) {
      if (room.createdAt < cutoff) this.rooms.delete(code);
    }
  }
}

// Survives dev hot-reload: without this the Map is rebuilt on every edit and
// every in-flight join silently breaks with "room not found".
const g = globalThis as unknown as { __felSignalStore?: SignalStore };
let store: SignalStore = g.__felSignalStore ?? new MemorySignalStore();
g.__felSignalStore = store;

/** Set once, on first use: prefer a KV-backed store when env configures one. */
let resolved = false;

export function getSignalStore(): SignalStore {
  if (!resolved) {
    resolved = true;
    // Late import breaks the cycle (kvSignalStore imports this module's types)
    // and keeps the KV code out of any bundle that never calls the API routes.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const { kvSignalStoreFromEnv } = require('./kvSignalStore') as typeof import('./kvSignalStore');
      const kv = kvSignalStoreFromEnv();
      if (kv) {
        store = kv;
        g.__felSignalStore = kv;
        console.info('[FEL] Controller Link signaling: KV store (multi-instance safe).');
      }
    } catch {
      // Fall through to memory — a signaling store must never take the app down.
    }
  }
  return store;
}

/** Swap in a KV/Redis/Postgres-backed store for multi-instance deployment. */
export function setSignalStore(next: SignalStore): void {
  store = next;
  g.__felSignalStore = next;
}
