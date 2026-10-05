import { ptParts, ptWallClockToUtc } from '@/lib/sessions/schedule';
import { SESSION_LENGTHS, type SessionLength } from './constants';

export interface WeeklyWindow {
  /** 0 = Sunday … 6 = Saturday, Pacific wall clock. */
  dow: number;
  /** Minutes from midnight PT. */
  startMin: number;
  endMin: number;
}

export interface BusyRange {
  startsAt: Date;
  endsAt: Date;
}

export interface OpenSlot {
  startsAt: Date;
  endsAt: Date;
  durationMin: SessionLength;
  /** Pacific wall time, for the label. */
  label: string;
}

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/**
 * Open 30- and 60-minute starts inside the coach's Pacific windows.
 * A time that does not exist (spring-forward gap) is dropped.
 * Two wall clocks that resolve to the same UTC instant (fall-back) become one slot.
 */
export function openSlots(input: {
  now: Date;
  weekly: WeeklyWindow[];
  blackouts: string[];
  busy: BusyRange[];
  bufferMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  durations?: readonly SessionLength[];
}): OpenSlot[] {
  const durations = input.durations ?? SESSION_LENGTHS;
  const earliest = input.now.getTime() + input.minNoticeHours * 3_600_000;
  const horizon = input.now.getTime() + input.maxDaysAhead * 86_400_000;
  const buffer = input.bufferMinutes * 60_000;
  const blackout = new Set(input.blackouts);
  const seen = new Set<string>();
  const out: OpenSlot[] = [];

  const startPt = ptParts(input.now);
  for (let day = 0; day <= input.maxDaysAhead + 1; day++) {
    const cursor = new Date(Date.UTC(startPt.y, startPt.m - 1, startPt.day + day, 12, 0, 0));
    const p = ptParts(cursor);
    const key = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    if (blackout.has(key)) continue;
    for (const window of input.weekly) {
      if (window.dow !== p.weekday) continue;
      for (let min = window.startMin; min < window.endMin; min += 30) {
        const hour = Math.floor(min / 60);
        const minute = min % 60;
        for (const durationMin of durations) {
          if (min + durationMin > window.endMin) continue;
          const startsAt = ptWallClockToUtc(p.y, p.m, p.day, hour, minute);
          const back = ptParts(startsAt);
          if (back.y !== p.y || back.m !== p.m || back.day !== p.day || back.hour !== hour || back.minute !== minute) continue;
          const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
          if (startsAt.getTime() < earliest || startsAt.getTime() > horizon) continue;
          const id = `${startsAt.toISOString()}:${durationMin}`;
          if (seen.has(id)) continue;
          const blocked = input.busy.some((b) => overlaps(
            startsAt.getTime() - buffer,
            endsAt.getTime() + buffer,
            b.startsAt.getTime(),
            b.endsAt.getTime(),
          ));
          if (blocked) continue;
          seen.add(id);
          const h12 = hour % 12 === 0 ? 12 : hour % 12;
          const ap = hour < 12 ? 'AM' : 'PM';
          out.push({
            startsAt,
            endsAt,
            durationMin,
            label: `${key} ${h12}:${String(minute).padStart(2, '0')} ${ap} PT`,
          });
        }
      }
    }
  }
  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.durationMin - b.durationMin);
  return out;
}
