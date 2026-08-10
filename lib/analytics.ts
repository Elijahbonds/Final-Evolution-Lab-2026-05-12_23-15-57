/**
 * lib/analytics.ts
 *
 * Typed, fire-and-forget analytics event bus for the client.
 *
 * Harvested from copilot_systems:
 * - AnalyticsSystem.js    -> queue + counts + flush() semantics.
 * - OfflineCacheSystem.js -> localStorage store-and-forward with in-memory
 *                            fallback and a namespaced queue key.
 * Rewritten as a typed module-level singleton (no classes to instantiate in
 * components) with batching, sendBeacon/keepalive delivery, and SSR safety.
 *
 * Rules:
 * - Fire-and-forget: track() never throws and never blocks gameplay.
 * - Store-and-forward: events persist to localStorage; a failed flush
 *   re-queues; queue is capped so it can never grow unbounded.
 * - Analytics is telemetry ONLY. It never carries PRQ deltas or credit
 *   amounts — those travel exclusively through /api/sessions and the
 *   economy routes (server-authoritative rule).
 */

// ---------------------------------------------------------------------------
// Typed event map — add new events here and the compiler enforces payloads.
// ---------------------------------------------------------------------------

export interface AnalyticsEventMap {
  session_start: { mode: string };
  session_complete: {
    mode: string;
    score: number;
    won: boolean;
    durationSec: number;
  };
  lesson_start: { lessonId: string; moduleId?: string; trackId?: string };
  lesson_complete: { lessonId: string; score: number; passed: boolean };
  checkpoint_clear: { moduleId: string; score: number };
  purchase: { cardId: string; cardType?: string; cost: number };
  shop_view: { section?: string };
  profile_view: { tab?: string };
  readiness_logged: { score: number; band: string };
  app_error: { message: string; context?: string };
  // --- M13 funnel + retention instrumentation (Blueprint Part 3) ---
  guest_start: { source?: string };
  play_now_click: { target?: string };
  first_dunk_judged: { card: number };
  guest_claim: { converted: boolean };
  season_tier_up: { season: string; tier: number };
  mastery_up: { mode: string; tier: string };
  challenge_created: { code: string; mode: string; score: number };
  challenge_opened: { code: string; mode: string };
  challenge_attempted: { code: string; mode: string; score: number };
  challenge_beat: { code: string; mode: string; margin: number };
  signup_complete: { fromChallenge?: string; fromGuest?: boolean };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

export interface AnalyticsEvent<
  K extends AnalyticsEventName = AnalyticsEventName,
> {
  name: K;
  props: AnalyticsEventMap[K];
  /** Client wall-clock ms. */
  ts: number;
  /** Random per-page-load key so the backend can group a browsing session. */
  sessionKey: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ENDPOINT = '/api/analytics';
const STORAGE_KEY = 'fel:analytics:queue';
const FLUSH_INTERVAL_MS = 15_000;
const FLUSH_BATCH_SIZE = 20; // flush as soon as this many are queued
const MAX_QUEUE = 200; // hard cap; oldest events drop first
const MAX_BATCH_PER_REQUEST = 100; // matches the route's zod cap

// ---------------------------------------------------------------------------
// Module-singleton state (SSR-safe: everything no-ops on the server)
// ---------------------------------------------------------------------------

const isBrowser = typeof window !== 'undefined';

let queue: AnalyticsEvent[] = [];
let sessionKey = '';
let started = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;

/**
 * Tracks a typed event. Safe to call from anywhere (components, game loops,
 * effects); on the server it is a silent no-op.
 */
export function track<K extends AnalyticsEventName>(
  name: K,
  props: AnalyticsEventMap[K],
): void {
  if (!isBrowser) return;
  try {
    ensureStarted();
    queue.push({ name, props, ts: Date.now(), sessionKey });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    persist();
    if (queue.length >= FLUSH_BATCH_SIZE) void flush();
  } catch {
    // Fire-and-forget: analytics must never break the app.
  }
}

/**
 * Sends everything queued. Failures re-queue silently. Exposed for manual
 * flushes (e.g. right before a hard navigation) but normally automatic.
 */
export async function flush(): Promise<void> {
  if (!isBrowser || flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.slice(0, MAX_BATCH_PER_REQUEST);
  queue = queue.slice(batch.length);
  persist();
  try {
    const ok = await send(batch);
    if (!ok) requeue(batch);
  } catch {
    requeue(batch);
  } finally {
    flushing = false;
  }
}

/** Test/debug hook: current queue depth. */
export function pendingCount(): number {
  return queue.length;
}

/** Test hook: stops the interval so unit tests can tear down cleanly. */
export function stopAnalytics(): void {
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  started = false;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function ensureStarted(): void {
  if (started) return;
  started = true;
  sessionKey = randomKey();
  restore();

  flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);

  // Last-gasp delivery when the tab hides or unloads (sendBeacon survives
  // page teardown; the interval alone would lose the tail of a session).
  const lastGasp = () => {
    if (queue.length === 0) return;
    const batch = queue.slice(0, MAX_BATCH_PER_REQUEST);
    if (beacon(batch)) {
      queue = queue.slice(batch.length);
      persist();
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') lastGasp();
  });
  window.addEventListener('pagehide', lastGasp);
}

async function send(batch: AnalyticsEvent[]): Promise<boolean> {
  if (beacon(batch)) return true;
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: batch }),
    keepalive: true,
  });
  return res.ok;
}

function beacon(batch: AnalyticsEvent[]): boolean {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
  try {
    const blob = new Blob([JSON.stringify({ events: batch })], {
      type: 'application/json',
    });
    return navigator.sendBeacon(ENDPOINT, blob);
  } catch {
    return false;
  }
}

function requeue(batch: AnalyticsEvent[]): void {
  queue = [...batch, ...queue].slice(-MAX_QUEUE);
  persist();
}

// --- store-and-forward (harvested from OfflineCacheSystem.js) --------------

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full / private mode: keep the in-memory queue only.
  }
}

function restore(): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const restored = parsed.filter(isPlausibleEvent) as AnalyticsEvent[];
      queue = [...restored, ...queue].slice(-MAX_QUEUE);
    }
  } catch {
    // Corrupt storage: start fresh.
  }
}

function isPlausibleEvent(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { ts?: unknown }).ts === 'number'
  );
}

function randomKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
