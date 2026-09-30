// store — where a Quick Screen's result lives: THIS TAB'S sessionStorage, and nowhere else (SCREEN-SHIP A4-6).
//
//   · NOTHING IS SENT. No server save in this ship (A2-3): no fetch, no POST, no analytics; results stay on the device.
//   · sessionStorage ONLY. Never localStorage, IndexedDB or a cookie. Every key starts SCREEN_PREFIX, so "Done, clear
//     my results" can remove every one of them.
//   · THE AGE ANSWER IS THE ONE KEY WRITTEN BEFORE A RESULT (SCREEN-FIX Cyber 2). lockAge() writes the band once, the
//     moment it is answered, and it is then read back for the rest of the tab (lib/screen/age.ts): the question is not
//     asked again, and a second answer cannot change it. Clearing keeps it; closing the tab ends it.
//   · UNDER 18 KEEP THE AGE ANSWER AND NOTHING ELSE (SCREEN-FIX-2; FE PM + Research, 2026-09-29 11:50 AM PT). Under
//     13, 13–17 and "rather not say" (age.ts isKid) never have a result, takeoff leg or gate record written, grown-up
//     ticked or not: their number lives in the page's memory only (assess-app.tsx). Only 18 or older keep a result in
//     this tab. write() refuses otherwise, and read() refuses a result whose gate record is not an adult's, so a crafted
//     key cannot keep a kid's result either.
//   · A NEW SCREEN WIPES THE OLD ONE FIRST (shared event devices): clear() before anything new is shown or written.
//
// The gate record holds EXACTLY the age band, the grown-up checkbox, a timestamp and the step's text version (gate
// 5). It stays on the device: nothing in this ship keeps it anywhere else.
//
// The storage is injected (a tab's window.sessionStorage in the page, a map in tests). Pure otherwise.
import { GROWN_UP_TEXT_VERSION } from './copy';
import { isAgeBand, isKid, type AgeBand } from './age';
import { SUMMARY_VERSION, type ScreenSummary } from './checks';
import { GRADED_CHECKS, THRESHOLDS_VERSION, type BandWord } from './PROPOSED-thresholds';
import { isLaneSlug } from './PROPOSED-program-lanes';

export type { AgeBand } from './age';

export const SCREEN_PREFIX = 'fel.screen.';
export const KEYS = {
  age: `${SCREEN_PREFIX}age`,
  gate: `${SCREEN_PREFIX}gate`,
  takeoff: `${SCREEN_PREFIX}takeoffLeg`,
  summary: `${SCREEN_PREFIX}summary`,
} as const;
/** PR #20's old localStorage keys (a preview build wrote them): removed on clear, never written again. */
export const LEGACY_LOCAL_KEYS = ['fel.assess.takeoffLeg', 'fel.assess.voice'] as const;

