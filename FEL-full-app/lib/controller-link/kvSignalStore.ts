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

/** Minimal KV surface. Everything below is built from these calls. */
export interface KvTransport {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  /** Atomic increment — used for the message sequence. */
  incr(key: string, ttlSec: number): Promise<number>;
  /**
   * MULTIPLAYER (2026-10-06): append one entry to a list, keep only the newest `cap`, refresh the TTL. Atomic per
   * append (RPUSH), so two phones joining in the same instant both land — the old get-modify-set lost one.
   */
  append(key: string, value: string, cap: number, ttlSec: number): Promise<void>;
  /** The whole list, oldest first (empty when the key is absent). */
  list(key: string): Promise<string[]>;
}

/** Rooms are short-lived; a TV left on overnight should not pin state forever. */
const TTL_SEC = 2 * 60 * 60;
const MAX_MESSAGES = 200;

const k = {
  meta: (code: string) => `felcl:${code}:meta`,
  peers: (code: string) => `felcl:${code}:peers`,
  seq: (code: string) => `felcl:${code}:seq`,
  // MULTIPLAYER (2026-10-06): a Redis LIST now, under a new name. The old `:mbox:` key held a JSON string; RPUSH on a
  // room opened before this deploy would answer WRONGTYPE, so the list never shares a key with the old blob.
  mbox: (code: string, to: string) => `felcl:${code}:mlist:${to}`,
};

type KvCommand = string[];

/** `set felcl:AB12:meta` — the command and key for an error message, never the value (an SDP blob, up to 64 KB+). */
const describe = (cmd: KvCommand): string => `${cmd[0].toLowerCase()} ${cmd[1] ?? ''}`.trim();

/**
 * Upstash/Vercel-KV REST transport over fetch. No SDK required.
 *
 * MULTIPLAYER (2026-10-06): every command goes in the request BODY as a JSON array (`POST <url>` with
 * `["SET", key, value, "EX", ttl]`, or `POST <url>/pipeline` with an array of them), never in the URL. The old
 * path-style `GET <url>/set/<key>/<value>` put the whole mailbox in the URL, and the TV's mailbox was rewritten whole
 * on every message, so a busy room could outgrow the endpoint's URL limit (414/400 on the signal POST —
 * docs/DEPLOY-CHECKLIST-PARTY.md section 5). The body has no such limit short of the plan's request size (1 MB+).
 */
export function restKvTransport(url: string, token: string): KvTransport {
  // A trailing slash would make `${base}/pipeline` a `//pipeline` path; strip it rather than 404 on it.
  const base = url.replace(/\/+$/, '');
  const post = async (endpoint: string, body: unknown, label: string): Promise<unknown> => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`KV ${label} failed: ${res.status}`);
    return res.json();
  };
  const command = async (cmd: KvCommand): Promise<unknown> =>
    ((await post(base, cmd, describe(cmd))) as { result?: unknown } | null)?.result ?? null;
  /** Several commands in one round trip. Upstash answers 200 with a per-command `{ result }` or `{ error }`. */
  const pipeline = async (cmds: KvCommand[]): Promise<unknown[]> => {
    const out = await post(`${base}/pipeline`, cmds, cmds.map(describe).join(' + '));
    if (!Array.isArray(out) || out.length !== cmds.length) {
      throw new Error(`KV pipeline ${cmds.map(describe).join(' + ')} failed: malformed reply`);
    }
    return out.map((r: { result?: unknown; error?: unknown } | null, i) => {
      if (r?.error) throw new Error(`KV ${describe(cmds[i])} failed: ${String(r.error)}`);
      return r?.result ?? null;
    });
  };
  return {
    async get(key) {
      const r = await command(['GET', key]);
      return typeof r === 'string' ? r : null;
    },
    async set(key, value, ttlSec) {
      await command(['SET', key, value, 'EX', String(ttlSec)]);
    },
    async incr(key, ttlSec) {
      const [n] = await pipeline([['INCR', key], ['EXPIRE', key, String(ttlSec)]]);
      return typeof n === 'number' ? n : Number(n ?? 0);
    },
    async append(key, value, cap, ttlSec) {
      await pipeline([
        ['RPUSH', key, value],
        ['LTRIM', key, String(-cap), '-1'],
        ['EXPIRE', key, String(ttlSec)],
      ]);
    },
    async list(key) {
      const r = await command(['LRANGE', key, '0', '-1']);
      return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : [];
    },
  };
}

/**
 * Messages are stored per RECIPIENT rather than in one room blob. The host and
 * each phone then write to different keys for the whole handshake, which is
 * what keeps contention off the hot path.
 *
 * MULTIPLAYER (2026-10-06): each mailbox is a Redis list, one entry per message (RPUSH + LTRIM to the newest
 * MAX_MESSAGES). A message costs its own size on the wire instead of re-sending the whole mailbox, and two phones
 * joining in the same instant both land (the old get-modify-set could drop one). Residual, stated plainly: two pushes
 * can reach the list out of sequence order (incr, then append). poll() sorts by seq, so one poll is always in order;
 * a poll that falls between the two appends can move the cursor past the later-landing lower seq, and that message
 * is then retried by ControllerClient's reconnect backoff, as a dropped hello always was.
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
    await this.kv.append(k.mbox(code, env.to), JSON.stringify({ ...env, seq }), MAX_MESSAGES, TTL_SEC);
    return seq;
  }

  async poll(code: string, to: string, after: number): Promise<SignalEnvelope[]> {
    let raw: string[];
    try {
      raw = await this.kv.list(k.mbox(code, to));
    } catch {
      return [];
    }
    const out: SignalEnvelope[] = [];
    for (const r of raw) {
      try {
        const m = JSON.parse(r) as SignalEnvelope;
        if (m && typeof m.seq === 'number' && m.seq > after) out.push(m);
      } catch { /* one unreadable entry must not hide the rest of the mailbox */ }
    }
    return out.sort((a, b) => a.seq - b.seq);
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
