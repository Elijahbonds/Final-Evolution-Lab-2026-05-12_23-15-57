/**
 * lib/offline-cache.ts
 *
 * OFFLINE-PUSH (round 8, 2026-10-26): wired at last. A single-player run played
 * with no signal (offline play, lib/pwa/offlinePlay.ts) is queued here by
 * lib/pwa/offlineShell.ts and sent to POST /api/offline/results when the signal
 * is back, as PRACTICE: the server records it in the player's history
 * (OfflinePlay) and pays nothing, because it never started or timed the run
 * (ECONOMY-SESSIONS-HARDEN). Paid runs still go through
 * lib/sessions/finishOutbox.ts and /api/sessions, exactly as before.
 * What changed here: every entry carries the account that played it and is
 * sent only while that account is signed in (a shared phone never files one
 * player's run under another's), entries older than the server accepts are
 * dropped, and the old postOrQueue (it posted to /api/sessions, which refuses a
 * run the server did not start) is gone. Tests: lib/offline-cache.test.ts.
 *
 * Original (pre-wiring) intent: a store-and-forward queue so a session played
 * offline (or through a flaky connection) still lands on the server.
 *
 * Harvested from reference/copilot_systems/OfflineCacheSystem.js:
 *  - namespaced localStorage persistence with in-memory fallback (kept)
 *  - queueSync/flushQueue store-and-forward core (kept, typed, hardened)
 *  - isOffline() navigator.onLine check (kept)
 * Added beyond the harvest: client-generated idempotency ids, bounded
 * queue + bounded retry attempts, permanent-vs-transient failure
 * handling on flush, and auto-flush wiring (online/visibilitychange).
 *
 * SERVER-AUTHORITATIVE NOTE: this queue only defers the *delivery* of a
 * result. It never computes balances, PRQ, or story unlocks — and the offline
 * results endpoint pays nothing at all.
 *
 * Client-only module: guard all usage behind 'use client' components.
 */

// ---------------------------------------------------------------------------
// Payload contract (POST /api/offline/results; lib/pwa/offlineResults.ts parseOfflineResult)
// ---------------------------------------------------------------------------

export interface SessionResultPayload {
  mode: string;
  score: number;
  /** ISO timestamp of when the run actually finished (not when synced). */
  completedAt: string;
  durationMs?: number;
  /** The run's own verdict (offline: practice, never paid; the server stores it as told). */
  won?: boolean;
  /** Story context: set when the run was launched via /play/<mode>?story=<nodeId>. */
  storyNodeId?: string;
  /** Mode-specific stat bag, passed through opaquely. */
  stats?: Record<string, number>;
  /** FEATURES-UX-SHOP: the shell saw input during the run (lib/session-evidence.ts). */
  played?: boolean;
}

export interface QueuedResult {
  /** Client-generated idempotency id — survives retries and reloads. */
  clientId: string;
  /** The account that played it; sent only while that account is signed in. */
  userId: string | null;
  payload: SessionResultPayload;
  queuedAt: number;
  attempts: number;
}

export interface FlushOutcome {
  delivered: number;
  /** Dropped as permanently rejected (4xx) or over the attempt cap. */
  dropped: number;
  /** Still queued (offline / transient failure). */
  remaining: number;
  /** Server responses for delivered items, keyed by clientId. */
  responses: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Storage core (harvested: namespaced localStorage + memory fallback)
// ---------------------------------------------------------------------------

class NamespacedStore {
  private readonly namespace: string;
  private readonly memory = new Map<string, string>();

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  load<T>(key: string, fallback: T): T {
    const raw = this.read(this.keyFor(key));
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  save(key: string, value: unknown): void {
    this.write(this.keyFor(key), JSON.stringify(value));
  }

  private keyFor(key: string): string {
    return `${this.namespace}:${key}`;
  }

  private read(key: string): string | null {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {
      // Storage disabled (private mode / blocked) — fall through to memory.
    }
    return this.memory.get(key) ?? null;
  }

  private write(key: string, value: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return;
      }
    } catch {
      // Quota exceeded or storage blocked — keep the session alive in memory.
    }
    this.memory.set(key, value);
  }
}

export function isOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !navigator.onLine;
}

function makeClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Session result queue
// ---------------------------------------------------------------------------

export interface SessionResultQueueOptions {
  endpoint?: string;
  namespace?: string;
  /** Oldest entries are evicted beyond this cap. */
  maxQueue?: number;
  /** Entries are dropped after this many failed delivery attempts. */
  maxAttempts?: number;
  /** Entries older than this are dropped unsent (the server refuses them). */
  maxAgeMs?: number;
}

/** = lib/pwa/offlineResults.ts OFFLINE_RESULT_MAX_AGE_MS: the server accepts runs played in the last 14 days. */
export const OFFLINE_QUEUE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Where offline runs are sent. */
export const OFFLINE_RESULTS_ENDPOINT = '/api/offline/results';

const QUEUE_KEY = 'session-result-queue';

export class SessionResultQueue {
  private readonly endpoint: string;
  private readonly store: NamespacedStore;
  private readonly maxQueue: number;
  private readonly maxAttempts: number;
  private readonly maxAgeMs: number;
  private flushing = false;

  constructor(options: SessionResultQueueOptions = {}) {
    this.endpoint = options.endpoint ?? OFFLINE_RESULTS_ENDPOINT;
    this.store = new NamespacedStore(options.namespace ?? 'fel');
    this.maxQueue = options.maxQueue ?? 50;
    this.maxAttempts = options.maxAttempts ?? 8;
    this.maxAgeMs = options.maxAgeMs ?? OFFLINE_QUEUE_MAX_AGE_MS;
  }