/** The gate record: these four fields and nothing else. */
export interface GateRecord {
  ageBand: AgeBand;
  grownUp: boolean;
  at: string;
  textVersion: string;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/**
 * 18 or older: then (and only then) the screen may keep a result, in this tab. CHANGED (SCREEN-FIX-2): an athlete under
 * 18 with a grown-up ticked kept one too; now nothing but the age answer is kept for them.
 */
export function mayPersist(g: GateRecord | null | undefined): boolean {
  return !!g && !isKid(g.ageBand);
}

export function gateRecord(ageBand: AgeBand, grownUp: boolean, now: Date = new Date()): GateRecord {
  return { ageBand, grownUp, at: now.toISOString(), textVersion: GROWN_UP_TEXT_VERSION };
}

const isBand = (x: unknown): x is BandWord | null => x === null || x === 'green' || x === 'yellow' || x === 'red';

function parseGate(raw: string | null): GateRecord | null {
  try {
    const o = JSON.parse(raw ?? 'null') as Record<string, unknown> | null;
    if (!o || typeof o !== 'object') return null;
    if (Object.keys(o).sort().join() !== 'ageBand,at,grownUp,textVersion') return null;
    if (!isAgeBand(o.ageBand) || typeof o.grownUp !== 'boolean' || typeof o.at !== 'string' || typeof o.textVersion !== 'string') return null;
    return { ageBand: o.ageBand, grownUp: o.grownUp, at: o.at, textVersion: o.textVersion };
  } catch { return null; }
}

const GRADED_IDS = new Set(GRADED_CHECKS.map((c) => c.id as string));

function parseSummary(raw: string | null): ScreenSummary | null {
  try {
    const o = JSON.parse(raw ?? 'null') as ScreenSummary | null;
    if (!o || typeof o !== 'object' || o.v !== SUMMARY_VERSION || o.thresholdsVersion !== THRESHOLDS_VERSION) return null;
    if (!Array.isArray(o.checks) || !o.checks.every((c) => c && GRADED_IDS.has(c.id) && isBand(c.band)
      && (c.sides === undefined || (isBand(c.sides.left) && isBand(c.sides.right))))) return null;
    if (!Array.isArray(o.priorities) || !o.priorities.every((p) => GRADED_IDS.has(p))) return null;
    if (o.lane !== null && !isLaneSlug(o.lane)) return null;
    if (o.topFlag !== null && !GRADED_IDS.has(o.topFlag)) return null;
    if (typeof o.complete !== 'boolean' || typeof o.clean !== 'boolean') return null;
    if (o.jumpBestIn !== null && !(typeof o.jumpBestIn === 'number' && Number.isFinite(o.jumpBestIn))) return null;
    return o;
  } catch { return null; }
}

// ── the age lock (Cyber 2) ──

// The page's memory of the answer, for a browser that refuses sessionStorage: the lock still holds for this page's life.
let ageMemory: AgeBand | null = null;

/** This tab's age answer, or null when it has not been given. */
export function readAge(s: StorageLike | null): AgeBand | null {
  try {
    const v = s?.getItem(KEYS.age) ?? null;
    if (isAgeBand(v)) return v;
  } catch { /* no storage: the page's memory below */ }
  return ageMemory;
}

/**
 * Lock this tab's age answer and return the band that holds: the first answer is written and kept; any later answer
 * is refused and the first one comes back. This is the one key written before a result.
 */
export function lockAge(s: StorageLike | null, band: AgeBand): AgeBand {
  const had = readAge(s);
  if (had) return had;
  ageMemory = band;
  try { s?.setItem(KEYS.age, band); } catch { /* refused: the page's memory holds it */ }
  return band;
}

/** Tests only: a new tab (a fresh page's memory). */
export function forgetAgeForTests(): void { ageMemory = null; }

// ── the result ──

/**
 * The end of a screen: an adult's result is kept (this page's memory and this tab's sessionStorage) and 'adult' comes
 * back; anyone else keeps nothing and gets 'kid' (their number is the page's to show: assess-app.tsx).
 */
export function keepResult(s: StorageLike | null, gate: GateRecord | null, summary: ScreenSummary): 'adult' | 'kid' {
  if (!mayPersist(gate)) return 'kid';
  remember(gate, summary);
  writeResult(s, gate, summary);
  return 'adult';
}

/** Keep an adult's gate record and result (refused for anyone under 18). Returns whether it wrote (false: refused, or no storage). */
export function writeResult(s: StorageLike | null, gate: GateRecord | null, summary: ScreenSummary): boolean {
  if (!s || !mayPersist(gate)) return false;
  try {
    s.setItem(KEYS.gate, JSON.stringify(gate));
    s.setItem(KEYS.summary, JSON.stringify(summary));
    return true;
  } catch { return false; }
}

/** The takeoff leg, asked once per screen: kept for 18 or older only (a kid's lives in the runner, in memory). */
export function writeTakeoff(s: StorageLike | null, gate: GateRecord | null, side: 'left' | 'right'): boolean {
  if (!s || !mayPersist(gate)) return false;
  try { s.setItem(KEYS.takeoff, side); return true; } catch { return false; }
}

/** This tab's result, or null: nothing kept, a bad or old key, or a gate record that does not allow keeping it. */
export function readResult(s: StorageLike | null): { gate: GateRecord; summary: ScreenSummary } | null {
  if (!s) return null;
  try {
    const gate = parseGate(s.getItem(KEYS.gate));
    if (!mayPersist(gate)) return null;
    const summary = parseSummary(s.getItem(KEYS.summary));
    return summary ? { gate: gate!, summary } : null;
  } catch { return null; }
}

// The page's memory of the last result (this JS context only): a client-side move to the lane page and back reads it
// first, so a browser that refuses sessionStorage still gets its cards back. Held under the same gate.
let memory: { gate: GateRecord; summary: ScreenSummary } | null = null;
export function remember(gate: GateRecord | null, summary: ScreenSummary): void {
  memory = gate && mayPersist(gate) ? { gate, summary } : null;
}
/** The result this tab holds: in memory first, then its sessionStorage. */
export function recall(s: StorageLike | null): { gate: GateRecord; summary: ScreenSummary } | null {
  return memory ?? readResult(s);
}

/**
 * Every screen key in this tab (and PR #20's old localStorage keys), gone, and the page's memory of them: all but the
 * age answer, which stays locked until the tab closes (clearing is not a way to answer again).
 */
export function clearScreen(s: StorageLike | null, local?: Pick<Storage, 'getItem' | 'removeItem'> | null): void {
  memory = null;
  try {
    if (s) {
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(SCREEN_PREFIX) && k !== KEYS.age) keys.push(k); }
      for (const k of keys) s.removeItem(k);
    }
  } catch { /* no storage: nothing to clear */ }
  // only a key that is there is removed: a clean device sees no localStorage call at all (SCREEN-FIX-2)
  try { for (const k of LEGACY_LOCAL_KEYS) if (local && local.getItem(k) !== null) local.removeItem(k); } catch { /* none */ }
}

/** The page's tab storage (null where the browser refuses it). */
export function tabStorage(): StorageLike | null {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}
export function localForClear(): Pick<Storage, 'getItem' | 'removeItem'> | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}
