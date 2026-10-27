// historyStore — an adult's jump history, kept ON THIS PHONE, and its CSV (JUMP-TESTS, 2026-10-25).
//
// WHY ON THE DEVICE. Today a jump reaches the server only through the jump check's landing record, for a verified adult
// who opted in (lib/privacy/landingCheckSave.ts → POST /api/mirror/assessment, gated by lib/privacy/scanSaveGate.ts);
// the slow-mo read, the approach and the drop are kept nowhere. The new tests are kept the way JUMP-PRO 2's standing
// reach (reachStore.ts) and COACH-READINESS's day history (lib/coach/readiness/deviceHistory.ts) are: one localStorage
// key, numbers only, never sent. No table, no route, no Prisma. A server home for it is an owner call (docs/JUMP-PRO.md
// §10).
//
// WHO. Adults only: the components that write here mount only on an adult's jump result, and keepJump() refuses
// anything but `adult: true` before it touches storage — a kid's or a teen's jump is never kept (the screen's rule:
// lib/screen/kid.ts shows a kid their number from page memory only). The athlete keeps each result with a tap.
//
// WHAT IS KEPT: when, which test, the best height and its ±, how many jumps counted, verified or not, whether the frames
// were picked by hand, the frame rate, and (when the test has them) RSI, contact, take-off velocity and RSI-mod. Never a
// frame, a pose, a picture, a weight or a power. Validated on the way in and out; WIPEABLE: forgetJumps().
//
// Pure apart from the storage handed in.
import { csvFileName, toCsv, type CsvValue } from '@/lib/csv/csv';
import type { ReachStorage } from './reachStore';
import { PROTOCOL_IDS, PROTOCOLS, type ProtocolId } from './protocols';

export const HISTORY_KEY = 'fel.jump.history.v1';
/** The most results kept; the oldest go first. */
export const HISTORY_MAX = 200;

// VERTICAL-EASY (2026-10-27, owner: "allow arm swing"): 'vertical' is "Measure my vertical", a natural jump with the arms
// free — its own series, never compared with the hands-on-hips 'check' (lib/vertical/series.ts).
export type HistoryTest = 'check' | 'vertical' | 'slowmo' | ProtocolId;
export const HISTORY_TESTS: readonly HistoryTest[] = ['check', 'vertical', 'slowmo', ...PROTOCOL_IDS];
export const HISTORY_TEST_NAMES: Record<HistoryTest, string> = {
  check: 'Jump check (live)', vertical: 'Vertical, with arm swing (live)', slowmo: 'Slow-motion jump',
  ...(Object.fromEntries(PROTOCOL_IDS.map((id) => [id, PROTOCOLS[id].name])) as Record<ProtocolId, string>),
};

export interface JumpHistoryEntry {
  id: string;
  /** ISO time it was kept. */
  at: string;
  test: HistoryTest;
  bestCm: number | null;
  plusMinusCm: number | null;
  /** Jumps that counted. */
  jumps: number;
  verified: boolean;
  /** The take-off and landing frames were picked by hand (never verified). */
  manualFrames: boolean;
  source: 'live' | 'video';
  fps: number;
  /** 10-5: the best five's RSI (flight ÷ contact) and mean contact (ms). */
  rsi: number | null;
  contactMs: number | null;
  /** The best jump's take-off velocity (m/s) and RSI-mod (height ÷ time to take-off), estimates (lib/jump/velocity.ts). */
  v0Mps: number | null;
  rsiMod: number | null;
}

const num = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const numOrNull = (x: unknown, lo: number, hi: number) => x === null || num(x, lo, hi);
const ID = /^[A-Za-z0-9_-]{4,40}$/;

