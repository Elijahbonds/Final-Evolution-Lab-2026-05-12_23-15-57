// AB-04: numbers-only bodies for dunk, Prove It, and re-screen history.
//
// Idempotency matches the screen route: runId lives inside WorkoutScan.metrics, and the newest 50 rows of that
// kind are checked. Two concurrent first posts can both insert (no unique index — one on an existing table is not
// additive). A failed lookup does not insert.

import { RUN_ID_RE, SAVED_NUMBER_KINDS, type SavedNumberKind } from './scanSaveConsent';

export const NUMBER_SCAN_LOOKBACK = 50;

const MEDIA_KEY = /^(images?|videos?|frames?|landmarks?|poses?|photos?|skeletons?|keypoints?|pixels|blobs?|thumbnails?|world|frozen)$/i;
const DATA_URL = /^data:(image|video)\//i;

export function cleanRunId(v: unknown): string | null {
  return typeof v === 'string' && RUN_ID_RE.test(v) ? v : null;
}

/** True when any key is a picture, a frame, or a pose, or any string is a data-url of one. */
export function bodyHasMedia(value: unknown): boolean {
  const stack: unknown[] = [value];
  const seen = new Set<unknown>();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      stack.push(...cur);
      continue;
    }
    for (const [key, inner] of Object.entries(cur as Record<string, unknown>)) {
      if (MEDIA_KEY.test(key)) return true;
      if (typeof inner === 'string' && DATA_URL.test(inner)) return true;
      if (inner && typeof inner === 'object') stack.push(inner);
    }
  }
  return false;
}

type ScanDb = {
  workoutScan: {
    findMany: (args: {
      where: { userId: string; kind: string };
      orderBy: { createdAt: 'desc' };
      take: number;
      select: { metrics: true };
    }) => Promise<{ metrics: unknown }[]>;
  };
};

/** 'stored' — this run id is already in the lookback. 'unavailable' — do not insert. */
export async function storedRun(
  db: ScanDb,
  userId: string,
  kind: SavedNumberKind,
  runId: string,
): Promise<'new' | 'stored' | 'unavailable'> {
  try {
    const recent = await db.workoutScan.findMany({
      where: { userId, kind },
      orderBy: { createdAt: 'desc' },
      take: NUMBER_SCAN_LOOKBACK,
      select: { metrics: true },
    });
    const hit = recent.some((r) => {
      const m = r.metrics as { runId?: unknown } | null;
      return !!m && m.runId === runId;
    });
    return hit ? 'stored' : 'new';
  } catch {
    return 'unavailable';
  }
}

const BANDS = new Set(['green', 'yellow', 'red']);
const CHECK_ID = /^[A-Za-z0-9.]{1,40}$/;

export interface ScreenHistoryMetrics {
  runId: string;
  checks: { id: string; band: string | null }[];
  flags: string[];
  jumpBestIn: number | null;
}

export function screenHistoryMetrics(body: Record<string, unknown>): { ok: true; metrics: ScreenHistoryMetrics } | { ok: false; error: string } {
  const allowed = new Set(['runId', 'checks', 'flags', 'jumpBestIn']);
  if (Object.keys(body).some((k) => !allowed.has(k)) || bodyHasMedia(body)) {
    return { ok: false, error: bodyHasMedia(body) ? 'media_not_accepted' : 'unknown_field' };
  }
  const runId = cleanRunId(body.runId);
  if (!runId) return { ok: false, error: 'bad_run_id' };
  if (!Array.isArray(body.checks) || body.checks.length > 40) return { ok: false, error: 'bad_checks' };
  const checks: ScreenHistoryMetrics['checks'] = [];
  for (const c of body.checks) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, error: 'bad_checks' };
    const rec = c as Record<string, unknown>;
    if (Object.keys(rec).some((k) => k !== 'id' && k !== 'band')) return { ok: false, error: 'unknown_field' };
    if (typeof rec.id !== 'string' || !CHECK_ID.test(rec.id)) return { ok: false, error: 'bad_checks' };
    if (rec.band !== null && (typeof rec.band !== 'string' || !BANDS.has(rec.band))) return { ok: false, error: 'bad_checks' };
    checks.push({ id: rec.id, band: rec.band });
  }
  if (!Array.isArray(body.flags) || body.flags.length > 20) return { ok: false, error: 'bad_flags' };
  const flags: string[] = [];
  for (const f of body.flags) {
    if (typeof f !== 'string' || !CHECK_ID.test(f)) return { ok: false, error: 'bad_flags' };
    flags.push(f);
  }
  let jumpBestIn: number | null = null;
  if (body.jumpBestIn != null) {
    if (typeof body.jumpBestIn !== 'number' || !Number.isFinite(body.jumpBestIn) || body.jumpBestIn < 0 || body.jumpBestIn > 80) {
      return { ok: false, error: 'bad_jump' };
    }
    jumpBestIn = Math.round(body.jumpBestIn * 10) / 10;
  }
  return { ok: true, metrics: { runId, checks, flags, jumpBestIn } };
}

