/**
 * Bookable slots from a profile's weekly open hours.
 *
 * Hours are wall-clock times in the profile's time zone. A slot is valid only if the server generates it
 * from those hours: the checkout never trusts a start time just because the browser sent one.
 *
 * Every profile has a fixed grid (`slotMinutes`). A booking takes every cell it covers, so a 60-minute
 * session at 16:00 and a 30-minute call at 16:30 collide on the 16:30 cell. Cell ids are
 * `<profileSlug>_<epoch ms>`; the epoch is 13 digits until the year 2286, so ids sort in time order.
 */

import { minutesOfDay, type CreatorProfile, type CreatorService } from './creatorCatalog';

export interface Slot {
  start: string; // ISO, UTC
  end: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

interface WallTime { year: number; month: number; day: number; minute: number }

function wallTime(timeZone: string, utcMs: number): WallTime {
  const parts = formatter(timeZone).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const hour = get('hour') % 24;
  return { year: get('year'), month: get('month'), day: get('day'), minute: hour * 60 + get('minute') };
}

function offsetMs(timeZone: string, utcMs: number): number {
  const w = wallTime(timeZone, utcMs);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, 0, w.minute);
  return asUtc - Math.floor(utcMs / 60_000) * 60_000;
}

/**
 * The UTC instant of a wall-clock time in a zone, or null when that wall time does not exist
 * (the hour skipped by a spring-forward change).
 */
export function zonedWallTimeToUtc(timeZone: string, year: number, month: number, day: number, minute: number): number | null {
  const guess = Date.UTC(year, month - 1, day, 0, minute);
  let utc = guess - offsetMs(timeZone, guess);
  const second = guess - offsetMs(timeZone, utc);
  if (second !== utc) utc = second;
  const check = wallTime(timeZone, utc);
  if (check.year !== year || check.month !== month || check.day !== day || check.minute !== minute) return null;
  return utc;
}

export function cellId(profileSlug: string, cellStartMs: number): string {
  return `${profileSlug}_${String(cellStartMs).padStart(13, '0')}`;
}

export function cellIdsFor(profile: CreatorProfile, startMs: number, durationMinutes: number): string[] {
  const step = profile.slotMinutes * 60_000;
  const count = Math.ceil(durationMinutes / profile.slotMinutes);
  return Array.from({ length: count }, (_, i) => cellId(profile.slug, startMs + i * step));
}

/** Every slot the hours allow for this service, from now + lead to the horizon. No availability check. */
export function candidateSlots(profile: CreatorProfile, service: CreatorService, now: Date): Slot[] {
  const earliest = now.getTime() + profile.leadMinutes * 60_000;
  const latest = now.getTime() + profile.horizonDays * 86_400_000;
  const today = wallTime(profile.timeZone, now.getTime());
  const out: Slot[] = [];
  for (let offset = 0; offset <= profile.horizonDays; offset += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const weekday = date.getUTCDay();
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    for (const window of profile.weeklyHours) {
      if (window.weekday !== weekday) continue;
      const open = minutesOfDay(window.start);
      const close = minutesOfDay(window.end);
      for (let start = open; start + service.durationMinutes <= close; start += profile.slotMinutes) {
        const startMs = zonedWallTimeToUtc(profile.timeZone, y, m, d, start);
        const endMs = zonedWallTimeToUtc(profile.timeZone, y, m, d, start + service.durationMinutes);
        if (startMs == null || endMs == null) continue;
        if (endMs - startMs !== service.durationMinutes * 60_000) continue; // straddles a clock change
        if (startMs < earliest || startMs > latest) continue;
        out.push({ start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() });
      }
    }
  }
  out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return out;
}

/** Slots whose cells are all free. `taken` holds cell ids that are held or booked right now. */
export function freeSlots(profile: CreatorProfile, service: CreatorService, now: Date, taken: ReadonlySet<string>): Slot[] {
  return candidateSlots(profile, service, now).filter((slot) =>
    cellIdsFor(profile, Date.parse(slot.start), service.durationMinutes).every((id) => !taken.has(id)),
  );
}

export type SlotCheck =
  | { ok: true; startMs: number; endMs: number; cellIds: string[] }
  | { ok: false; reason: 'bad_format' | 'not_offered' };

/** The server-side check for a requested start: it must be one of the generated slots, exactly. */
export function validateSlot(profile: CreatorProfile, service: CreatorService, slotStart: unknown, now: Date): SlotCheck {
  if (typeof slotStart !== 'string' || slotStart.length > 40) return { ok: false, reason: 'bad_format' };
  const startMs = Date.parse(slotStart);
  if (!Number.isFinite(startMs)) return { ok: false, reason: 'bad_format' };
  const iso = new Date(startMs).toISOString();
  const match = candidateSlots(profile, service, now).find((s) => s.start === iso);
  if (!match) return { ok: false, reason: 'not_offered' };
  return { ok: true, startMs, endMs: Date.parse(match.end), cellIds: cellIdsFor(profile, startMs, service.durationMinutes) };
}

/** The cell-id range to scan for a profile's taken cells across the whole horizon. */
export function cellRange(profile: CreatorProfile, now: Date): { from: string; to: string } {
  const from = now.getTime() - 86_400_000;
  const to = now.getTime() + (profile.horizonDays + 2) * 86_400_000;
  return { from: cellId(profile.slug, from), to: cellId(profile.slug, to) };
}

export function formatSlot(slot: Slot, timeZone: string): { day: string; time: string } {
  const start = new Date(slot.start);
  return {
    day: new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(start),
    time: new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(start),
  };
}
