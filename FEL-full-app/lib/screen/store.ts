// store — where a Quick Screen's result lives: THIS TAB'S sessionStorage, and nowhere else (SCREEN-SHIP A4-6).
//
//   · NOTHING IS SENT. No server save in this ship (A2-3): no fetch, no POST, no analytics; results stay on the phone.
//   · sessionStorage ONLY. Never localStorage, IndexedDB or a cookie. Every key starts SCREEN_PREFIX, so "Done, clear
//     my results" can remove every one of them.
//   · THE CONSENT GATE COMES FIRST. Nothing is written before the age question is answered; for under 18 or an age not
//     given, nothing is written before a parent's consent (the gate record says which). write() refuses otherwise, and
//     read() refuses a result whose gate record does not allow it, so a crafted key cannot skip consent either.
//   · A NEW SCREEN WIPES THE OLD ONE FIRST (shared event phones): clear() before anything new is shown or written.
//
// The consent record holds EXACTLY the age band, the parent checkbox, a timestamp and the consent text version (gate
// 5). It stays on the phone: the GuardianConsent model needs a signed-in mentee, a guardian's name and email and an
// emailed token, so it cannot hold just these four without a schema change (none in this ship).
//
// The storage is injected (a tab's window.sessionStorage in the page, a map in tests). Pure otherwise.
import { CONSENT_TEXT_VERSION } from './copy';
import { SUMMARY_VERSION, type ScreenSummary } from './checks';
import { GRADED_CHECKS, THRESHOLDS_VERSION, type BandWord } from './PROPOSED-thresholds';
import { isLaneSlug } from './PROPOSED-program-lanes';

export const SCREEN_PREFIX = 'fel.screen.';
export const KEYS = {
  gate: `${SCREEN_PREFIX}gate`,
  takeoff: `${SCREEN_PREFIX}takeoffLeg`,
  summary: `${SCREEN_PREFIX}summary`,
} as const;
/** PR #20's old localStorage keys (a preview build wrote them): removed on clear, never written again. */
export const LEGACY_LOCAL_KEYS = ['fel.assess.takeoffLeg', 'fel.assess.voice'] as const;

export type AgeBand = '18+' | 'under-18' | 'unknown';

/** The consent record: these four fields and nothing else. */
export interface GateRecord {
  ageBand: AgeBand;
  parentCheckbox: boolean;
  at: string;
  textVersion: string;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export const needsParent = (age: AgeBand): boolean => age !== '18+';

/** An adult, or a parent who ticked the box: then (and only then) the screen may keep anything, in this tab. */
export function mayPersist(g: GateRecord | null | undefined): boolean {
  if (!g) return false;
  if (g.ageBand === '18+') return true;
  return g.parentCheckbox === true && g.textVersion === CONSENT_TEXT_VERSION;
}

export function gateRecord(ageBand: AgeBand, parentCheckbox: boolean, now: Date = new Date()): GateRecord {
  return { ageBand, parentCheckbox, at: now.toISOString(), textVersion: CONSENT_TEXT_VERSION };
}

const isAge = (x: unknown): x is AgeBand => x === '18+' || x === 'under-18' || x === 'unknown';
const isBand = (x: unknown): x is BandWord | null => x === null || x === 'green' || x === 'yellow' || x === 'red';

function parseGate(raw: string | null): GateRecord | null {
  try {
    const o = JSON.parse(raw ?? 'null') as Record<string, unknown> | null;
    if (!o || typeof o !== 'object') return null;
    if (Object.keys(o).sort().join() !== 'ageBand,at,parentCheckbox,textVersion') return null;
    if (!isAge(o.ageBand) || typeof o.parentCheckbox !== 'boolean' || typeof o.at !== 'string' || typeof o.textVersion !== 'string') return null;
    return { ageBand: o.ageBand, parentCheckbox: o.parentCheckbox, at: o.at, textVersion: o.textVersion };
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

/** Keep the gate record and the result, after consent. Returns whether it wrote (false: refused, or no storage). */
export function writeResult(s: StorageLike | null, gate: GateRecord | null, summary: ScreenSummary): boolean {
  if (!s || !mayPersist(gate)) return false;
  try {
    s.setItem(KEYS.gate, JSON.stringify(gate));
    s.setItem(KEYS.summary, JSON.stringify(summary));
    return true;
  } catch { return false; }
}

/** The takeoff leg, asked once per screen: kept only after consent. */
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

/** Every screen key in this tab (and PR #20's old localStorage keys), gone, and the page's memory of them. */
export function clearScreen(s: StorageLike | null, local?: Pick<Storage, 'removeItem'> | null): void {
  memory = null;
  try {
    if (s) {
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(SCREEN_PREFIX)) keys.push(k); }
      for (const k of keys) s.removeItem(k);
    }
  } catch { /* no storage: nothing to clear */ }
  try { for (const k of LEGACY_LOCAL_KEYS) local?.removeItem(k); } catch { /* none */ }
}

/** The page's tab storage (null where the browser refuses it). */
export function tabStorage(): StorageLike | null {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}
export function localForClear(): Pick<Storage, 'removeItem'> | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}