export interface ProveItMetrics {
  runId: string;
  verticalCm: number;
  flightTimeMs: number;
  takeoff: 'one-foot' | 'two-foot';
  landingStability: number;
  family: string;
  judgesScore: number;
}

export function proveItMetrics(
  body: Record<string, unknown>,
  limits: { maxVerticalCm: number; maxFlightMs: number; families: ReadonlySet<string> },
): { ok: true; metrics: ProveItMetrics } | { ok: false; error: string } {
  const allowed = new Set(['runId', 'verticalCm', 'flightTimeMs', 'takeoff', 'landingStability', 'family', 'judgesScore']);
  if (Object.keys(body).some((k) => !allowed.has(k))) return { ok: false, error: 'unknown_field' };
  if (bodyHasMedia(body)) return { ok: false, error: 'media_not_accepted' };
  const runId = cleanRunId(body.runId);
  if (!runId) return { ok: false, error: 'bad_run_id' };
  const verticalCm = Number(body.verticalCm);
  const flightTimeMs = Number(body.flightTimeMs);
  if (!Number.isFinite(verticalCm) || verticalCm <= 0 || verticalCm > limits.maxVerticalCm) return { ok: false, error: 'implausible_vertical' };
  if (!Number.isFinite(flightTimeMs) || flightTimeMs <= 0 || flightTimeMs > limits.maxFlightMs) return { ok: false, error: 'implausible_flight' };
  if (body.takeoff !== 'one-foot' && body.takeoff !== 'two-foot') return { ok: false, error: 'bad_takeoff' };
  const landingStability = Number(body.landingStability);
  if (!Number.isFinite(landingStability) || landingStability < 0 || landingStability > 1) return { ok: false, error: 'bad_landing' };
  if (typeof body.family !== 'string' || !limits.families.has(body.family)) return { ok: false, error: 'bad_family' };
  const judgesScore = Number(body.judgesScore);
  if (!Number.isInteger(judgesScore) || judgesScore < 0 || judgesScore > 50) return { ok: false, error: 'bad_judges' };
  return {
    ok: true,
    metrics: {
      runId,
      verticalCm: Math.round(verticalCm * 10) / 10,
      flightTimeMs: Math.round(flightTimeMs),
      takeoff: body.takeoff,
      landingStability: Math.round(landingStability * 100) / 100,
      family: body.family,
      judgesScore,
    },
  };
}

export function isSavedNumberKind(k: string): k is SavedNumberKind {
  return (SAVED_NUMBER_KINDS as readonly string[]).includes(k);
}

/** The account list: numbers and a time. Raw metrics are not returned. */
export function projectSavedNumber(row: { id: string; kind: string; createdAt: Date; metrics: unknown }): {
  id: string;
  kind: string;
  at: string;
  numbers: Record<string, string | number | null>;
} | null {
  if (!isSavedNumberKind(row.kind)) return null;
  const m = (row.metrics ?? {}) as Record<string, unknown>;
  const num = (k: string): number | null => (typeof m[k] === 'number' && Number.isFinite(m[k] as number) ? m[k] as number : null);
  const str = (k: string): string | null => (typeof m[k] === 'string' ? (m[k] as string).slice(0, 80) : null);
  if (row.kind === 'dunk' || row.kind === 'prove_it') {
    return {
      id: row.id,
      kind: row.kind,
      at: row.createdAt.toISOString(),
      numbers: {
        verticalCm: num('verticalCm'),
        flightTimeMs: num('flightTimeMs'),
        family: str('family'),
        judgesScore: row.kind === 'prove_it' ? num('judgesScore') : null,
        takeoff: row.kind === 'prove_it' ? str('takeoff') : null,
        landingStability: row.kind === 'prove_it' ? num('landingStability') : null,
      },
    };
  }
  const flags = Array.isArray(m.flags) ? m.flags.filter((f): f is string => typeof f === 'string').slice(0, 20) : [];
  return {
    id: row.id,
    kind: row.kind,
    at: row.createdAt.toISOString(),
    numbers: {
      jumpBestIn: num('jumpBestIn'),
      flagCount: flags.length,
      flags: flags.join(','),
    },
  };
}
