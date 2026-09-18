/**
 * lib/wallet/validation.ts — PURE anti-cheat / payload validation (§7 floor).
 *
 * The client is untrusted. It reports WHAT HAPPENED; the server decides whether
 * that is physically possible before any currency is computed. No DB, no network.
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Dunk move table — the ONLY legal trick ids and the rules for a legal chain.
// ---------------------------------------------------------------------------
export const TAKEOFFS: ReadonlySet<string> = new Set(['takeoff_a', 'takeoff_b']);
export const MIDS: ReadonlySet<string> = new Set([
  'spin_180', 'spin_360', 'spin_720', 'double_clutch', 'between_legs', 'reverse',
]);
export const FINISHES: ReadonlySet<string> = new Set([
  'finish_windmill', 'finish_tomahawk', 'finish_dunk', 'finish_360',
]);

export function isKnownTrick(id: string): boolean {
  return TAKEOFFS.has(id) || MIDS.has(id) || FINISHES.has(id);
}

// Per-segment score ceilings (generous — anti-cheat targets absurd values, not
// skilled play). // TUNE(elijah)
export const TAKEOFF_MAX = 40;
export const MID_MAX = 40;
export const FINISH_MAX = 80;

// Duration sanity bounds for a single scored attempt. // TUNE(elijah)
export const DURATION_FLOOR_MS = 400;
export const DURATION_CEIL_MS = 15_000;

export interface ChainCheck { legal: boolean; reason?: string }

/** A legal chain: takeoff, optional mids, finish; 2..5 tricks; no known-id gaps. */
export function validateChain(chain: unknown): ChainCheck {
  if (!Array.isArray(chain)) return { legal: false, reason: 'chain_not_array' };
  if (chain.length < 2 || chain.length > 5) return { legal: false, reason: 'chain_length' };
  for (const id of chain) {
    if (typeof id !== 'string' || !isKnownTrick(id)) return { legal: false, reason: `unknown_trick:${id}` };
  }
  if (!TAKEOFFS.has(chain[0])) return { legal: false, reason: 'no_takeoff_first' };
  if (!FINISHES.has(chain[chain.length - 1])) return { legal: false, reason: 'no_finish_last' };
  for (let i = 1; i < chain.length - 1; i++) {
    if (!MIDS.has(chain[i])) return { legal: false, reason: `bad_mid:${chain[i]}` };
  }
  return { legal: true };
}

/** Theoretical maximum score for a legal chain. */
export function chainScoreCeiling(chain: string[]): number {
  const mids = Math.max(0, chain.length - 2);
  return TAKEOFF_MAX + MID_MAX * mids + FINISH_MAX;
}

export interface EarnValidation { ok: boolean; reason?: string }

/**
 * Full validation for a `dunk_attempt_scored` payload. Milestone events
 * (contest placed, streak, first clear) carry no score/chain and skip this.
 */
export function validateDunkAttempt(payload: Record<string, unknown>): EarnValidation {
  const dur = Number(payload?.duration_ms);
  if (!Number.isFinite(dur) || dur < DURATION_FLOOR_MS || dur > DURATION_CEIL_MS) {
    return { ok: false, reason: 'duration_out_of_range' };
  }
  const chainCheck = validateChain(payload?.trick_chain);
  if (!chainCheck.legal) return { ok: false, reason: chainCheck.reason };
  const score = Number(payload?.score);
  if (!Number.isFinite(score) || score < 0) return { ok: false, reason: 'score_invalid' };
  const ceiling = chainScoreCeiling(payload!.trick_chain as string[]);
  if (score > ceiling) return { ok: false, reason: 'score_above_ceiling' };
  return { ok: true };
}

/** Stable hash of a payload for replay detection (key order independent). */
export function payloadHash(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as any)[k])}`).join(',')}}`;
}