/** A kept result, or null when anything in it is not what this file writes. */
export function cleanEntry(x: unknown): JumpHistoryEntry | null {
  const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID.test(r.id)) return null;
  if (typeof r.at !== 'string' || r.at.length > 40 || Number.isNaN(Date.parse(r.at))) return null;
  if (typeof r.test !== 'string' || !HISTORY_TESTS.includes(r.test as HistoryTest)) return null;
  if (!numOrNull(r.bestCm, 0, 150) || !numOrNull(r.plusMinusCm, 0, 50) || !num(r.jumps, 0, 50) || !num(r.fps, 0, 1000)) return null;
  if (typeof r.verified !== 'boolean' || typeof r.manualFrames !== 'boolean' || (r.source !== 'live' && r.source !== 'video')) return null;
  const opt = (k: string, lo: number, hi: number) => (r[k] === undefined || numOrNull(r[k], lo, hi));
  if (!opt('rsi', 0, 10) || !opt('contactMs', 0, 2000) || !opt('v0Mps', 0, 10) || !opt('rsiMod', 0, 5)) return null;
  const n = (k: string) => (typeof r[k] === 'number' ? (r[k] as number) : null);
  return {
    id: r.id, at: r.at, test: r.test as HistoryTest, bestCm: n('bestCm'), plusMinusCm: n('plusMinusCm'), jumps: r.jumps as number,
    verified: r.verified, manualFrames: r.manualFrames, source: r.source, fps: r.fps as number,
    rsi: n('rsi'), contactMs: n('contactMs'), v0Mps: n('v0Mps'), rsiMod: n('rsiMod'),
  };
}

/** The phone's kept results, newest first. Empty when there are none or storage cannot be read. */
export function loadJumps(storage: ReachStorage | null): JumpHistoryEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(HISTORY_KEY);
    if (!raw || raw.length > 200_000) return [];
    const p = JSON.parse(raw) as unknown;
    return (Array.isArray(p) ? p : []).map(cleanEntry).filter((e): e is JumpHistoryEntry => !!e).sort((a, b) => (a.at < b.at ? 1 : -1));
  } catch {
    return [];
  }
}

/** A fresh id for a kept result. */
export function historyId(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 16; i++) s += Math.floor(rand() * 36).toString(36);
  return `jump-${s}`;
}

/**
 * Keep one result on this phone. Refused (false, nothing touched) unless `adult` is exactly true, the entry is what this
 * file writes, and the phone keeps it. An id already kept is not kept twice.
 */
export function keepJump(storage: ReachStorage | null, e: JumpHistoryEntry, who: { adult: boolean }): boolean {
  if (who.adult !== true || !storage) return false;
  const clean = cleanEntry(e);
  if (!clean) return false;
  const all = loadJumps(storage);
  if (all.some((x) => x.id === clean.id)) return false;
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify([clean, ...all].slice(0, HISTORY_MAX)));
    return true;
  } catch {
    return false;
  }
}

/** Forget every kept result on this phone. */
export function forgetJumps(storage: ReachStorage | null): void {
  try { storage?.removeItem(HISTORY_KEY); } catch { /* nothing kept to forget */ }
}

// ── the CSV ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const HISTORY_CSV_HEADER = [
  'Date (UTC)', 'Time (UTC)', 'Test', 'Best (cm)', 'Best (in)', '± (cm, 95%)', 'Jumps counted', 'Verified', 'Manual frames',
  'Source', 'Frame rate (fps)', 'RSI best 5 (flight/contact)', 'Contact best 5 (ms)', 'Take-off velocity (m/s, estimate)', 'RSI-mod (estimate)',
] as const;

const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

/** The athlete's own history as CSV, oldest first (the way a spreadsheet reads a log). */
export function jumpHistoryCsv(entries: readonly JumpHistoryEntry[]): string {
  const rows: CsvValue[][] = [...entries].sort((a, b) => (a.at < b.at ? -1 : 1)).map((e) => [
    e.at.slice(0, 10), e.at.slice(11, 19), HISTORY_TEST_NAMES[e.test], r1(e.bestCm), e.bestCm === null ? null : r1(e.bestCm / 2.54),
    r1(e.plusMinusCm), e.jumps, e.verified, e.manualFrames, e.source, Math.round(e.fps), e.rsi, e.contactMs, e.v0Mps, e.rsiMod,
  ]);
  return toCsv(HISTORY_CSV_HEADER, rows);
}

export const historyFileName = (at: Date = new Date()) => csvFileName('my-jumps', at);
