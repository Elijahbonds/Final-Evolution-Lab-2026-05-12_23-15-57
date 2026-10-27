// store — the camera sprint results, kept ON THIS PHONE, numbers only (SPRINT-SPEED, 2026-10-25), and their CSV (lib/csv).
//
// WHY ON THE DEVICE. The brief: "numbers only, reusing how jump numbers are saved (lib/privacy/scanSaveGate.ts) and the
// youth rules; prefer no new table". The server path that exists for movement numbers is the AB-04 save: verified 18+
// AND the opt-in whose sentence is pinned as "Save my jump numbers to my account. Numbers only, never video."
// (lib/privacy/scanSaveConsent.ts, "Do not paraphrase it"). A sprint time is not a jump number, and that sentence is
// consent copy this lane may not change, so nothing is sent: the history lives here, as the jump tool's standing reach
// (lib/jump/reachStore.ts) and the readiness check's device history do. The server path is ready to name (WorkoutScan
// kind 'sprint' through a route gated by canSaveScanNumbers, no new table) and waits on the owner: docs/SPRINT-SPEED.md §7.
//
// WHAT IS KEPT: times, splits, speeds, the F-V numbers and how each was read. No picture, no pose, no body mass, no
// account id. NEVER SENT (tests/sprint-speed read the source). WIPEABLE: clearRuns(). NEVER TRUSTED: a corrupt or
// out-of-range record reads as none; every storage access is in try/catch.
//
// Pure (storage is passed in).
import { toCsv } from '@/lib/csv/csv';

export const RUNS_KEY = 'fel.sprint.runs.v1';
export const MAX_RUNS = 200;

export type SprintTest = 'gate' | 'flying' | 'trace' | 'agility';
export const TEST_LABEL: Record<SprintTest, string> = { gate: 'Sprint', flying: 'Flying sprint', trace: 'Speed trace', agility: '5-10-5' };

export interface SprintRecord {
  v: 1;
  id: string;
  /** ISO time it was run. */
  at: string;
  test: SprintTest;
  /** What it was: "40 yd", "Flying 10 m", "5-10-5", "Speed trace". */
  label: string;
  distanceM: number | null;
  /** The time and its ±1 SD (s); null for a trace (it has speeds, not a time). */
  timeS: number | null;
  sdS: number | null;
  startKind: 'go' | 'movement' | 'phone' | null;
  reactionIncluded: boolean;
  splits: { label: string; s: number }[];
  topSpeed: number | null; topSpeedSd: number | null;
  vmax: number | null; vmaxSd: number | null;
  tau: number | null; f0PerKg: number | null; pmaxPerKg: number | null;
  poseHz: number;
  method: 'camera';
}

export type RunStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The page's localStorage, or null when there is none or touching it throws. */
export function runStorage(): RunStorage | null {
  try {
    const w = (globalThis as { window?: { localStorage?: RunStorage } }).window;
    const s = w?.localStorage;
    return s && typeof s.getItem === 'function' && typeof s.setItem === 'function' && typeof s.removeItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

const TESTS: readonly SprintTest[] = ['gate', 'flying', 'trace', 'agility'];
const numOrNull = (x: unknown, lo: number, hi: number): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null);

/** A record from storage, or null when anything about it is off. */
export function parseRecord(raw: unknown): SprintRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.id !== 'string' || r.id.length > 40 || typeof r.at !== 'string' || Number.isNaN(Date.parse(r.at))) return null;
  if (!TESTS.includes(r.test as SprintTest) || typeof r.label !== 'string' || r.label.length > 40 || r.method !== 'camera') return null;
  const timeS = numOrNull(r.timeS, 0.3, 120);
  if (r.test !== 'trace' && timeS === null) return null;
  const splits = Array.isArray(r.splits)
    ? (r.splits as unknown[]).flatMap((x) => {
      const s = x as { label?: unknown; s?: unknown };
      return typeof s?.label === 'string' && s.label.length <= 20 && numOrNull(s.s, 0, 120) !== null ? [{ label: s.label, s: s.s as number }] : [];
    }).slice(0, 12)
    : [];
  const sk = r.startKind;
  return {
    v: 1, id: r.id, at: r.at, test: r.test as SprintTest, label: r.label,
    distanceM: numOrNull(r.distanceM, 0, 400), timeS, sdS: numOrNull(r.sdS, 0, 5),
    startKind: sk === 'go' || sk === 'movement' || sk === 'phone' ? sk : null, reactionIncluded: r.reactionIncluded === true,
    splits,
    topSpeed: numOrNull(r.topSpeed, 0, 15), topSpeedSd: numOrNull(r.topSpeedSd, 0, 5),
    vmax: numOrNull(r.vmax, 0, 15), vmaxSd: numOrNull(r.vmaxSd, 0, 5),
    tau: numOrNull(r.tau, 0, 5), f0PerKg: numOrNull(r.f0PerKg, 0, 30), pmaxPerKg: numOrNull(r.pmaxPerKg, 0, 80),
    poseHz: numOrNull(r.poseHz, 0, 1000) ?? 0, method: 'camera',
  };
}

/** The kept runs, newest first. */
export function readRuns(store: RunStorage | null): SprintRecord[] {
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(RUNS_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.map(parseRecord).filter((x): x is SprintRecord => x !== null) : [];
  } catch {
    return [];
  }
}

/** Keep one run (newest first, at most MAX_RUNS). False when it could not be kept. */
export function keepRun(store: RunStorage | null, rec: SprintRecord): boolean {
  if (!store || !parseRecord(rec)) return false;
  try {
    const all = [rec, ...readRuns(store).filter((r) => r.id !== rec.id)].slice(0, MAX_RUNS);
    store.setItem(RUNS_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function clearRuns(store: RunStorage | null): void {
  try { store?.removeItem(RUNS_KEY); } catch { /* nothing kept to clear */ }
}

// ── CSV: the shared lib/csv (JUMP-TESTS) — formulas defused, numbers left as numbers, \r\n rows ──

const CSV_HEAD = ['date', 'test', 'what', 'distance_m', 'time_s', 'plus_minus_s', 'start', 'reaction_included', 'splits', 'top_speed_mps', 'top_speed_plus_minus', 'vmax_mps', 'vmax_plus_minus', 'tau_s', 'f0_n_per_kg', 'pmax_w_per_kg', 'pose_hz', 'method', 'note'];

const r3 = (x: number | null): number | null => (x === null ? null : Math.round(x * 1000) / 1000);

/** The runs as CSV. Every row says it is a camera estimate. */
export function runsCsv(runs: readonly SprintRecord[]): string {
  return toCsv(CSV_HEAD, runs.map((r) => [
    r.at, TEST_LABEL[r.test], r.label, r3(r.distanceM), r3(r.timeS), r3(r.sdS), r.startKind ?? '', r.reactionIncluded,
    r.splits.map((s) => `${s.label} ${s.s.toFixed(2)}`).join('; '),
    r3(r.topSpeed), r3(r.topSpeedSd), r3(r.vmax), r3(r.vmaxSd), r3(r.tau), r3(r.f0PerKg), r3(r.pmaxPerKg), r.poseHz, 'camera',
    'camera estimate; not validated against timing gates',
  ]));
}

/** A short id for a record. */
export function newRunId(now: number = Date.now(), rand: () => number = Math.random): string {
  return `s${now.toString(36)}${Math.floor(rand() * 1e6).toString(36)}`;
}
