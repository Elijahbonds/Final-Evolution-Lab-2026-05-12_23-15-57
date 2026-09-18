/**
 * lib/offline-cache.ts
 *
 * Offline resilience for game results: store-and-forward queue so a
 * session played offline (or through a flaky connection) still lands in
 * /api/sessions — and, for story runs, can still complete its node.
 *
 * Harvested from reference/copilot_systems/OfflineCacheSystem.js:
 *  - namespaced localStorage persistence with in-memory fallback (kept)
 *  - queueSync/flushQueue store-and-forward core (kept, typed, hardened)
 *  - isOffline() navigator.onLine check (kept)
 * Added beyond the harvest: client-generated idempotency ids, bounded
 * queue + bounded retry attempts, permanent-vs-transient failure
 * handling on flush, auto-flush wiring (online/visibilitychange), and a
 * typed GameShell contract (`postOrQueue`).
 *
 * SERVER-AUTHORITATIVE NOTE: this queue only defers the *delivery* of a
 * result to /api/sessions. It never computes balances, PRQ, or story
 * unlocks — those stay behind the API. A story node completion is only
 * requested AFTER the queued session row has been accepted by the server
 * (we need the server's sessionId for /api/story/complete).
 *
 * Client-only module: guard all usage behind 'use client' components.
 */

// ---------------------------------------------------------------------------
// Payload contract (matches GameShell's /api/sessions POST body)
// ---------------------------------------------------------------------------

export interface SessionResultPayload {
  mode: string;
  score: number;
  /** ISO timestamp of when the run actually finished (not when synced). */
  completedAt: string;
  durationMs?: number;
  /** Story context: set when the run was launched via /play/<mode>?story=<nodeId>. */
  storyNodeId?: string;
  /** Mode-specific stat bag, passed through opaquely. */
  stats?: Record<string, number>;
}

export interface QueuedResult {
  /** Client-generated idempotency id — survives retries and reloads. */
  clientId: string;
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

export interface PostOrQueueResult {
  delivered: boolean;
  /** Present when delivered: the parsed /api/sessions response
   *  (contains the server sessionId needed for /api/story/complete). */
  response?: unknown;
  /** Present when queued: number of results now waiting. */
  queuedCount?: number;
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
}

const QUEUE_KEY = 'session-result-queue';

export class SessionResultQueue {
  private readonly endpoint: string;
  private readonly store: NamespacedStore;
  private readonly maxQueue: number;
  private readonly maxAttempts: number;
  private flushing = false;

  constructor(options: SessionResultQueueOptions = {}) {
    this.endpoint = options.endpoint ?? '/api/sessions';
    this.store = new NamespacedStore(options.namespace ?? 'fel');
    this.maxQueue = options.maxQueue ?? 50;
    this.maxAttempts = options.maxAttempts ?? 8;
  }

  get pendingCount(): number {
    return this.loadQueue().length;
  }

  peek(): readonly QueuedResult[] {
    return this.loadQueue();
  }

  /** Adds a result to the queue. Returns the queue length. */
  enqueue(payload: SessionResultPayload): number {
    const queue = this.loadQueue();
    queue.push({
      clientId: makeClientId(),
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
   * GameShell contract: try to deliver immediately; on network failure
   * (or known-offline), queue for later. Server 4xx responses are NOT
   * queued — the payload is invalid and retrying cannot fix it.
   */
  async postOrQueue(payload: SessionResultPayload): Promise<PostOrQueueResult> {
    if (!isOffline()) {
      try {
        const res = await this.post(payload);
        if (res.ok) {
          return { delivered: true, response: await safeJson(res) };
        }
        if (res.status >= 400 && res.status < 500) {
          // Permanent rejection — surface it, don't queue a poison pill.
          throw new Error(`Session rejected by server (${res.status})`);
        }
        // 5xx: transient — fall through to queue.
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Session rejected')) {
          throw error;
        }
        // Network error — fall through to queue.
      }
    }
    const queuedCount = this.enqueue(payload);
    return { delivered: false, queuedCount };
  }

  /**
   * Attempts to deliver everything in the queue, oldest first.
   * Stops early on network failure (still offline). Safe to call from
   * multiple triggers — re-entrant calls no-op while a flush is running.
   */
  async flush(): Promise<FlushOutcome> {
    const outcome: FlushOutcome = {
      delivered: 0,
      dropped: 0,
      remaining: 0,
      responses: {},
    };
    if (this.flushing || isOffline()) {
      outcome.remaining = this.pendingCount;
      return outcome;
    }

    this.flushing = true;
    try {
      let queue = this.loadQueue();
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
        (e) => !queue.some((q) => q.clientId === e.clientId),
      );
      const next = [...keep, ...enqueuedDuringFlush];
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
  attachAutoFlush(onFlush?: (outcome: FlushOutcome) => void): () => void {
    if (typeof window === 'undefined') {
      return () => undefined;
    }
    const trigger = (): void => {
      if (this.pendingCount === 0) return;
      void this.flush().then((outcome) => {
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
        // Lets /api/sessions dedupe replays if it chooses to honor it.
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