  get pendingCount(): number {
    return this.loadQueue().length;
  }

  peek(): readonly QueuedResult[] {
    return this.loadQueue();
  }

  /** Results waiting for this account. */
  pendingFor(userId: string | null): number {
    return userId ? this.loadQueue().filter((e) => e.userId === userId).length : 0;
  }

  /** Adds a result to the queue, filed under the account that played it. Returns the queue length. */
  enqueue(payload: SessionResultPayload, userId: string | null = null): number {
    const queue = this.loadQueue();
    queue.push({
      clientId: makeClientId(),
      userId,
      payload,
      queuedAt: Date.now(),
      attempts: 0,
    });
    // Bound the queue: evict oldest first (they are least recoverable).
    while (queue.length > this.maxQueue) {
      queue.shift();
    }
    this.saveQueue(queue);
    return queue.length;
  }

  /**
   * Attempts to deliver everything in the queue that belongs to `userId`,
   * oldest first (another account's entries wait for that account; with no
   * account nothing is sent). Stops early on network failure (still offline).
   * Safe to call from multiple triggers — re-entrant calls no-op while a flush
   * is running.
   */
  async flush(userId: string | null, now: number = Date.now()): Promise<FlushOutcome> {
    const outcome: FlushOutcome = {
      delivered: 0,
      dropped: 0,
      remaining: 0,
      responses: {},
    };
    if (this.flushing || isOffline() || !userId) {
      outcome.remaining = this.pendingCount;
      return outcome;
    }

    this.flushing = true;
    try {
      const all = this.loadQueue();
      // too old for the server to accept: dropped, unsent
      const fresh = all.filter((e) => now - e.queuedAt < this.maxAgeMs);
      outcome.dropped += all.length - fresh.length;
      const queue = fresh.filter((e) => e.userId === userId);
      const others = fresh.filter((e) => e.userId !== userId);
      const keep: QueuedResult[] = [];

      for (let i = 0; i < queue.length; i += 1) {
        const entry = queue[i] as QueuedResult;
        let res: Response;
        try {
          res = await this.post(entry.payload, entry.clientId);
        } catch {
          // Network died mid-flush: keep this and everything after it.
          keep.push(
            { ...entry, attempts: entry.attempts + 1 },
            ...queue.slice(i + 1),
          );
          break;
        }

        if (res.ok) {
          outcome.delivered += 1;
          outcome.responses[entry.clientId] = await safeJson(res);
          continue;
        }
        if (res.status === 503) {
          // the server is not ready to record it yet (its table is not applied): wait, without using up an attempt —
          // the age limit above still ends the wait
          keep.push(entry);
          continue;
        }
        if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 429) {
          // Permanently invalid payload — drop it.
          outcome.dropped += 1;
          continue;
        }
        // Transient (5xx / 401 mid-session-expiry / 429): retry later.
        const attempts = entry.attempts + 1;
        if (attempts >= this.maxAttempts) {
          outcome.dropped += 1;
        } else {
          keep.push({ ...entry, attempts });
        }
      }

      // Merge with anything enqueued while we were flushing.
      const enqueuedDuringFlush = this.loadQueue().filter(
        (e) => !all.some((q) => q.clientId === e.clientId),
      );
      const next = [...others, ...keep, ...enqueuedDuringFlush];
      this.saveQueue(next);
      outcome.remaining = next.length;
      return outcome;
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Wires auto-flush to reconnect and tab-foreground events.
   * Returns a cleanup function (call in the component's unmount effect).
   */
  attachAutoFlush(userId: () => string | null, onFlush?: (outcome: FlushOutcome) => void): () => void {
    if (typeof window === 'undefined') {
      return () => undefined;
    }
    const trigger = (): void => {
      const who = userId();
      if (this.pendingFor(who) === 0) return;
      void this.flush(who).then((outcome) => {
        if (onFlush && (outcome.delivered > 0 || outcome.dropped > 0)) {
          onFlush(outcome);
        }
      });
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') trigger();
    };
    window.addEventListener('online', trigger);
    document.addEventListener('visibilitychange', onVisibility);
    // Also try immediately — we may have queued results from a past visit.
    trigger();
    return () => {
      window.removeEventListener('online', trigger);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  clear(): void {
    this.saveQueue([]);
  }

  // -- private ---------------------------------------------------------------

  private async post(
    payload: SessionResultPayload,
    clientId?: string,
  ): Promise<Response> {
    return fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The server records one row per id (OfflinePlay userId + runKey), however often it is re-sent.
        ...(clientId ? { 'X-Client-Result-Id': clientId } : {}),
      },
      body: JSON.stringify(payload),
    });
  }

  private loadQueue(): QueuedResult[] {
    const queue = this.store.load<QueuedResult[]>(QUEUE_KEY, []);
    return Array.isArray(queue) ? queue : [];
  }

  private saveQueue(queue: QueuedResult[]): void {
    this.store.save(QUEUE_KEY, queue);
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared singleton (one queue per tab)
// ---------------------------------------------------------------------------

let sharedQueue: SessionResultQueue | null = null;

export function getSessionResultQueue(): SessionResultQueue {
  if (!sharedQueue) {
    sharedQueue = new SessionResultQueue();
  }
  return sharedQueue;
}
