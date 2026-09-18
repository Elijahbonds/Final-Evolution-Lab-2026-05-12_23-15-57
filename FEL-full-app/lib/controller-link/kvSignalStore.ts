// KV-backed SignalStore — the production implementation.
//
// The default MemorySignalStore is an in-process Map. That is correct in dev and
// on a single long-lived instance, and WRONG on Vercel: each serverless
// invocation may land in a different isolate with its own empty Map, so a
// phone's answer gets written to one instance and polled from another that never
// sees it. Controller Link simply does not connect in production without this.
//
// Deliberately dependency-free: it speaks the Upstash/Vercel-KV REST dialect
// over plain fetch, so there is no new package to install, nothing to bundle,
// and no cold-start client to construct. Any Redis-compatible REST endpoint
// works; swap KvTransport for a native client if you would rather.
//
// Enabled by env: CONTROLLER_LINK_KV_URL + CONTROLLER_LINK_KV_TOKEN.
// Absent → the caller keeps the memory store, which is the right dev default.

import type { RoomRecord, SignalEnvelope, SignalStore } from './signalStore';

/** Minimal KV surface. Everything below is built from these three calls. */
export interface KvTransport {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  /** Atomic increment — used for the message sequence. */
  incr(key: string, ttlSec: number): Promise<number>;
}

/** Rooms are short-lived; a TV left on overnight should not pin state forever. */
const TTL_SEC = 2 * 60 * 60;
const MAX_MESSAGES = 200;

const k = {
  meta: (code: string) => `felcl:${code}:meta`,
  peers: (code: string) => `felcl:${code}:peers`,
  seq: (code: string) => `felcl:${code}:seq`,
  mbox: (code: string, to: string) => `felcl:${code}:mbox:${to}`,
};

/** Upstash/Vercel-KV REST transport over fetch. No SDK required. */
export function restKvTransport(url: string, token: string): KvTransport {
  const call = async (path: string): Promise<unknown> => {
    const res = await fetch(`${url}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`KV ${path} failed: ${res.status}`);
    return (await res.json())?.result ?? null;
  };
  return {
    async get(key) {
      const r = await call(`get/${encodeURIComponent(key)}`);
      return typeof r === 'string' ? r : null;
    },
    async set(key, value, ttlSec) {
      // Value goes in the path segment; encode it so JSON survives intact.
      await call(`set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${ttlSec}`);
    },
    async incr(key, ttlSec) {
      const n = await call(`incr/${encodeURIComponent(key)}`);
      await call(`expire/${encodeURIComponent(key)}/${ttlSec}`);
      return typeof n === 'number' ? n : Number(n ?? 0);
    },
  };
}

/**
 * Messages are stored per RECIPIENT rather than in one room blob. The host and
 * each phone then write to different keys for the whole handshake, which is
 * what keeps read-modify-write contention off the hot path.
 *
 * Residual race, stated plainly: two phones joining in the same instant both
 * append to the host's mailbox, and one append can lose. The sequence counter is
 * atomic (incr), so ordering and the poll cursor stay correct, and a dropped
 * hello is retried by ControllerClient's reconnect backoff. If you want it gone
 * entirely, back the mailbox with a native Redis list (LPUSH/LRANGE) instead of
 * get-modify-set — the KvTransport seam is where that swap goes.
 */
export class KvSignalStore implements SignalStore {
  constructor(private kv: KvTransport) {}

  private async readJson<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await this.kv.get(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  async createRoom(code: string, modeId: string, hostId: string): Promise<RoomRecord> {
    const room: RoomRecord = {
      code, modeId, hostId, createdAt: Date.now(), peers: [], messages: [], seq: 0,
    };
    await this.kv.set(k.meta(code), JSON.stringify({
      code, modeId, hostId, createdAt: room.createdAt,
    }), TTL_SEC);
    await this.kv.set(k.peers(code), '[]', TTL_SEC);
    return room;
  }

  async getRoom(code: string): Promise<RoomRecord | null> {
    const meta = await this.readJson<null | {
      code: string; modeId: string; hostId: string; createdAt: number;
    }>(k.meta(code), null);
    if (!meta) return null;
    const peers = await this.readJson<RoomRecord['peers']>(k.peers(code), []);
    // messages are per-mailbox; callers that need them use poll().
    return { ...meta, peers, messages: [], seq: 0 };
  }

  async addPeer(code: string, peerId: string, name: string): Promise<RoomRecord | null> {
    const room = await this.getRoom(code);
    if (!room) return null;
    const peers = room.peers.slice();
    const existing = peers.find((p) => p.peerId === peerId);
    // A reconnecting phone re-announces with the same id — refresh in place so
    // the lobby does not grow a ghost peer.
    if (existing) existing.name = name;
    else peers.push({ peerId, name, joinedAt: Date.now() });
    await this.kv.set(k.peers(code), JSON.stringify(peers), TTL_SEC);
    return { ...room, peers };
  }

  async push(code: string, env: Omit<SignalEnvelope, 'seq'>): Promise<number | null> {
    if (!(await this.kv.get(k.meta(code)))) return null;
    const seq = await this.kv.incr(k.seq(code), TTL_SEC);
    const box = k.mbox(code, env.to);
    const list = await this.readJson<SignalEnvelope[]>(box, []);
    list.push({ ...env, seq });
    if (list.length > MAX_MESSAGES) list.splice(0, list.length - MAX_MESSAGES);
    await this.kv.set(box, JSON.stringify(list), TTL_SEC);
    return seq;
  }

  async poll(code: string, to: string, after: number): Promise<SignalEnvelope[]> {
    const list = await this.readJson<SignalEnvelope[]>(k.mbox(code, to), []);
    return list.filter((m) => m.seq > after);
  }

  async sweep(): Promise<void> {
    // No-op by design: every key is written with a TTL, so the store expires
    // itself. A scan-and-delete sweep would cost far more than it saves.
  }
}

/** Build the production store from env, or null to keep the memory default. */
export function kvSignalStoreFromEnv(): KvSignalStore | null {
  const url = process.env.CONTROLLER_LINK_KV_URL;
  const token = process.env.CONTROLLER_LINK_KV_TOKEN;
  if (!url || !token) return null;
  return new KvSignalStore(restKvTransport(url, token));
}
