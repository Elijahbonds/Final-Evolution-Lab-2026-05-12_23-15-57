// DEVICE RECORDS — the personal best, the win run and "played today", kept on this device.
//
// The server sends none of these: app/api/sessions answers with the run's payout, the PRQ and the season, but not the
// player's best in the mode or how many they have won in a row. So the card computes them HERE, from the runs this device
// has finished, and says so in the copy ("on this device"). It is presentation: nothing here is posted, paid or ranked.
//
// What counts as a record run: a run the server ACCEPTED as play — not a NO PLAY, not a refused or unpaid result, not an
// Arena score the Arena refused. Anything else still marks the mode played today (the recommendation reads that) but
// never sets a best or extends a win run, so a refused 99,999 can never sit on the card as a record.
//
// Higher is better, in every mode: the score the shell posts is the one the challenge links rank on
// (lib/social/challenge-link-core.ts: beat = attemptScore > payload.score), so the card ranks on it the same way.

export const RECORDS_KEY = 'fel-end-records-v1';

export interface ModeRecord {
  /** Best accepted score in this mode on this device. */
  best: number;
  /** Accepted runs in this mode on this device. */
  runs: number;
  /** Wins in a row in this mode (accepted runs only). */
  winRun: number;
  /** Local day (YYYY-MM-DD) this mode was last finished on, accepted or not. */
  lastDay?: string;
}

export interface DeviceRecords {
  v: 1;
  modes: Record<string, ModeRecord>;
  /** Local day the weekly Signature was last played from this device. */
  signatureDay?: string;
}

export interface RunCallouts {
  /** This run beat a best this device already held. */
  newBest: boolean;
  /** The first accepted run in this mode on this device (a best, but not a beaten one). */
  firstRun: boolean;
  /** The best before this run (null on a first run). */
  previousBest: number | null;
  /** The best after this run. */
  best: number;
  /** Wins in a row after this run (0 after a loss). */
  winRun: number;
  /** How far under the best a non-record run finished (null when it is a record or there is no best). */
  shortBy: number | null;
}

export const EMPTY_RECORDS: DeviceRecords = { v: 1, modes: {} };

/** Local calendar day, YYYY-MM-DD. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseRecords(raw: string | null | undefined): DeviceRecords {
  if (!raw) return { v: 1, modes: {} };
  try {
    const j = JSON.parse(raw);
    if (!j || j.v !== 1 || typeof j.modes !== 'object' || j.modes === null) return { v: 1, modes: {} };
    const modes: Record<string, ModeRecord> = {};
    for (const [k, r] of Object.entries(j.modes as Record<string, Partial<ModeRecord>>)) {
      if (!r || typeof r !== 'object') continue;
      const best = Number(r.best), runs = Number(r.runs), winRun = Number(r.winRun);
      modes[k] = {
        best: Number.isFinite(best) ? best : 0,
        runs: Number.isFinite(runs) && runs >= 0 ? Math.floor(runs) : 0,
        winRun: Number.isFinite(winRun) && winRun >= 0 ? Math.floor(winRun) : 0,
        ...(typeof r.lastDay === 'string' ? { lastDay: r.lastDay } : {}),
      };
    }
    return { v: 1, modes, ...(typeof j.signatureDay === 'string' ? { signatureDay: j.signatureDay } : {}) };
  } catch {
    return { v: 1, modes: {} };
  }
}

export interface RunInput {
  mode: string;
  score: number;
  won: boolean;
  /** The server accepted this run as play (see the header). */
  accepted: boolean;
  signatureRun?: boolean;
  nowMs: number;
}

/** PURE: the records after this run, and what the card may say about it. */
export function applyRun(prev: DeviceRecords, run: RunInput): { next: DeviceRecords; callouts: RunCallouts | null } {
  const day = localDay(run.nowMs);
  const had = prev.modes[run.mode];
  const base: ModeRecord = had ? { ...had } : { best: 0, runs: 0, winRun: 0 };
  base.lastDay = day;
  const next: DeviceRecords = { v: 1, modes: { ...prev.modes, [run.mode]: base }, ...(prev.signatureDay ? { signatureDay: prev.signatureDay } : {}) };
  if (run.signatureRun) next.signatureDay = day;
  if (!run.accepted || !Number.isFinite(run.score)) return { next, callouts: null };

  const score = run.score;
  const firstRun = !had || had.runs === 0;
  const previousBest = firstRun ? null : had!.best;
  const newBest = previousBest !== null && score > previousBest;
  base.best = firstRun ? score : Math.max(had!.best, score);
  base.runs = (had?.runs ?? 0) + 1;
  base.winRun = run.won ? (had?.winRun ?? 0) + 1 : 0;
  return {
    next,
    callouts: {
      newBest,
      firstRun,
      previousBest,
      best: base.best,
      winRun: base.winRun,
      shortBy: !newBest && previousBest !== null && score < previousBest ? previousBest - score : null,
    },
  };
}

/** Which modes this device finished today (the recommendation skips them). */
export function playedOn(records: DeviceRecords, day: string): Set<string> {
  const out = new Set<string>();
  for (const [k, r] of Object.entries(records.modes)) if (r.lastDay === day) out.add(k);
  return out;
}

export interface RecordStore {
  load(): DeviceRecords;
  save(r: DeviceRecords): void;
}

/** An in-memory store (tests, the dev fixture). */
export function memoryStore(initial: DeviceRecords = { v: 1, modes: {} }): RecordStore & { current: DeviceRecords } {
  const s = { current: initial, load: () => s.current, save: (r: DeviceRecords) => { s.current = r; } };
  return s;
}

// ── storage (every read and write wrapped: a private window, blocked storage or SSR just means no records) ──

export function loadRecords(): DeviceRecords {
  try {
    if (typeof window === 'undefined') return { v: 1, modes: {} };
    return parseRecords(window.localStorage?.getItem(RECORDS_KEY));
  } catch {
    return { v: 1, modes: {} };
  }
}

export function saveRecords(r: DeviceRecords): void {
  try {
    if (typeof window !== 'undefined') window.localStorage?.setItem(RECORDS_KEY, JSON.stringify(r));
  } catch { /* storage blocked: the card still showed this run's callouts */ }
}

export const browserStore: RecordStore = { load: loadRecords, save: saveRecords };
