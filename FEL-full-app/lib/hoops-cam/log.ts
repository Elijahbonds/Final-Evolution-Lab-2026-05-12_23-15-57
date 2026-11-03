// lib/hoops-cam/log.ts — basketball on the camera (BBS, 2026-10-26): the shot log, the shot chart's numbers and the
// make-% trend.
//
// A SESSION is one camera run: its shots (when, made or not, corrected by a tap or not, the spot when there was one)
// or its dribbles (count, crossovers, rate, rhythm). NUMBERS ONLY — never a frame. Kept on the phone for an adult
// (keepsSessions, gate.ts; localStorage under DEVICE_KEY, the newest DEVICE_MAX); a teen's are not kept anywhere.
// `cleanSession` is the one shape check, for what comes back from storage and what a server would take.
//
// Pure (storage is passed in; lib/vbt/sets.ts deviceStorage() is the browser's).
import type { StorageLike } from '@/lib/vbt/sets';
import { isPlacement, zoneOf, ZONE_IDS, type Placement, type Zone } from './spot';

export interface LoggedShot {
  /** ms from the session's start. */
  t: number;
  made: boolean;
  /** The player tapped to set or fix it (a NOT SURE read, or a correction). */
  fixed: boolean;
  /** Court spot (m), when the pose gave one. */
  x: number | null;
  z: number | null;
}

export interface ShotSession {
  kind: 'shots';
  /** Local day (YYYY-MM-DD) and the start (epoch ms). */
  day: string;
  at: number;
  placement: Placement;
  shots: LoggedShot[];
}

export interface DribbleSession {
  kind: 'dribble';
  day: string;
  at: number;
  count: number;
  crossovers: number;
  left: number;
  right: number;
  rateHz: number | null;
  rhythmCv: number | null;
  /** Seconds of dribbling read. */
  sec: number;
}

export type HoopsSession = ShotSession | DribbleSession;

export const DEVICE_KEY = 'fel.hoopscam.sessions.v1';
/** (new) The newest sessions kept on the phone. */
export const DEVICE_MAX = 200;
/** (new) A session's shot cap (a long gym hour is ~300). */
export const MAX_SHOTS = 600;

const num = (x: unknown, lo: number, hi: number): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function cleanSession(x: unknown): HoopsSession | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const day = typeof o.day === 'string' && DAY.test(o.day) ? o.day : null;
  const at = num(o.at, 1e12, 1e13);
  if (!day || at === null) return null;
  if (o.kind === 'shots') {
    if (!isPlacement(o.placement) || !Array.isArray(o.shots) || o.shots.length > MAX_SHOTS) return null;
    const shots: LoggedShot[] = [];
    for (const s of o.shots as unknown[]) {
      if (!s || typeof s !== 'object') return null;
      const k = s as Record<string, unknown>;
      const t = num(k.t, 0, 86_400_000);
      if (t === null || typeof k.made !== 'boolean') return null;
      const sx = num(k.x, -8, 8), sz = num(k.z, -2, 13);
      shots.push({ t: Math.round(t), made: k.made, fixed: k.fixed === true, x: sx !== null && sz !== null ? sx : null, z: sx !== null && sz !== null ? sz : null });
    }
    return { kind: 'shots', day, at, placement: o.placement, shots };
  }
  if (o.kind === 'dribble') {
    const count = num(o.count, 0, 100_000), cross = num(o.crossovers, 0, 100_000), left = num(o.left, 0, 100_000), right = num(o.right, 0, 100_000), sec = num(o.sec, 0, 86_400);
    if (count === null || cross === null || left === null || right === null || sec === null || cross > count) return null;
    return { kind: 'dribble', day, at, count, crossovers: cross, left, right, rateHz: num(o.rateHz, 0, 20), rhythmCv: num(o.rhythmCv, 0, 1000), sec };
  }
  return null;
}

export function readDeviceSessions(s: StorageLike | null): HoopsSession[] {
  if (!s) return [];
  try {
    const raw = JSON.parse(s.getItem(DEVICE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.map(cleanSession).filter((x): x is HoopsSession => !!x) : [];
  } catch { return []; }
}

export function keepDeviceSession(s: StorageLike | null, session: HoopsSession): boolean {
  if (!s) return false;
  const clean = cleanSession(session);
  if (!clean) return false;
  try {
    const all = [clean, ...readDeviceSessions(s)].sort((a, b) => b.at - a.at).slice(0, DEVICE_MAX);
    s.setItem(DEVICE_KEY, JSON.stringify(all));
    return true;
  } catch { return false; }
}

export function clearDeviceSessions(s: StorageLike | null): void { try { s?.removeItem(DEVICE_KEY); } catch { /* nothing kept */ } }

// ── the chart's and the trend's numbers ─────────────────────────────────────────────────────────────────────────────

export interface Tally { made: number; taken: number }
export const tally = (shots: readonly Pick<LoggedShot, 'made'>[]): Tally => ({ made: shots.filter((s) => s.made).length, taken: shots.length });

/** Made / taken by zone (shots with no spot are left out of the zones, kept in the totals). */
export function byZone(shots: readonly LoggedShot[]): Record<Zone, Tally> {
  const out = Object.fromEntries(ZONE_IDS.map((z) => [z, { made: 0, taken: 0 }])) as Record<Zone, Tally>;
  for (const s of shots) {
    if (s.x === null || s.z === null) continue;
    const z = zoneOf(s.x, s.z);
    out[z].taken++;
    if (s.made) out[z].made++;
  }
  return out;
}

export interface TrendDay { day: string; made: number; taken: number; pct: number }

/** Make % a day over the last `days` days that had shots, oldest first. */
export function trend(sessions: readonly HoopsSession[], days = 14): TrendDay[] {
  const m = new Map<string, Tally>();
  for (const s of sessions) {
    if (s.kind !== 'shots' || !s.shots.length) continue;
    const t = m.get(s.day) ?? { made: 0, taken: 0 };
    const k = tally(s.shots);
    m.set(s.day, { made: t.made + k.made, taken: t.taken + k.taken });
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-days)
    .map(([day, t]) => ({ day, made: t.made, taken: t.taken, pct: Math.round((t.made / t.taken) * 1000) / 10 }));
}
