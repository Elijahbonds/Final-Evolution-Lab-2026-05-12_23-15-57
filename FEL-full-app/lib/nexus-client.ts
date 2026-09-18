/**
 * NEXUS Gateway client — server-side only.
 *
 * Talks to the NEXUS platform backend (`/nexus/v1/*`) when enabled.
 * The gateway URL and feature flag are read from environment variables:
 *   - NEXUS_GATEWAY_URL  (e.g. "https://nexus.finalevolutionlab.com")
 *   - NEXT_PUBLIC_NEXUS_ENABLED  ("1" to enable)
 *
 * All functions are safe to call even when NEXUS is disabled — they
 * return null / no-op gracefully so callers don't need conditionals.
 */

// ── Feature flag ────────────────────────────────────────────────────
export function isNexusEnabled(): boolean {
  return process.env.NEXT_PUBLIC_NEXUS_ENABLED === '1' && !!process.env.NEXUS_GATEWAY_URL;
}

function gatewayUrl(path: string): string {
  const base = (process.env.NEXUS_GATEWAY_URL ?? '').replace(/\/+$/, '');
  return `${base}${path}`;
}

async function gw(path: string, init?: RequestInit): Promise<any | null> {
  if (!isNexusEnabled()) return null;
  try {
    const res = await fetch(gatewayUrl(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      console.warn(`[nexus-gw] ${path} → ${res.status}`);
      return null;
    }
    return res.json();
  } catch (e) {
    console.warn(`[nexus-gw] ${path} error`, e);
    return null;
  }
}

// ── Types ───────────────────────────────────────────────────────────

/** A single recommended lesson / drill from the sequencer. */
export interface NexusQueueItem {
  /** Unique item id (e.g. "dunk-fundamentals/m1/l2") */
  id: string;
  /** Display title */
  title: string;
  /** Why the sequencer picked this (e.g. "Weak vertical power") */
  reason: string;
  /** Game mode to launch (matches MODE_INFO keys) */
  mode: string;
  /** Target score to pass */
  targetScore?: number;
  /** Estimated difficulty 1-5 */
  difficulty?: number;
  /** Ordering priority (lower = do first) */
  priority: number;
}

export interface NexusQueue {
  items: NexusQueueItem[];
  /** When the queue was computed (ISO string) */
  computedAt: string;
  /** PRQ snapshot used to compute it */
  prqSnapshot?: Record<string, number>;
}

export interface NexusSessionResult {
  /** Whether mastery was updated */
  masteryUpdated: boolean;
  /** New mastery level for the mode (0-1) */
  mastery?: number;
  /** Items removed from queue because player demonstrated mastery */
  resolvedItems?: string[];
  /** New items added to queue based on updated state */
  newItems?: NexusQueueItem[];
}

// ── API calls ───────────────────────────────────────────────────────

/**
 * GET /nexus/v1/queue?userId=...
 * Returns the adaptive lesson queue for the player.
 */
export async function fetchQueue(userId: string): Promise<NexusQueue | null> {
  return gw(`/nexus/v1/queue?userId=${encodeURIComponent(userId)}`);
}

/**
 * POST /nexus/v1/session-result
 * Reports a completed game session to the sequencer so it can update mastery.
 */
export async function reportSessionResult(payload: {
  userId: string;
  sessionId: string;
  mode: string;
  score: number;
  won: boolean;
  duration: number;
  prqAfter: number;
}): Promise<NexusSessionResult | null> {
  return gw('/nexus/v1/session-result', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
