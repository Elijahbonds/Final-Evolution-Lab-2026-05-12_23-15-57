import { ptParts } from '@/lib/sessions/schedule';
import type { WeeklyWindow } from './slots';

/**
 * COACH-HOURS-SETTINGS: pure validation for Instructor.weeklyHours / Instructor.blackoutDates.
 * Never throws; callers write only on { ok: true }. Mirrors the 30-minute step openSlots()
 * already uses (lib/coach-store/slots.ts) so a saved window always lines up with real slots.
 * All times here are Pacific wall clock — see Known gaps for Instructor.timeZone.
 */

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; detail?: string };

const MAX_WINDOWS_PER_DAY = 6;
const MAX_WINDOWS_TOTAL = 42;
const MAX_BLACKOUT_DATES = 120;
const MAX_BLACKOUT_DAYS_AHEAD = 400;

export function validateWeeklyHours(raw: unknown): ValidationResult<WeeklyWindow[]> {
  if (!Array.isArray(raw)) return { ok: false, error: 'weeklyHours_invalid', detail: 'expected an array' };
  if (raw.length > MAX_WINDOWS_TOTAL) {
    return { ok: false, error: 'weeklyHours_too_many', detail: `at most ${MAX_WINDOWS_TOTAL} windows total` };
  }
  const windows: WeeklyWindow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') return { ok: false, error: 'weeklyHours_invalid', detail: 'each window must be an object' };
    const r = row as { dow?: unknown; startMin?: unknown; endMin?: unknown };
    const { dow, startMin, endMin } = r;
    if (!Number.isInteger(dow) || (dow as number) < 0 || (dow as number) > 6) {
      return { ok: false, error: 'weeklyHours_invalid', detail: 'dow must be an integer 0..6' };
    }
    if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) {
      return { ok: false, error: 'weeklyHours_invalid', detail: 'startMin/endMin must be integers' };
    }
    const s = startMin as number;
    const e = endMin as number;
    if (s < 0 || e > 1440 || s >= e) {
      return { ok: false, error: 'weeklyHours_invalid', detail: '0 <= startMin < endMin <= 1440' };
    }
    if (s % 30 !== 0 || e % 30 !== 0) {
      return { ok: false, error: 'weeklyHours_invalid', detail: 'startMin/endMin must be 30-minute boundaries' };
    }
    if (e - s < 30) {
      return { ok: false, error: 'weeklyHours_invalid', detail: 'a window must be at least 30 minutes' };
    }
    windows.push({ dow: dow as number, startMin: s, endMin: e });
  }
  windows.sort((a, b) => a.dow - b.dow || a.startMin - b.startMin);
  const perDay = new Map<number, number>();
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    perDay.set(w.dow, (perDay.get(w.dow) ?? 0) + 1);
    if ((perDay.get(w.dow) ?? 0) > MAX_WINDOWS_PER_DAY) {
      return { ok: false, error: 'weeklyHours_too_many', detail: `at most ${MAX_WINDOWS_PER_DAY} windows per day` };
    }
    const next = windows[i + 1];
    if (next && next.dow === w.dow && next.startMin < w.endMin) {
      return { ok: false, error: 'weeklyHours_overlap', detail: `overlapping windows on dow ${w.dow}` };
    }
  }
  return { ok: true, value: windows };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealCalendarDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth;
}

export function validateBlackoutDates(raw: unknown, now: Date): ValidationResult<string[]> {
  if (!Array.isArray(raw)) return { ok: false, error: 'blackoutDates_invalid', detail: 'expected an array' };
  if (raw.length > MAX_BLACKOUT_DATES) {
    return { ok: false, error: 'blackoutDates_too_many', detail: `at most ${MAX_BLACKOUT_DATES} dates` };
  }
  const today = ptParts(now);
  const todayKey = `${today.y}-${String(today.m).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
  const todayUtcDay = Date.UTC(today.y, today.m - 1, today.day);
  const maxUtcDay = todayUtcDay + MAX_BLACKOUT_DAYS_AHEAD * 86_400_000;

  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') return { ok: false, error: 'blackoutDates_invalid', detail: 'each entry must be a string' };
    const m = DATE_RE.exec(entry);
    if (!m) return { ok: false, error: 'blackoutDates_invalid', detail: `bad format: ${entry}` };
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (!isRealCalendarDate(y, mo, d)) return { ok: false, error: 'blackoutDates_invalid', detail: `not a real date: ${entry}` };
    const entryUtcDay = Date.UTC(y, mo - 1, d);
    if (entry !== todayKey && entryUtcDay < todayUtcDay) {
      return { ok: false, error: 'blackoutDates_past', detail: `${entry} is in the past` };
    }
    if (entryUtcDay > maxUtcDay) {
      return { ok: false, error: 'blackoutDates_too_far', detail: `${entry} is more than ${MAX_BLACKOUT_DAYS_AHEAD} days ahead` };
    }
    seen.add(entry);
  }
  const value = Array.from(seen).sort();
  return { ok: true, value };
}
