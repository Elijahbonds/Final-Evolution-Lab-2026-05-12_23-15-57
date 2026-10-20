/**
 * lib/feel-panel/feel.ts — THE FEEL KNOB READ (feel-panel lane, owner 2026-10-20).
 *
 *   feel('hoops.aiHandRangeM', AI_HAND_RANGE_M)
 *
 * returns the default (the shipped constant) for everyone. It returns an override only when ALL of these hold:
 *   1. this device holds one (localStorage, FEEL_STORAGE_KEY — never sent anywhere);
 *   2. the server said the panel is open for this user (GET /api/feel-panel: the FEEL_PANEL_ENABLED flag AND the user on
 *      FEEL_PANEL_USERS or an admin);
 *   3. this page is a run where overrides may apply (sessionGate.feelSessionBlock: an unpaid playtest, no staked/ranked/
 *      head-to-head/online/party session).
 * Every one of them starts CLOSED, so a module that reads a knob before the panel has mounted — or on the server, or in a test, or
 * on a page with no panel — reads the default.
 *
 * PER FRAME: `feel()` is one null check, or one Map.get on a string key. No allocation, no localStorage read: storage is read once,
 * when the server opens the panel for this user, and written only when the owner moves a slider. The applied map is rebuilt only
 * when one of the three conditions or a value changes.
 */
import { FEEL_KNOBS, FEEL_KNOB_BY_ID, clampKnob } from './knobs';
import type { FeelBlock } from './sessionGate';

export const FEEL_STORAGE_KEY = 'fel.feel.overrides.v1';

let userAllowed = false;
let block: FeelBlock | null = 'UNKNOWN';
/** The overrides this device holds, validated and clamped. Read from storage once, when the user is allowed. */
let stored = new Map<string, number>();
let loaded = false;
/** THE ONLY THING feel() READS: null unless all three conditions hold and there is at least one override. */
let applied: Map<string, number> | null = null;
/** Overrides were applied at some point on this page (latched until reload): the challenge-link mint stays closed. */
let usedThisPage = false;

export function feel(id: string, def: number): number {
  if (applied === null) return def;
  const v = applied.get(id);
  return v === undefined ? def : v;
}

// ── state for the panel (useSyncExternalStore) ──────────────────────────────────────────────────────────────────────────
export interface FeelState {
  /** The server opened the panel for this user. */
  userAllowed: boolean;
  /** Why overrides are held back on this page, or null. */
  block: FeelBlock | null;
  /** Overrides are being applied right now. */
  active: boolean;
  /** This device's overrides (id → value), applied or not. */
  values: Readonly<Record<string, number>>;
  /** Overrides were applied at some point on this page. */
  usedThisPage: boolean;
}

const listeners = new Set<() => void>();
const CLOSED: FeelState = Object.freeze({ userAllowed: false, block: 'UNKNOWN', active: false, values: Object.freeze({}), usedThisPage: false });
let snapshot: FeelState = CLOSED;

function recompute(): void {
  applied = userAllowed && block === null && stored.size > 0 ? new Map(stored) : null;
  if (applied) usedThisPage = true;
  snapshot = Object.freeze({
    userAllowed, block, active: applied !== null, values: Object.freeze(Object.fromEntries(stored)), usedThisPage,
  });
  for (const l of listeners) l();
}

export function getFeelState(): FeelState { return snapshot; }
/** The server render's snapshot: always closed. */
export function getServerFeelState(): FeelState { return CLOSED; }
export function subscribeFeel(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ── storage (try/catch everywhere: private windows, blocked storage, previews) ──────────────────────────────────────────
/** Parse a stored value: unknown ids, non-numbers and junk dropped; numbers clamped into the knob's safe bounds. */
export function parseFeelOverrides(raw: string | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!raw) return out;
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return out; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [id, v] of Object.entries(obj as Record<string, unknown>)) {
    const k = FEEL_KNOB_BY_ID.get(id);
    if (!k) continue;
    const c = clampKnob(k, v);
    if (c !== null && c !== k.def) out.set(id, c);
  }
  return out;
}

function storage(): Storage | null {
  try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch { return null; }
}

function load(): void {
  if (loaded) return;
  loaded = true;
  let raw: string | null = null;
  try { raw = storage()?.getItem(FEEL_STORAGE_KEY) ?? null; } catch { raw = null; }
  stored = parseFeelOverrides(raw);
}

function save(): void {
  try {
    const s = storage();
    if (!s) return;
    if (stored.size === 0) s.removeItem(FEEL_STORAGE_KEY);
    else s.setItem(FEEL_STORAGE_KEY, JSON.stringify(Object.fromEntries(stored)));
  } catch { /* the value still holds for this page */ }
}

// ── the three conditions ────────────────────────────────────────────────────────────────────────────────────────────────
/** The server's answer (GET /api/feel-panel). Storage is read the first time this is true — never for anyone else. */
export function setFeelUser(allowed: boolean): void {
  if (allowed === userAllowed) return;
  userAllowed = allowed;
  if (allowed) load();
  recompute();
}

/** Where we are (sessionGate.feelSessionBlock). Called by the panel on every route or query change, and with 'UNKNOWN' on unmount. */
export function setFeelSession(b: FeelBlock | null): void {
  if (b === block) return;
  block = b;
  recompute();
}

// ── the panel's edits (only once the user is allowed) ───────────────────────────────────────────────────────────────────
/** Set one knob on this device. Clamped and stepped; a value equal to the default removes the override. Returns the stored value. */
export function setFeelOverride(id: string, value: number): number | null {
  const k = FEEL_KNOB_BY_ID.get(id);
  if (!k || !userAllowed) return null;
  const c = clampKnob(k, value);
  if (c === null) return null;
  if (c === k.def) stored.delete(id); else stored.set(id, c);
  save();
  recompute();
  return c;
}

export function resetFeelOverride(id: string): void {
  if (!userAllowed || !stored.delete(id)) return;
  save();
  recompute();
}

export function resetAllFeelOverrides(): void {
  if (!userAllowed || stored.size === 0) return;
  stored = new Map();
  save();
  recompute();
}

/** What "copy values" puts on the clipboard: this device's overrides as JSON, id → value, in catalogue order. */
export function feelValuesJson(): string {
  const o: Record<string, number> = {};
  for (const k of FEEL_KNOBS) { const v = stored.get(k.id); if (v !== undefined) o[k.id] = v; }
  return JSON.stringify(o, null, 2);
}

/** True once overrides have been applied on this page. GameShell's challenge-link mint reads it: such a score is not shared. */
export function feelOverridesUsed(): boolean { return usedThisPage; }

/** Tests only: back to the closed start, as a fresh page. */
export function resetFeelForTests(): void {
  userAllowed = false; block = 'UNKNOWN'; stored = new Map(); loaded = false; applied = null; usedThisPage = false;
  snapshot = CLOSED; listeners.clear();
}
